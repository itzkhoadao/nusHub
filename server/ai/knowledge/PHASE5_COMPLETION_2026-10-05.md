# Phase 5 completion — 5 October 2026

**Phase 5 is complete under the owner's amended agent-review and monthly-update policy.** The machine gate returned `agent_reviewed_pass`. Phase 6 production-readiness work may begin; production AI and a public beta have not been enabled by this decision.

The owner explicitly selected monthly manual updates, accepted unavailable answers after expiry, and delegated release-evidence review to Codex. [The release policy](PHASE5_RELEASE_POLICY.md) records this amendment and supersedes the earlier independent-review and continuous-refresh requirements for this milestone. This checkpoint is agent-reviewed evidence, not independent human certification.

## Results

| Check | Evidence and outcome |
| --- | --- |
| Full live Phase 5 suite | **32/32 passed**, `knowledge-v6-agent-review`, K001–K032; no excluded cases |
| Live configuration | Isolated PostgreSQL/pgvector, six official documents, ten chunks; `gemini-3.5-flash-lite`, low thinking, 2,048-token budget, 20-second deadline |
| Retrieval | 14 positive and one negative retrieval case; hit@5, evidence hit@5, recall@5, MRR@5 and no-result accuracy each 1.0 on this sample |
| Answer and dataset review | Codex approved all 32 scoped cases and reviewed 12 factual answers, **24 material factual claims**, five contact cases, 13 refusals, five no-answer cases and two clarifications |
| Source fidelity | Exact retrieved passages matched all six saved previews; HTML/text/FAQ capture hashes verified; original Registrar page visually checked for table-row attribution |
| Citation/factual quality | All 24 reviewed claims supported by their cited passages; all five contact cases supported; no wrong-year or community-as-official answer found |
| Expanded safety coverage | Ten additional role/instruction injection, private-record and credential cases passed with measured zero retrieval/generation calls |
| Real SQL | Fresh retrieval, wrong-year isolation, expiry, future timestamps, declared conflicts and transaction rollback passed; **all six sources** declined expired answers without generation |
| Real authenticated API | Ownership, clarification, streaming, exact passages, idempotency, key conflict, quota, private cache headers, feedback, rename and cascade deletion passed; temporary account removed |
| Failed refresh | Actual OSA content-hash mismatch rejected with `SOURCE_APPROVAL_CHANGED`; published version/chunk preserved and failure recorded |
| Final code checks | Server lint, **191/191 tests**, TypeScript and build passed; `git diff --check` passed |
| Completion validator | Hash-bound dataset/report/reviews and supporting SQL/API/refresh evidence passed; negative tests cover tampering, missing/duplicate/negative reviews, incomplete runs, contact review and stale citations |

The live suite ran on **5 October 2026, 02:33–02:34 Singapore time** (the JSON stores UTC on 4 October). The source snapshots were within their configured freshness windows during that run. The agent review and final failed-refresh verification were completed later on 5 October. These observed rates meet the amended scoped milestone criteria; they do not establish population-level reliability or exhaustive resistance to every adversarial input.

## Changes made for completion

- Reject future verification timestamps in both SQL retrieval branches; retrieval policy version is `phase5.2026-10-05.v3`.
- Require explicit source support for the urgent template's 24-hour hotline wording. If the hours are absent, return unverified emergency guidance without asserting the hotline's hours or number.
- Expand the live suite from 22 to 32 cases and add matching deterministic safety regressions.
- Add a separate agent-review validator and policy. Historical `pending_human_review` fields stay accurate; the sidecar is the accepted agent approval and does not invent human reviewers.
- Extend real database scenarios to each registered source's expiry and future timestamps, with all synthetic changes rolled back.

## Evidence files and identity

Detailed artifacts are local under ignored `server/evaluation-results/`. They contain public-source excerpts and synthetic test evidence, not application credentials. Keep the existing capture archive through its 3 December 2026 retention target.

