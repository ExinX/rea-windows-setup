// Definitive audit: which of REA's 229 tools are usable on THIS machine, and why not.
import { spawn } from "node:child_process";

const SCRIPT = "C:\\Users\\piotr\\AppData\\Local\\npm-cache\\_npx\\dcfa3d392dc3d0e3\\node_modules\\rea-agents\\scripts\\rea.mjs";

const env = {
  SystemRoot: "C:\\Windows", SystemDrive: "C:", TEMP: process.env.TEMP, TMP: process.env.TMP,
  USERPROFILE: "C:\\Users\\piotr", APPDATA: "C:\\Users\\piotr\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\piotr\\AppData\\Local", PATHEXT: ".COM;.EXE;.BAT;.CMD",
  GHIDRA_INSTALL_DIR: "C:\\ghidra",
  JAVA_HOME: "C:\\Tools\\jdk21\\jdk-21.0.13+9",
  REA_JADX_MCP_JAR: "C:\\Users\\piotr\\.local\\share\\rea\\android\\jadx-headless-mcp-0.7.1-all.jar",
  REA_APKTOOL_COMMAND: "C:\\Tools\\apktool\\apktool.cmd",
  REA_WAKARU_COMMAND: "C:\\Users\\piotr\\AppData\\Roaming\\npm\\wakaru.cmd",
  REA_BROWSER_EXECUTABLE: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  REA_TSHARK_COMMAND: "C:\\Program Files\\Wireshark\\tshark.exe",
  REA_CAPINFOS_COMMAND: "C:\\Program Files\\Wireshark\\capinfos.exe",
  REA_WABT_BIN_DIRECTORY: "C:\\Tools\\wabt\\wabt-1.0.42\\bin",
  REA_ADB_PATH: "C:\\Users\\piotr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe",
  PATH: "C:\\Tools\\jdk21\\jdk-21.0.13+9\\bin;C:\\Program Files\\nodejs;C:\\Users\\piotr\\AppData\\Roaming\\npm;C:\\Tools\\apktool;C:\\Program Files\\Wireshark;C:\\Tools\\wabt\\wabt-1.0.42\\bin;C:\\Users\\piotr\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools;C:\\Windows\\system32;C:\\Windows",
};

const child = spawn("C:\\Program Files\\nodejs\\node.exe", [SCRIPT, "mcp"], { env, stdio: ["pipe", "pipe", "pipe"] });
let buf = ""; const pending = new Map(); let nextId = 1;
child.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  }
});
function rpc(method, params, timeoutMs = 600000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

try {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "audit", version: "1" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

  const tools = await rpc("tools/list", {});
  const sess = await rpc("tools/call", { name: "binary_session", arguments: {} });
  const raw = sess.content?.[0]?.text ?? "";
  const data = JSON.parse(raw);

  // Build availability map from the session capability report.
  const avail = new Map();
  const reasons = new Map();
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (Array.isArray(o.names) && typeof o.available === "boolean") {
      for (const n of o.names) {
        avail.set(n, o.available);
        if (!o.available) reasons.set(n, o.reason || o.availability_code || "unknown");
      }
    }
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(data);

  const all = tools.tools.map((t) => t.name);
  const ok = [], bad = [];
  for (const n of all) {
    if (avail.get(n) === false) bad.push([n, reasons.get(n) || "unavailable"]);
    else ok.push(n);
  }

  console.log(`TOTAL TOOLS: ${all.length}`);
  console.log(`AVAILABLE:   ${ok.length}`);
  console.log(`UNAVAILABLE: ${bad.length}`);

  const byReason = new Map();
  for (const [n, r] of bad) {
    if (!byReason.has(r)) byReason.set(r, []);
    byReason.get(r).push(n);
  }
  console.log("\n=== UNAVAILABLE, grouped by reason ===");
  for (const [r, names] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${r}] (${names.length})`);
    console.log("  " + names.join(", "));
  }

  console.log("\n=== provider availability ===");
  for (const c of data.analysis_provider_candidates || []) {
    console.log(`  ${c.provider.id}: ${c.availability?.status} ${c.availability?.reason ? "- " + c.availability.reason : ""}`);
  }
} catch (e) {
  console.log("FATAL:", e.message);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1000);
}
