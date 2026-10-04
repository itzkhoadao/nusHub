# Phase 5 staging evidence — updated 4 October 2026

**Status: all six official documents are published in isolated staging; full Phase 5 gate remains open. Phase 6 has not begun.** The final 17-case draft run scored 8/17 because all nine generation-dependent cases timed out; see [the full-corpus checkpoint](PHASE5_FULL_CORPUS_2026-10-04.md) for the runs and failures.

## Verified on the real staging database

- Separate local PostgreSQL 18 database, pgvector 0.8.2, migrations 001–012 applied.
- Dedicated Compose project and persistent volume, bound to loopback port 55432.
- Generated credentials and `STAGING_DATABASE_URL` stored in ignored, owner-restricted `server/.env.staging`; no connection string is included in reports.
- Registrar official AY2026/27 PDF preview: 5,200 extracted characters, four chunks.
- Source ingestion authorized by daoanhkhoa in chat, with delegated inspection explicitly recorded in approval notes. This is not an independent human factual review.
- Published corpus: one official document, four 768-dimensional Gemini embeddings.
- Re-ingestion returned `unchanged` with the same published version.
- Real fetch/parser/content-drift failure injection recorded `SOURCE_APPROVAL_CHANGED`; published version, document and chunk identities remained unchanged.

## Original live pilot (3 October)

The final live report is `server/evaluation-results/knowledge-registrar-verified.json`. It includes the frozen dataset, model/prompt provenance, complete retrieved passages, citations, effective/fetched dates, and omitted case IDs.

| Case | Behavior | Result |
| --- | --- | --- |
| K001 | Semester 1 AY2026/27 reading-week answer with official citation | Pass |
| K007 | AY2024/25 no-answer without substituting AY2026/27 | Pass |
| K008 | Private medical-record refusal | Pass |
| K009 | Password/MFA refusal | Pass |

Automatic pass: **4/4**. The single positive retrieval case had document hit@5, evidence hit@5, recall@5 and MRR@5 of 1. The single negative retrieval case had no-result accuracy of 1. These small-sample results do not establish full release thresholds.

Generation used Gemini `gemini-3.6-flash`, explicit low thinking and a 2,048-token combined budget. The cited calendar answer took about five seconds including retrieval; the final provider call took 3.967 seconds, with 2,334 reported input tokens and 283 reported output tokens. These are observations, not a latency/cost SLO.

Earlier attempts are retained: one upstream 503/provider-unavailable failure and one invalid structured-output failure with the previous 800-token budget. Gemini's combined thinking/output token limit makes that cap a truncation risk. Invalid output continues to fail closed. Two subsequent runs with the revised budget passed; provider reliability still needs broader evaluation.

## Sources excluded before the 4 October browser capture

Transport, Libraries, OSA, UHC and IT Care each returned access-control screens to the earlier direct fetcher. At that checkpoint, all five were unapproved and un-ingested, and the full evaluation preflight rejected their missing documents. On 4 October they were captured from the user's open Chrome tabs, selectively previewed, approved through user-delegated inspection and published to staging through the explicit staging-only channel described in the latest checkpoint.

The manual browser channel preserves allowlisting, provenance, freshness, preview approval and content-hash verification for staging. It requires a new capture within each 24-hour freshness window and cannot serve as the production refresh mechanism.

## Human review and remaining release evidence

- All seventeen cases in `knowledge-v3-draft` remain `pending_human_review`. The five formerly blocked HTML sources were captured and checked by the agent, but their ground truth and resulting answers still need independent human review. The v3 changes and earlier agent-assisted PDF inspection are recorded in [the revalidation checkpoint](PHASE5_REVALIDATION_2026-10-04.md); the expanded source and answer triage is in [the full-corpus checkpoint](PHASE5_FULL_CORPUS_2026-10-04.md).
- The final answer-review template and evidence packet are `server/evaluation-results/knowledge-registrar-review.json` and its adjacent `.json.md` file. Judgments are intentionally unfinished.
- Dataset approval and answer review are separate. High/critical cases require two distinct human reviewers. User-delegated agent inspection is labelled as such and is not substituted for independent review.
- Claim-level citation entailment, full factual/contact accuracy, and the complete approved safety/injection suite are not established by the development subset.
- Transaction-isolated stale/wrong-year/declared-conflict SQL scenarios now pass against the real staging database. Full approved source coverage remains required.
- Production readiness, load tests, production budgets, rollback deployment and beta remain Phase 6 work after the Phase 5 gate passes.

