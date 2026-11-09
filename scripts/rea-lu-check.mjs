// Verify LU's own pinned REA (6.5.0) can see Ghidra through the C:\ghidra junction.
// This is the exact code path LU's built-in REA plugin uses.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATES = [
  "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\dcfa3d392dc3d0e3\\node_modules\\rea-agents\\scripts\\rea.mjs",
  "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\af752b90495482d7\\node_modules\\rea-agents\\scripts\\rea.mjs",
  "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\da7caeae9db9c589\\node_modules\\rea-agents\\scripts\\rea.mjs",
];

const script = CANDIDATES.find((p) => existsSync(p));
if (!script) {
  console.log("no cached rea.mjs found");
  process.exit(1);
}
console.log("using:", script);

const env = {
  SystemRoot: "C:\\Windows",
  SystemDrive: "C:",
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  USERPROFILE: "C:\\Users\\piotr",
  APPDATA: "C:\\Users\\piotr\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\piotr\\AppData\\Local",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  // Exactly what LU's plugin would supply: the junction path, not C:\Tools.
  GHIDRA_INSTALL_DIR: "C:\\ghidra",
  JAVA_HOME: "C:\\Tools\\jdk21\\jdk-21.0.13+9",
  PATH: "C:\\Tools\\jdk21\\jdk-21.0.13+9\\bin;C:\\Program Files\\nodejs;C:\\Windows\\system32;C:\\Windows",
};

const child = spawn("C:\\Program Files\\nodejs\\node.exe", [script, "mcp"], {
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

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
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
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
    clientInfo: { name: "lu-rea-check", version: "1.0.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  console.log("server:", JSON.stringify(init.serverInfo));

  const tools = await rpc("tools/list", {});
  console.log("tools:", tools.tools.length);

  const sess = await rpc("tools/call", { name: "binary_session", arguments: {} });
  const t = sess.content?.[0]?.text ?? "";
  const ghidraBlock = t.match(/"id":"ghidra"[\s\S]{0,300}?"status":"([a-z]+)"/);
  console.log("ghidra status:", ghidraBlock ? ghidraBlock[1] : "not found");

  const opened = await rpc("tools/call", { name: "open_binary", arguments: { path: "C:\\Windows\\System32\\notepad.exe" } });
  console.log("open_binary:", (opened.content?.[0]?.text ?? "").slice(0, 300));

  const ov = await rpc("tools/call", { name: "binary_overview", arguments: {} });
  const ovt = ov.content?.[0]?.text ?? "";
  const m = ovt.match(/"procedure_count":(\d+)/);
  console.log("procedure_count:", m ? m[1] : "n/a");
  const pv = ovt.match(/"provider":\{"id":"ghidra","name":"Ghidra","version":"([^"]+)"\}/);
  console.log("ghidra version used:", pv ? pv[1] : "n/a");

  await rpc("tools/call", { name: "close_binary", arguments: {} });
  console.log("\nLU-PATH CHECK: PASS");
} catch (e) {
  console.log("\nLU-PATH CHECK: FAIL ->", e.message);
  if (errs.length) console.log("stderr:", errs.join("").slice(0, 1500));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1200);
}
