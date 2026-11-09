# Historical evidence

The five original text logs are preserved unchanged. They are historical,
partly truncated observations, not results from the revised checks.

| File | Reported REA | What it establishes |
| --- | --- | --- |
| audit2.txt | 6.5.0 per repository documentation; no server identity in file | Old optimistic tally of 110 available; 72 target-required, 15 provider-missing, 10 unsupported-host entries. Do not infer 182 working tools. |
| capcheck.txt | 6.5.0 | Android inspection/resource PASS excerpts; Linux-only packet provider failed on Windows. |
| jadxcheck.txt | 6.5.0 | Android evidence excerpt; provider status parser said not found. |
| wincheck.txt | 6.5.0 | Compatible packet provider and WASM inspection PASS excerpts; comparison failed input validation. |
| doctor-final2.txt | CLI 6.8.0; live server unknown | Configuration/readiness report with catalog count 229; not proof all tools executed successfully. |

New checks write unique, complete JSONL transcripts under `evidence/runs/`,
including server version, requests, responses, errors, stderr and final status.
Keep these files locally; review before sharing because target data can be sensitive.
No new Windows verification is claimed until the checks are run on Windows with
real providers and fixtures. A self-comparison only tests the comparison path;
it does not establish compatibility between different modules.
