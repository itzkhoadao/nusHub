# Phase 5 full-source staging checkpoint — 4 October 2026

**Status: all six official source documents are published in isolated staging; Phase 5 release gate is not met. Phase 6 has not begun.** This checkpoint retains failed live runs and separates automated checks, agent inspection, user-delegated source ingestion, and independent human release review.

## Delivery and published snapshot

The direct staging fetcher could not resolve any of the five HTML source hostnames from this machine. The user authorized capture of the five open official Chrome tabs. The new staging-only `--capture` channel checks each manifest URL against the source registry, the capture age, the raw HTML and visible-text hashes, and the UHC FAQ-panel hash. It converts a selected subset of the captured visible text to inert HTML, then uses the normal parser, content-hash approval, embedding and immutable publication path. It is forbidden in production. The original capture, FAQ panels, images and review page are under ignored `server/evaluation-results/browser-capture-20261004/`.

| Source | Selected staging content | New chunks |
| --- | --- | ---: |
| UCI transport | Kent Ridge services A/D/K/R, Bukit Timah P, effective network date; image-only route details excluded | 1 |
| NUS Libraries | Medicine+Science Library Level 2/3 access distinction and dated Central Library extended hours | 1 |
| OSA support | Student Wellness, official counselling route, emergency line and 999 direction; individual staff and external-provider directories excluded | 1 |
| UHC | Six appointment-related FAQ panels, including MyUHC/uNivUS and the official page's linked appointment portal; other captured panels excluded | 2 |
| NUS IT | IT Care counter location, phone/email versus walk-in hours and support channels | 1 |

The existing Registrar AY2026/27 PDF remains one document with four chunks. Total published corpus: **six documents, ten chunks**. The five HTML approvals record that the user delegated source inspection and staging ingestion to Codex. They do not claim an independent human factual or answer review. OSA's browser HTML export was truncated; its complete expanded visible text was separately captured and hash checked. Map images were saved but not used as text evidence.

All five new versions were published, then returned `unchanged` on re-ingestion. A freshness bug found during verification was fixed: reusing an unchanged version now sets `verified_at` from the actual fetched/captured timestamp, rather than `NOW()`. A real staging query confirmed every captured version's `fetched_at` and `verified_at` equal its capture timestamp. This prevents re-ingesting a cached browser snapshot from extending its 24-hour freshness window. The direct-fetch path also passes its fetch time through the same rule.

## Live evaluation and failures

The complete **17-case draft** ran against all six published documents at the standard 20-second provider deadline and low thinking setting. It scored **12/17 automatic passes**. All ten positive cases retrieved the expected source and answer-relevant evidence within the first five results; measured hit@5, evidence hit@5, recall@5 and MRR@5 were each 1.0 on this small draft set. Five positive cases, K005/K006/K010/K016/K017, failed because Gemini generation timed out. This is not a full release pass; no timeout was relabelled as a factual success.

A separate 30-second diagnostic of those five cases answered K005 and K006 with supported citations, then timed out on K010/K016/K017 (**2/5**). A complete comparison run using minimal thinking and the original 20-second deadline scored **8/17**: nine positive generations timed out. Minimal thinking did not improve reliability. The authenticated chatbot HTTP acceptance check also failed at live generation with a timeout; its synthetic staging account was removed, and a query found zero remaining fixture users. Earlier successful HTTP acceptance on the Registrar-only corpus remains historical evidence, not a pass for this expanded run.

After the final safety-routing and parser changes, the complete draft suite was run again with the standard 20-second deadline and low thinking setting. The final report, `phase5-full-browser-corpus-20261004-final-run.json`, scored **8/17**: K001–K006 and K015–K017 each timed out during generation, while K007–K014 passed, including K010's cited response without generation. Every positive case still retrieved its expected source and answer-relevant evidence in the first five results (all four recorded retrieval metrics remained 1.0). This run is the latest evidence for the current code; it demonstrates a severe generation reliability failure. The repeated 20-second deadlines identify where execution stopped, but do not establish whether the underlying cause is the model, SDK transport, network, or account state. Simply extending the deadline to 30 seconds or lowering thinking did not solve it in the earlier diagnostics.

For urgent self-harm questions, the code now returns a short cited response directly when one current OSA passage contains the Lifeline NUS number, Accident & Emergency direction and 999 instruction together. It does not wait for the generation provider. If that combined evidence is missing or retrieval fails, it falls back to generic emergency direction without asserting an unverified NUS contact. Other detected physical-safety emergencies also receive generic direction without generation. The real staging K010 targeted run passed with one retrieval call and **zero generation calls**. These changes were made after the first complete run, so its pass must not be merged into that run's score.

Transaction-isolated real SQL scenarios passed: baseline retrieval, wrong-year and stale exclusion, declared conflicts stopping generation, and rollback preservation. A deliberately mismatched approval on the captured OSA source failed with `SOURCE_APPROVAL_CHANGED`; its published version and chunk remained unchanged and the failed ledger entry was recorded.

## Citation and dataset review state

The private `phase5-full-corpus-agent-triage.json` is bound to the hashes of the full, diagnostic and urgent reports. It checks the exact cited chunk/version/URL identities and records agent assessments for eight cited answers. K001's first-semester answer still has a chunk-boundary caveat: its cited chunk contains the dates but the explicit Semester 1 heading is in an adjacent retrieved chunk. K003's Level 3 answer correctly says *during term time*, though its closing sentence could be clearer. K016/K017 have no successful answers in these full-source runs to inspect.

The private `phase5-full-corpus-review-run1.json` and `phase5-full-corpus-review-final.json` files, each with an adjacent Markdown evidence packet, contain answer-review forms for the original and final complete runs. `phase5-full-corpus-draft-case-review.json` updates agent notes for all 17 draft cases using the newly captured sources. Every human judgment remains blank. Source-ingestion delegation does not replace independent review of ground truth, claims, contacts, emergency guidance or citations. High/critical cases require distinct reviewers as specified in the runbook. Automatic citation identity cannot establish that a passage entails every material claim.

## Release decision and renewal

Phase 5 remains open because live generation reliability failed, the case dataset is still a draft, independent answer/contact reviews are incomplete, and a 17-case sample cannot establish the guide's release thresholds. The manual Chrome capture channel expires at each source's 24-hour limit and does not provide sustainable production freshness. Before release, obtain a continuously refreshable authorized official delivery channel, perform new previews and approvals when sources change, complete human reviews, and run a frozen full suite after provider reliability is resolved. Phase 6 load tests, budgets, rollback deployment and limited beta wait until that gate passes.

Private result files in `server/evaluation-results/`:

- `transport-browser-preview-v2.json`, `libraries-browser-preview-v2.json`, `osa-browser-preview-v3.json`, `uhc-browser-preview-v3.json`, `it-browser-preview-v2.json` and their matching `*-source-approval-*.json` files.
- `phase5-full-browser-corpus-20261004-run1.json`, `phase5-timeout-diagnostic-20261004.json`, `phase5-full-browser-corpus-20261004-minimal-run2.json`, `phase5-urgent-template-20261004.json`, and the final `phase5-full-browser-corpus-20261004-final-run.json`.
- `phase5-full-corpus-sql-20261004.json`, `phase5-osa-browser-refresh-preservation.json`, `phase5-capture-freshness-check.json`, and the agent/draft/human review packets above.

No connection string, API key or private user record is included in this checkpoint.
