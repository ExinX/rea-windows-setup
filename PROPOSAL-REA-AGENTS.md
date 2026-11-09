> Historical proposal draft. Claims below are not current verification results.
> See evidence/README.md and rerun the revised checks before reusing these claims.

# Upwork proposal — REA + AI Agents (7 required questions)

Job: "AI Agent Engineer — REA (Reverse Engineer Anything), Claude Code, MCP & Custom AI Employees"
Posted 2026-10-18 · 50+ proposals · client last viewed 3 weeks ago · $20K spent, 76 hires

**Must begin with "REA + AI Agents"** — the client said so explicitly.

---

REA + AI Agents

**1. REA experience — have you personally installed and used it?**

Yes. I deployed REA on Windows 10 from scratch and verified it end-to-end, which
is harder than it sounds because the Windows path has several undocumented
failure modes. I run REA 6.5.0 (LU's pinned build) and 6.8.0 side by side, with
**Ghidra 12.1.4** and **jadx-headless-mcp 0.7.1** as analysis engines, plus
apktool, WABT, tshark and adb wired as capability providers.

What I actually used it for: decompiling a real Windows PE (`notepad.exe` →
794 recovered procedures and the full string inventory), decompiling a real
Android APK (class tree, manifest, cross-references), decoding APK resources,
inspecting a WASM module, and reading a live packet capture into structured
Evidence.

I also wrote a capability audit that reads the running server's own report and
tells you exactly which of its 207 tools are usable on a given machine and why
the rest are not. That turned out to be the most useful thing I built, because
REA's availability depends on host OS, installed engines, and environment
variables in ways the docs don't spell out.

**2. Demonstration — repository, video, or walkthrough?**

Public repo: **https://github.com/ExinX/rea-windows-verified**

It contains the setup, a config template, eight verification scripts that spawn
the real MCP server over stdio and print PASS/FAIL (no mocks), and captured
evidence runs. The README documents the four Windows gotchas I hit and the exact
gate logic I read out of `createServer.js`.

Happy to do a live walkthrough — I can decompile a binary of your choosing and
show the evidence trail in real time.

**3. Technical setup — how would you connect REA to Claude Code via MCP?**

REA is a local stdio MCP server. Three things matter:

- **Registration.** `npx rea-agents@latest setup` writes the server entry, or
  you add it by hand to `.claude.json` under `mcpServers`. The entry is a
  command plus args (`npx -y rea-agents@<version> mcp`).
- **A self-contained `env` block.** This is the part people get wrong. If the
  entry has no `env`, the server inherits whatever PATH the launching process
  had — so a server started before you installed Ghidra will never see it, and
  you get "missing analysis engine" with no obvious cause. I pin
  `GHIDRA_INSTALL_DIR`, `JAVA_HOME`, and the `REA_*` provider paths directly in
  the config so it is immune to a stale shell.
- **Restart.** Config is read at startup only. Then `/mcp` inside the session
  confirms the server is connected and lists its tools.

One Windows-specific detail: REA spawns owned child processes, and Windows
refuses a bare command name — `REA_TSHARK_COMMAND=tshark` fails with Win32
error 87. Every provider path must be absolute.

**4. Practical application — understanding an app without copying code**

The distinction I'd draw: REA gives you **behavior and structure**, not source.
You use it to answer specific questions — "where does this write the export
file?", "what does it send on startup?", "which function validates the licence?"
— and you get back evidence you can check: function names, addresses, strings,
call relationships.

Then you write your own implementation from the *specification* you derived, not
from decompiled output. Decompiled code is a legal and practical minefield to
copy: it's ugly, it's compiler-shaped, and it's still someone's expression. What
you legitimately take is the understanding — the protocol, the data flow, the
algorithm — and you reimplement it cleanly in your own idiom.

Concretely, for a workflow: open the target, map entry points and strings, trace
the call path for the feature in question, read the pseudocode for the two or
three functions that matter, write down the contract (inputs, outputs, side
effects, error cases), then build against that contract and test against the
original's observable behavior.

**5. AI employees — what have you built?**

I build agent systems that run real multi-step work with tool access, not chat
wrappers. Most recently: an agent environment with 200+ MCP tools across binary
analysis, Android, packet capture and filesystem work, where the hard problems
were not "can it call a tool" but reliability — tool availability detection,
timeouts on cold analysis, evidence retention so a later step can reference an
earlier result by ID, and knowing when to stop and ask a human.

The pattern that works: narrow tools with typed inputs, every result carrying
provenance, explicit capability checks before attempting work, and a hard
distinction between "the tool failed" and "the tool said no".

**6. Architecture — multiple collaborating AI employees**

- **Transport:** MCP for tool access — it's the emerging standard and keeps
  tools decoupled from any one model vendor.
- **Orchestration:** one planner agent that decomposes work and delegates to
  narrow specialists, rather than one giant agent with 200 tools. Specialists
  are easier to test and cheaper to run.
- **State:** an explicit task store (SQLite or Postgres) for job state and
  memory, not conversation history. Conversation is a terrible database.
- **Integration:** prefer real APIs over browser automation; use browser
  automation only where no API exists. Same principle as REA vs API.
- **Human-in-the-loop:** approval gates on anything irreversible — sending,
  paying, deleting, changing permissions.
- **Observability:** log every tool call with inputs, outputs and latency. When
  an agent misbehaves you need the trace, not a vibe.

**7. Project approach — discovery and pilot, timeline, cost**

**Week 1 — Discovery (paid, fixed).** Map your actual workflows: which apps,
which steps, where the time goes, what's repetitive vs judgment-heavy. Deliver a
short written assessment ranking automation candidates by value and difficulty.
*$800–1,200 fixed.*

**Weeks 2–4 — One working AI employee.** Pick the single highest-value workflow
from discovery and build it end to end: real integrations, error handling,
approval gate, logging. Plus a live REA demonstration against an app you choose.
Deliver working software, docs, and a test run on real data.
*$3,000–5,000 fixed, or hourly.*

**Ongoing.** Expand to additional employees once one is proven. Hourly, or
retainer.

I'd rather start small and prove one workflow than sell you a platform. If the
pilot doesn't save you measurable time, you shouldn't continue — and I'd say so.

---

## Notes before sending

- The posting is 3 weeks old with 50+ proposals and the client hasn't viewed it
  since. Odds are moderate. Send anyway — it's the best-fit listing available.
- Answer all 7 questions in order; the client asked for specificity and will
  notice a generic reply.
- Lead with the repo link in the first screen of text.
- Budget ~6–16 Connects ($0.90–$2.40).
