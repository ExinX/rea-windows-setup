// Test the Windows-capable providers: pcap (absolute tshark) and WASM (WABT).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const SCRIPT = "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\dcfa3d392dc3d0e3\\node_modules\\rea-agents\\scripts\\rea.mjs";

// Build a tiny valid WASM module: (module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
const wasmBytes = Buffer.from(
  "0061736d0100000001070160027f7f017f030201000707010361646400000a09010700200020016a0b",
  "hex"
);
mkdirSync("C:\\Tools\\wasm-test", { recursive: true });
writeFileSync("C:\\Tools\\wasm-test\\add.wasm", wasmBytes);

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
  REA_APKTOOL_COMMAND: "C:\\Tools\\apktool\\apktool.cmd",
  REA_WAKARU_COMMAND: "C:\\Users\\piotr\\AppData\\Roaming\\npm\\wakaru.cmd",
  REA_BROWSER_EXECUTABLE: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  REA_TSHARK_COMMAND: "C:\\Program Files\\Wireshark\\tshark.exe",
  REA_CAPINFOS_COMMAND: "C:\\Program Files\\Wireshark\\capinfos.exe",
  REA_WABT_BIN_DIRECTORY: "C:\\Tools\\wabt\\wabt-1.0.42\\bin",
  PATH: "C:\\Tools\\jdk21\\jdk-21.0.13+9\\bin;C:\\Program Files\\nodejs;C:\\Users\\piotr\\AppData\\Roaming\\npm;C:\\Tools\\apktool;C:\\Program Files\\Wireshark;C:\\Tools\\wabt\\wabt-1.0.42\\bin;C:\\Windows\\system32;C:\\Windows",
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

async function call(name, args) {
  try {
    const r = await rpc("tools/call", { name, arguments: args });
    const txt = r.content?.[0]?.text ?? JSON.stringify(r);
    const isErr = r.isError === true || /^\{"error":/.test(txt.trim());
    return { ok: !isErr, txt };
  } catch (e) {
    return { ok: false, txt: e.message };
  }
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "win-capability-check", version: "1.0.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  console.log("server:", JSON.stringify(init.serverInfo));

  console.log("\n== inspect_pcap_capture (absolute tshark) ==");
  const p = await call("inspect_pcap_capture", { path: "C:\\Tools\\pcap-test\\sample.pcapng" });
  console.log(p.ok ? "PASS" : "FAIL", "|", p.txt.slice(0, 600).replace(/\s+/g, " "));

  console.log("\n== inspect_wasm_artifact ==");
  const w = await call("inspect_wasm_artifact", { path: "C:\\Tools\\wasm-test\\add.wasm" });
  console.log(w.ok ? "PASS" : "FAIL", "|", w.txt.slice(0, 600).replace(/\s+/g, " "));

  console.log("\n== compare_wasm_interfaces ==");
  const c = await call("compare_wasm_interfaces", {
    left_path: "C:\\Tools\\wasm-test\\add.wasm",
    right_path: "C:\\Tools\\wasm-test\\add.wasm",
  });
  console.log(c.ok ? "PASS" : "FAIL", "|", c.txt.slice(0, 400).replace(/\s+/g, " "));

  console.log("\nDONE");
} catch (e) {
  console.log("\nFATAL:", e.message);
  if (errs.length) console.log("stderr:", errs.join("").slice(0, 1500));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1200);
}
