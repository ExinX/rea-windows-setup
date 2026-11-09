// End-to-end smoke test: spawn the exact REA MCP command from .claude.json,
// handshake over stdio, then actually analyze a real PE binary with Ghidra.
import { spawn } from "node:child_process";

const NPX = "C:\\Program Files\\nodejs\\npx.cmd";
const TARGET = process.argv[2] || "C:\\Windows\\System32\\notepad.exe";

const child = spawn("cmd.exe", ["/d", "/c", NPX, "-y", "rea-agents@6.8.0", "mcp"], {
  env: {
    ...process.env,
    GHIDRA_INSTALL_DIR: "C:\\Tools\\ghidra_12.1.4_PUBLIC",
    JAVA_HOME: "C:\\Tools\\jdk21\\jdk-21.0.13+9",
    PATH: "C:\\Tools\\jdk21\\jdk-21.0.13+9\\bin;C:\\Program Files\\nodejs;C:\\Users\\piotr\\AppData\\Roaming\\npm;" + process.env.PATH,
  },
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

const stderrChunks = [];
child.stderr.on("data", (d) => stderrChunks.push(d.toString("utf8")));

function rpc(method, params, timeoutMs = 600000) {
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

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const log = (...a) => console.log(...a);

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "rea-smoke", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  log("== initialize ==");
  log("server:", JSON.stringify(init.serverInfo));
  log("protocol:", init.protocolVersion);

  const tools = await rpc("tools/list", {});
  log("\n== tools/list ==");
  log("tool count:", tools.tools.length);

  log("\n== open_binary ==");
  log("target:", TARGET);
  const opened = await rpc("tools/call", { name: "open_binary", arguments: { path: TARGET } });
  const openedText = opened.content?.[0]?.text ?? JSON.stringify(opened);
  log(openedText.slice(0, 1200));

  log("\n== binary_overview ==");
  const ov = await rpc("tools/call", { name: "binary_overview", arguments: {} });
  const ovText = ov.content?.[0]?.text ?? JSON.stringify(ov);
  log(ovText.slice(0, 2500));

  log("\n== list_procedures (first page) ==");
  const lp = await rpc("tools/call", { name: "list_procedures", arguments: {} });
  const lpText = lp.content?.[0]?.text ?? JSON.stringify(lp);
  log(lpText.slice(0, 1500));

  log("\n== list_strings ==");
  const ls = await rpc("tools/call", { name: "list_strings", arguments: {} });
  const lsText = ls.content?.[0]?.text ?? JSON.stringify(ls);
  log(lsText.slice(0, 1200));

  log("\n== close_binary ==");
  const cb = await rpc("tools/call", { name: "close_binary", arguments: {} });
  log((cb.content?.[0]?.text ?? JSON.stringify(cb)).slice(0, 600));

  log("\nSMOKE TEST: PASS");
} catch (e) {
  log("\nSMOKE TEST: FAIL ->", e.message);
  if (stderrChunks.length) log("stderr:", stderrChunks.join("").slice(0, 3000));
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => { try { child.kill(); } catch {} process.exit(process.exitCode ?? 0); }, 1500);
}
