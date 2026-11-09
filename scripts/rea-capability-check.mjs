// Verify the newly installed REA capability tools actually work end-to-end.
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
  REA_APKTOOL_COMMAND: "C:\\Tools\\apktool\\apktool.cmd",
  REA_WAKARU_COMMAND: "C:\\Users\\piotr\\AppData\\Roaming\\npm\\wakaru.cmd",
  REA_BROWSER_EXECUTABLE: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  REA_TSHARK_COMMAND: "C:\\Program Files\\Wireshark\\tshark.exe",
  REA_CAPINFOS_COMMAND: "C:\\Program Files\\Wireshark\\capinfos.exe",
  PATH: "C:\\Tools\\jdk21\\jdk-21.0.13+9\\bin;C:\\Program Files\\nodejs;C:\\Users\\piotr\\AppData\\Roaming\\npm;C:\\Tools\\apktool;C:\\Program Files\\Wireshark;C:\\Windows\\system32;C:\\Windows",
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
    const isErr = r.isError === true || /"error":\{/.test(txt.slice(0, 200));
    return { ok: !isErr, txt };
  } catch (e) {
    return { ok: false, txt: e.message };
  }
}

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "capability-check", version: "1.0.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  console.log("server:", JSON.stringify(init.serverInfo));

  console.log("\n== decode_android_resources (apktool) ==");
  const a = await call("decode_android_resources", { path: APK, include_strings: true });
  console.log(a.ok ? "PASS" : "FAIL", "|", a.txt.slice(0, 500).replace(/\s+/g, " "));

  console.log("\n== inspect_packet_capture (tshark) ==");
  const p = await call("inspect_packet_capture", {
    path: "C:\\Tools\\pcap-test\\sample.pcapng",
    fields: ["frame.number", "ip.src", "ip.dst"],
  });
  console.log(p.ok ? "PASS" : "FAIL", "|", p.txt.slice(0, 400).replace(/\s+/g, " "));

  console.log("\n== inspect_android_package (jadx) ==");
  const j = await call("inspect_android_package", { path: APK, detail: "summary" });
  console.log(j.ok ? "PASS" : "FAIL", "|", j.txt.slice(0, 300).replace(/\s+/g, " "));

  console.log("\nDONE");
} catch (e) {
  console.log("\nFATAL:", e.message);
  if (errs.length) console.log("stderr:", errs.join("").slice(0, 1500));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1200);
}