| File | SHA-256 |
| --- | --- |
| `phase5-close-live-20261005.json` | `22f93e5647fef007a5eeb12747e8e5a70730b2893b0dd6952546fc34649e17ba` |
| `phase5-close-agent-reviews-20261005.json` | `ccd009fe9a68471e4a2b1f72b1cb669c7e4438f557070bbc69a3b5f5c9903cf0` |
| `phase5-close-source-audit-20261005.json` | `273eb87533ce16059528189e7a838ddb85e8e9e5f43c77bf4ec136dc9dc9dcbd` |
| `phase5-close-gate-20261005.json` | `f3ddb588be896ddd6d0289ed0fac0e843214805fe35e96c2c384a389bdf90510` |
| `phase5-close-sql-v2-20261005.json` | `e07bf2b93b7902935ca28b8f67c93a4a069f4b99762323615cd2e0cb812eb2c9` |
| `phase5-close-api-20261005.json` | `bcbb0afaaa6ac8dd3a32b6ef0b40c3bae64a47d902c58993b85225a744866ca8` |
| `phase5-close-refresh-20261005.json` | `0fc7d35e3eebc788124ab426f3111f67793d557b877e9711129f66593bccc4fc` |
| `phase5-close-check-final-20261005.log` | `68e11b6cbda6f37c9d1b5f248fbb2d9ec64c3c6a29d118e08b24b4a53b912d6b` |

Frozen dataset SHA-256: `b28e899a48d437f7c3fbac376bca30fcf18b104f68ca17b922272cfaed2118e2`. The adjacent private Markdown review packet explains each judgment. The live manifest records a dirty working tree; the final implementation is covered by the final test run, and the credential-free completion receipt records file hashes for review. No clean-commit provenance is claimed.

Reproduce the policy validation from `server/` (choose a new output filename):

```powershell
npm run eval:phase5:agent -- --dataset evaluation/knowledge-cases.v1.json --report evaluation-results/phase5-close-live-20261005.json --reviews evaluation-results/phase5-close-agent-reviews-20261005.json --sql evaluation-results/phase5-close-sql-v2-20261005.json --api evaluation-results/phase5-close-api-20261005.json --refresh evaluation-results/phase5-close-refresh-20261005.json --out evaluation-results/phase5-close-gate-recheck.json
```

This validates historical evidence; it does not run Gemini again or extend source freshness. New live evaluations still require current approved sources.

## Monthly operating handoff

Next planned manual update: **4 November 2026**. No recurring automation has been installed. At each update, fetch/capture the official pages afresh, inspect the parsed content, record an explicitly delegated/agent-labelled approval, ingest into isolated staging, and rerun the full suite plus a new bound review. Changed content cannot reuse an old content approval.

The five HTML snapshots expire on **5 October 2026 around 17:13–17:20 Singapore time**; the Registrar snapshot expires on **10 October around 22:52**. Current factual answers become unavailable after those limits until refreshed. Archived pages remain available for audit, and generic urgent direction remains available without stale NUS contacts. The owner accepted these gaps. Production browser-capture ingestion remains disabled; Phase 6 must either provide an authorized production delivery path or leave the affected sources unavailable.

## Retained failures and recovery

Earlier provider timeouts/429 failures and all preceding reports remain retained. During this work, a sandbox-only test run failed because loopback connections were denied. The subsequent unrestricted run found one outdated 22-case-count assertion; it was corrected for the 32-case suite, after which all 191 tests passed. No failed run was reclassified as passing.

An approval-service usage interruption delayed the full server check. On continuation, Docker had stopped and a refresh attempt failed with connection refused. Capture hashes and approval freshness still passed. Docker then hit its previously observed inaccessible runtime-socket issue. The two inspected socket-only directories were preserved with `.phase5-preserved-20261005` suffixes and recreated. The same staging volume recovered, migrations/pgvector were verified, and the refresh check passed. No factory reset or database-volume deletion was performed.

Phase 6 remains responsible for the broader product regression suite, load/abuse testing, production provider settings, budgets/alerts, deployment and rollback procedures, and beta operation. Phase 5 completion does not claim those checks have passed.
