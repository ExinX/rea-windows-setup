# REA on Windows — a working, verified deployment

A reproducible setup of [REA (Reverse Engineer Anything)](https://github.com/morluto/rea)
on Windows 10, with two analysis engines and six capability tools wired and
**verified end-to-end on real binaries** — not just configured.

This repo exists because REA's Windows path has several non-obvious failure
modes that the official docs don't cover. Everything here was found by reading
the running server's own capability report and the app binary, then testing.

## Verification status

This repository contains a Windows integration toolkit around upstream REA,
not a new analysis engine. Historical runs and their limits are indexed in
[evidence/README.md](evidence/README.md). Old tool counts are not execution guarantees.
The revised checks have regression tests; real Windows provider checks must be
rerun on the intended machine. REA 6.5.0 and 6.8.0 results are kept distinct.

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

Historical observations for the investigated REA release (not a current cross-version guarantee):

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

## Portable setup and checks

Use Node.js supported by your selected REA release. Install providers separately.
The scripts no longer depend on a particular username, npm cache or tool folder.
By default ordinary checks request REA 6.8.0; LU/restart checks request 6.5.0.
`npx` may download that exact package. Override with `--version X.Y.Z` or
`REA_VERSION`. A mismatched reported server version fails the run.

For an existing local installation use `--entry <absolute-path-to-rea.mjs>` or
`REA_ENTRY`. No cache path is guessed. For an existing MCP registration use
`--config <path>` with `mcpServers.rea.command`, `args`, and optional `env`.
Only use configurations you trust: their command is executed. Config/entry mode
records the actual reported version rather than assuming a requested version.

Provider discovery uses the process environment and REA's discovery. Set absolute
paths appropriate to your machine: `GHIDRA_INSTALL_DIR`, `JAVA_HOME`,
`REA_JADX_MCP_JAR`, `REA_APKTOOL_COMMAND`, `REA_TSHARK_COMMAND`,
`REA_CAPINFOS_COMMAND`, `REA_WABT_BIN_DIRECTORY`, `REA_ADB_PATH` as needed.
The example MCP config inherits these settings; to test a self-contained config,
put explicit paths and PATH in its env block. Placeholders are not expanded.

```powershell
node --test tests/*.test.mjs
node scripts/rea-audit.mjs
node scripts/rea-smoke.mjs --target C:\Windows\System32\notepad.exe
node scripts/rea-config-check.mjs --config C:\path\to\claude.local.json
node scripts/rea-jadx-check.mjs --apk C:\fixtures\sample.apk
node scripts/rea-capability-check.mjs --apk C:\fixtures\sample.apk --pcap C:\fixtures\sample.pcapng
node scripts/rea-win-check.mjs --pcap C:\fixtures\sample.pcapng --wasm C:\fixtures\left.wasm --wasm-right C:\fixtures\right.wasm
node scripts/rea-lu-check.mjs --entry C:\path\to\rea-6.5.0\scripts\rea.mjs
node scripts/rea-lu-restart-sim.mjs
```

Config check deliberately strips inherited provider variables and PATH; its
configuration must supply everything needed. Restart simulation is Windows-only
and reads Machine/User environment from the registry. It tests that environment,
not the LU GUI itself. LU check tests the selected REA entry, not whether LU
actually launches that same entry.

Every tool-level error fails its check, failures exit nonzero, and capability
reports distinguish available, unavailable and unknown. Missing fixture paths
fail explicitly. `target_required` remains unavailable until a new session report
says otherwise; reported availability still does not prove execution.
Binary checks open a target, require overview evidence and request procedures
and strings. They do not claim pseudocode/decompilation verification.
WASM comparison passes complete inspection evidence as left/right with scope
both; omitting --wasm-right compares the same artifact to itself.

Full results are saved to unique JSONL files, including actual server identity;
use `--output <directory>` to select a destination. Old logs are never overwritten.
Inspect transcript stderr for provider diagnostics. Do not commit raw new runs
without reviewing their contents. No environment values or API keys are logged
by the runner itself. `--timeout <milliseconds>` controls each RPC deadline.

## Why this matters

The point isn't the install. It's that an agent can now answer questions like
"where is the image export code?" or "does this app upload anything?" against a
compiled binary, with evidence — function names, addresses, strings — instead of
guessing from source that doesn't exist.

## License

Scripts MIT. REA itself is MIT (morluto/rea).
