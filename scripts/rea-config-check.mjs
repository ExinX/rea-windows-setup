// Verify .claude.json is self-sufficient: spawn the configured command using
// ONLY the env declared in the config (plus minimal Windows system vars),
// with a deliberately stripped PATH. Then analyze a real binary.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const CFG = "C:\\Users\\piotr\\.claude.json";
const TARGET = process.argv[2] || "C:\\Windows\\System32\\notepad.exe";

const cfg = JSON.parse(readFileSync(CFG, "utf8"));
const srv = cfg.mcpServers.rea;
if (!srv) throw new Error("no rea server in config");

// Minimal base: no inherited PATH, no inherited JAVA_HOME/GHIDRA_INSTALL_DIR.
const baseEnv = {
  SystemRoot: "C:\\Windows",
  SystemDrive: "C:",
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  USERPROFILE: "C:\\Users\\piotr",
  APPDATA: "C:\\Users\\piotr\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\piotr\\AppData\\Local",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  NUMBER_OF_PROCESSORS: "8",
  PROCESSOR_ARCHITECTURE: "AMD64",
};
const env = { ...baseEnv, ...(srv.env || {}) };

console.log("== spawning with config env only ==");
console.log("command:", srv.command, srv.args.join(" "));
console.log("PATH:", env.PATH);
console.log("GHIDRA_INSTALL_DIR:", env.GHIDRA_INSTALL_DIR);
console.log("JAVA_HOME:", env.JAVA_HOME);

const child = spawn(srv.command, srv.args, { env, stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  }
});

const errs = [];
child.stderr.on("data", (d) => errs.push(d.toString("utf8")));

function rpc(method, params, timeoutMs = 900000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, timeoutMs);
    pending.set(id, {
      resolve: (v) => { clearTimeout(t); resolve(v); },
      reject: (e) => { clearTimeout(t); reject(e); },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "rea-config-check", version: "1.0.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  console.log("\nserver:", JSON.stringify(init.serverInfo));

  const tools = await rpc("tools/list", {});
  console.log("tools:", tools.tools.length);

  const sess = await rpc("tools/call", { name: "binary_session", arguments: {} });
  const sessText = sess.content?.[0]?.text ?? "";
  const ghidraOk = /"id":"ghidra"[\s\S]{0,400}?"status":"available"/.test(sessText)
    || /ghidra[\s\S]{0,300}available/.test(sessText);
  console.log("ghidra available in live session:", ghidraOk);

  const opened = await rpc("tools/call", { name: "open_binary", arguments: { path: TARGET } });
  console.log("open_binary:", (opened.content?.[0]?.text ?? "").slice(0, 400));

  const ov = await rpc("tools/call", { name: "binary_overview", arguments: {} });
  const ovText = ov.content?.[0]?.text ?? "";
  const m = ovText.match(/"procedure_count":(\d+)/) || ovText.match(/"procedures":(\d+)/);
  console.log("binary_overview bytes:", ovText.length, "| procedure_count:", m ? m[1] : "n/a");
  console.log("provider:", (ovText.match(/"provider":\{[^}]*\}/) || ["n/a"])[0]);

  await rpc("tools/call", { name: "close_binary", arguments: {} });

  console.log("\nCONFIG CHECK: PASS");
} catch (e) {
  console.log("\nCONFIG CHECK: FAIL ->", e.message);
  if (errs.length) console.log("stderr:", errs.join("").slice(0, 2000));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1500);
}
