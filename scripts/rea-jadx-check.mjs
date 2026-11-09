// Prove the jadx bridge actually decompiles an APK through REA.
import { spawn } from "node:child_process";

const SCRIPT = "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\dcfa3d392dc3d0e3\\node_modules\\rea-agents\\scripts\\rea.mjs";
const APK = "C:\\Tools\\apk-test\\dicer.apk";

const env = {
  SystemRoot: "C:\\Windows",
  SystemDrive: "C:",
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  USERPROFILE: "C:\\Users\\piotr",
  APPDATA: "C:\\Users\\piotr\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\piotr\\AppData\\Local",
  PATHEXT: ".COM;.EXE;.BAT;.CMD",
  GHIDRA_INSTALL_DIR: "C:\\ghidra",
  JAVA_HOME: "C:\\Tools\\jdk21\\jdk-21.0.13+9",
  REA_JADX_MCP_JAR: "C:\\Users\\piotr\\.local\\share\\rea\\android\\jadx-headless-mcp-0.7.1-all.jar",
  PATH: "C:\\Tools\\jdk21\\jdk-21.0.13+9\\bin;C:\\Program Files\\nodejs;C:\\Windows\\system32;C:\\Windows",
};

const child = spawn("C:\\Program Files\\nodejs\\node.exe", [SCRIPT, "mcp"], { env, stdio: ["pipe", "pipe", "pipe"] });

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
    clientInfo: { name: "jadx-check", version: "1.0.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  console.log("server:", JSON.stringify(init.serverInfo));

  const sess = await rpc("tools/call", { name: "binary_session", arguments: {} });
  const st = sess.content?.[0]?.text ?? "";
  const jadx = st.match(/"id":"jadx"[\s\S]{0,300}?"status":"([a-z]+)"/);
  console.log("jadx status:", jadx ? jadx[1] : "not found");

  console.log("\n== inspect_android_package ==");
  const r = await rpc("tools/call", {
    name: "inspect_android_package",
    arguments: { path: APK, detail: "summary" },
  });
  const txt = r.content?.[0]?.text ?? JSON.stringify(r);
  console.log(txt.slice(0, 2500));

  console.log("\nJADX CHECK: PASS");
} catch (e) {
  console.log("\nJADX CHECK: FAIL ->", e.message);
  if (errs.length) console.log("stderr:", errs.join("").slice(0, 2000));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1200);
}
