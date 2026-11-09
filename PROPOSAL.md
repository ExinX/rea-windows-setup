> Historical proposal draft. Claims below are not current verification results.
> See evidence/README.md and rerun the revised checks before reusing these claims.

# Upwork proposal — "AI Agent Engineer — REA, Claude Code, MCP & Custom AI Employees"

Paste into the proposal box. Keep it short; the repo does the talking.

---

I deployed REA on Windows from scratch and verified it end-to-end, and I documented
every failure mode I hit — because the official docs don't cover them.

**What I actually built** (public repo, link below):

- REA 6.5.0 + 6.8.0 running over MCP into Claude Code, with a self-contained
  `env` block so the server never inherits a stale PATH
- **Ghidra 12.1.4** wired and verified: decompiled a real PE, recovered 794
  procedures and the full string inventory
- **jadx-headless-mcp 0.7.1** wired and verified on a real APK: class tree,
  manifest, xrefs
- **apktool 2.11.1** for decoded resources, **WABT 1.0.42** for WASM,
  **tshark 4.6.9** for packet captures, **adb** for device work
- A capability audit script that reads the live server's own report and tells you
  exactly which of the 207 tools are usable and why the rest aren't

**The non-obvious things I found**, which is the part that matters for your setup:

1. REA has **two** packet-capture providers. One is Linux-gated; the other works
   fine on Windows. Hitting the first makes the whole feature look broken.
2. Windows refuses to spawn a bare command name — `REA_TSHARK_COMMAND=tshark`
   fails with Win32 error 87. It needs an absolute path.
3. `recover_javascript_sources` hard-checks `process.platform === "linux"` and
   throws. Wakaru can be installed and on PATH and REA still won't call it.
4. `annotate_native_function` is disabled on Windows — Ghidra analysis is
   read-only there, so you can't rename functions in the database.

**On the "when is REA the right tool" question you raised:** REA earns its keep
when there's no source and no API — compiled binaries, Electron/ASAR bundles,
APKs, obfuscated JS. If a public API or a browser automation path exists, that's
usually cheaper and more stable. REA's real value is the evidence trail: function
names, addresses, strings you can verify, not a plausible-sounding guess.

Repo with the scripts, the config template, and captured evidence:
**https://github.com/ExinX/rea-windows-verified**

Happy to walk through the setup live, or start with a small paid pilot on one of
your apps so you can see the output quality before committing to anything bigger.

---

## Before you send — checklist

- [ ] Push `rea-demo/` to GitHub, make it public, put the URL in the proposal
- [ ] Upwork profile headline: "REA / MCP agent engineer — reverse engineering
      with Ghidra, jadx, apktool"
- [ ] Portfolio item: link the repo + one screenshot of `rea-audit.mjs` output
- [ ] Apply within 6-12 hours of the posting (early proposals get read)
- [ ] Budget ~6-16 Connects ($0.90-$2.40) for this proposal

## Honest expectation setting

- Upwork: 2-8 weeks to a first contract is normal; ~11 proposals per hire
  market-wide; only ~40% of postings hire anyone.
- This job is an unusually strong match — it names REA, Claude Code, MCP, Ghidra
  and IDA explicitly, and asks for a demo. That's rare.
- Do not lead with "I can do anything." Lead with the repo.