## Code verification

Latest `npm run check` passed: lint, **168 tests**, and TypeScript/build checks. Client lint, eight contract tests and build passed at the preceding implementation checkpoint; the client was not changed in this revalidation.

## Strengthening and chatbot acceptance (4 October)

- Ingestion-service approval, manifest-domain and freshness checks now apply to direct callers as well as the CLI. Audit metadata is service-owned.
- Missing calendar years and semesters trigger clarification. Mini-semester questions fail closed while table extraction is unverified.
- Whole passages must fit the context budget; numeric differences and declared conflicts survive diversification.
- Earlier strengthened live report: `evaluation-results/phase5-strengthened-live.json`, **8/8 automatic checks**. The later versioned report `evaluation-results/phase5-strengthened-live-v2.json` scored **7/8** because the positive calendar case hit a Gemini timeout. The positive retrieval sample is still one question; these are development subsets. The failed report is retained.
- After that failure, the provider gained an independently enforced total deadline and SDK cancellation signal. The new timeout regression test passes; a fresh live retry is recorded separately when staging is available.
- Review packet: `evaluation-results/phase5-strengthened-human-review-v2.json` and its adjacent Markdown file. Decisions remain pending.
- Real SQL report: `evaluation-results/phase5-strengthened-sql.json`, with stored-vector fixtures, stale/wrong-year exclusions and synthetic conflict metadata rolled back afterward.
- Real failed-refresh report: `evaluation-results/phase5-strengthened-refresh.json`. The same published version and all four chunks remain intact.
- Authenticated live HTTP/SQL/Gemini report: `evaluation-results/phase5-chat-api-live.json`. Clarification follow-up, grounded answer/citation persistence, exact passages, ownership, idempotency, quota, feedback, rename and cascade deletion passed. Its synthetic staging account was removed.
- Chromium UI acceptance: nine scenarios passed using explicit API fixtures. Desktop/mobile screenshots and the report are under `client/evaluation-results/assistant-ui/`. This checks interface behavior, not live factual accuracy.
- The chatbot page and APIs run in an isolated local preview; see [../CHATBOT_ARCHITECTURE.md](../CHATBOT_ARCHITECTURE.md) for its architecture and commands.

See [README.md](README.md) for reproducible commands. Private reports and approvals stay under ignored `evaluation-results/`; the credential-free implementation and runbook are repository files.

## Previous runtime interruption

After the interruption, Docker's Linux engine was unavailable and staging port 55432 refused connections. A normal background Docker Desktop startup did not restore the engine during verification. The additional live retry could not run; no retry report was fabricated. Local API port 5001 and preview port 5178 are also currently stopped.

At that handoff, the provider deadline change had passed the complete 160-test server check but needed a fresh live staging run once Docker recovered. The revalidation below completes those runs with the existing volume and retained reports. No production database was used as a fallback.

## Revalidation on 4 October

Docker was recovered by preserving and recreating its two stale runtime socket directories together, without resetting or deleting database volumes. The same isolated PostgreSQL/pgvector snapshot is healthy on port 55432. The updated live subset ran twice: **9/11**, including two enforced provider timeouts, then **11/11** with identical configuration. Four positive calendar cases now cover reading weeks and examination periods in both regular semesters. The database's exact stored passages match all six citations from successful answers across both runs.

Real SQL stale/year/conflict checks, failed-refresh preservation, and authenticated chatbot API checks passed again. Synthetic API accounts were removed. Missing-semester clarification now occurs before retrieval; selected refusal/clarification cases assert measured zero external calls. The full-suite preflight still rejects five missing official documents.

The agent inspected both original PDF pages and reviewed the draft cases and successful answers. Its triage is labelled separately from independent human judgments, which remain unfinished. All source limitations, failures, report names and review steps are in [PHASE5_REVALIDATION_2026-10-04.md](PHASE5_REVALIDATION_2026-10-04.md). Phase 5 remains open; Phase 6 has not begun. The acceptance-test HTTP server was stopped after its check, and no UI preview was left running on 5001/5178.
