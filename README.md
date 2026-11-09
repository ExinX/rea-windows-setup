# REA on Windows — a working, verified deployment

A reproducible setup of [REA (Reverse Engineer Anything)](https://github.com/morluto/rea)
on Windows 10, with two analysis engines and six capability tools wired and
**verified end-to-end on real binaries** — not just configured.

This repo exists because REA's Windows path has several non-obvious failure
modes that the official docs don't cover. Everything here was found by reading
the running server's own capability report and the app binary, then testing.

## Results

| | Tools |
|---|---|
| Total in REA 6.5.0 | 207 |
| Available with no target open | 86 |
| **Available after this setup** | **110** |
| Plus tools that unlock once a binary is open | **~182 usable** |

Engines live: **Ghidra 12.1.4** (native PE/ELF/Mach-O) and
**jadx-headless-mcp 0.7.1** (Android APK/DEX).

## Verified, with evidence

Every claim below has a captured run in `evidence/`.

| Capability | Tool | Evidence |
|---|---|---|
| Native decompilation | Ghidra 12.1.4 | `notepad.exe` → 794 procedures, full string inventory |
| Android decompilation | jadx 0.7.1 | real APK → class tree, manifest, xrefs |
| Android resources | apktool 2.11.1 | decoded AndroidManifest + string resources |
| WASM inspection | WABT 1.0.42 | `inspect_wasm_artifact` on a hand-built module |
| Packet capture | tshark 4.6.9 | 48 KB live capture → structured Evidence |
| Android device | adb 37.0.2 | 24 `*_adb_*` tools flipped available |

## The four Windows gotchas

### 1. `node`/`npx` not on PATH

Node installs to `C:\Program Files\nodejs` but the installer sometimes fails to
add it. Symptom: every `npx` call says "not recognized" even though Node is
installed. Fix: add it to the **User** PATH and dedupe.

### 2. The MCP server inherits a stale environment

If `.claude.json` has no `env` block, the server depends on whatever PATH the
launching process happened to have. A server started before you installed Ghidra
will never see it. Fix: give the server its own `env` block.

### 3. PowerShell's `Set-Content -Encoding UTF8` writes a BOM

A BOM breaks `JSON.parse` on the config file. Use:

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $json, $utf8NoBom)
```

### 4. Windows refuses to spawn a bare command name

`REA_TSHARK_COMMAND=tshark` fails with Win32 error 87 ("parameter incorrect").
Windows requires an **absolute** path for owned child processes. This is why
packet capture appears broken on Windows when it isn't.

## The packet-capture trap

REA has **two** packet providers:

- `tshark-capture` — hard-gated to Linux (`util-linux prlimit`)
- `pcap` — **works on Windows**, needs only an absolute `REA_TSHARK_COMMAND`

Hitting the first one produces a "requires Linux" error that makes the whole
feature look unavailable. It isn't. Set the absolute path and use
`inspect_pcap_capture`.

## What is genuinely blocked on Windows

Read from `createServer.js`, not guessed:

```
packetCaptureEnabled  = linux && absolute(REA_TSHARK_COMMAND)
signalRecording       = linux && absolute(REA_SIGROK_COMMAND)
evmInterface          = linuxX64
recordedCrash         = linuxX64 && pwntools
binaryLayout          = linuxX64 && pwntools
firmwareInspection    = linux && absolute(REA_BINWALK_COMMAND)
javascriptRecovery    = linuxX64 && absolute(REA_WAKARU_COMMAND)
```

`recover_javascript_sources` hard-checks `process.platform !== "linux"` and
throws — Wakaru can be installed and on PATH and REA still won't call it.

Also Windows-specific: `annotate_native_function` is disabled
("Windows Ghidra P0 does not admit database mutation"). Analysis is read-only;
you cannot rename functions in the Ghidra database.

## Setup

```powershell
# 1. engines
#    Ghidra 12.1.4 + Temurin JDK 21 under C:\Tools
#    jadx-headless-mcp-0.7.1-all.jar (SHA-256 6e5eacf5...73ff75)

# 2. env (User scope)
[Environment]::SetEnvironmentVariable("GHIDRA_INSTALL_DIR","C:\Tools\ghidra_12.1.4_PUBLIC","User")
[Environment]::SetEnvironmentVariable("JAVA_HOME","C:\Tools\jdk21\jdk-21.0.13+9","User")
[Environment]::SetEnvironmentVariable("REA_JADX_MCP_JAR","...\jadx-headless-mcp-0.7.1-all.jar","User")

# 3. MCP config with its own env block — see .claude.json.example
```

## Verify

```powershell
node scripts/rea-audit.mjs          # capability counts + what's gated and why
node scripts/rea-win-check.mjs      # pcap + WASM
node scripts/rea-capability-check.mjs  # apktool + jadx + tshark
node scripts/rea-config-check.mjs   # strictest: config-only env
```

Each script spawns the MCP server over stdio, performs a real handshake, calls
tools, and prints PASS/FAIL. No mocks.

## Why this matters

The point isn't the install. It's that an agent can now answer questions like
"where is the image export code?" or "does this app upload anything?" against a
compiled binary, with evidence — function names, addresses, strings — instead of
guessing from source that doesn't exist.

## License

Scripts MIT. REA itself is MIT (morluto/rea).
