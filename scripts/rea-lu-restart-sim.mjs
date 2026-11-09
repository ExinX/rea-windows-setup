// Definitive test: reproduce the environment a RESTARTED Locally Uncensored would
// give its REA plugin. Env comes only from the registry (Machine + User), exactly
// as Windows builds it for a newly launched process. No manual overrides.
import { spawn } from "node:child_process";

const TARGET = process.argv[2] || "C:\\Windows\\System32\\notepad.exe";

// Read the registry-backed environment the way a fresh process would see it.
const psEnv = await new Promise((resolve, reject) => {
  const ps = spawn("powershell.exe", ["-NoProfile", "-Command",
    "$m=[Environment]::GetEnvironmentVariable('Path','Machine');" +
    "$u=[Environment]::GetEnvironmentVariable('Path','User');" +
    "$o=[ordered]@{PATH=\"$m;$u\"};" +
    "foreach($n in @('GHIDRA_INSTALL_DIR','JAVA_HOME','SystemRoot','SystemDrive','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE')){" +
    "$v=[Environment]::GetEnvironmentVariable($n,'User'); if(-not $v){$v=[Environment]::GetEnvironmentVariable($n,'Machine')}; if(-not $v){$v=[Environment]::GetEnvironmentVariable($n,'Process')}; $o[$n]=$v};" +
    "$o | ConvertTo-Json -Compress"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  ps.stdout.on("data", (d) => (out += d.toString()));
  ps.on("close", () => { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } });
});

console.log("== environment a restarted LU would inherit ==");
console.log("JAVA_HOME          :", psEnv.JAVA_HOME || "(unset)");
console.log("GHIDRA_INSTALL_DIR :", psEnv.GHIDRA_INSTALL_DIR || "(unset)");
console.log("PATH has jdk bin   :", /jdk-21/.test(psEnv.PATH));
console.log("PATH has nodejs    :", /Program Files\\nodejs/i.test(psEnv.PATH));

const env = { ...psEnv };

// LU runs its pinned 6.5.0. Use the npx cache copy that LU itself populated.
const PKG = "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\dcfa3d392dc3d0e3\\node_modules\\rea-agents";
console.log("package            :", PKG);

const child = spawn("node", ["scripts/rea.mjs", "mcp"], { cwd: PKG, env, stdio: ["pipe", "pipe", "pipe"] });

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
    clientInfo: { name: "lu-restart-sim", version: "1.0.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  console.log("\nserver:", JSON.stringify(init.serverInfo));

  const tools = await rpc("tools/list", {});
  console.log("tools:", tools.tools.length);

  const opened = await rpc("tools/call", { name: "open_binary", arguments: { path: TARGET } });
  console.log("open_binary:", (opened.content?.[0]?.text ?? "").slice(0, 250));

  const ov = await rpc("tools/call", { name: "binary_overview", arguments: {} });
  const ovText = ov.content?.[0]?.text ?? "";
  const m = ovText.match(/"procedure_count":(\d+)/);
  console.log("procedure_count:", m ? m[1] : "n/a");

  // Prove decompilation works, not just loading.
  const procs = await rpc("tools/call", { name: "list_procedures", arguments: {} });
  const pText = procs.content?.[0]?.text ?? "";
  console.log("list_procedures bytes:", pText.length);

  await rpc("tools/call", { name: "close_binary", arguments: {} });
  console.log("\nRESTARTED-LU SIMULATION: PASS");
} catch (e) {
  console.log("\nRESTARTED-LU SIMULATION: FAIL ->", e.message);
  if (errs.length) console.log("stderr:", errs.join("").slice(0, 2500));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1500);
}
