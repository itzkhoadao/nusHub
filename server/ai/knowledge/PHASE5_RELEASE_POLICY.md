# Phase 5 release policy — 5 October 2026

Policy ID: `phase5-owner-agent-review-2026-10-05`.

## Owner decision and scope

On 5 October 2026, repository owner `daoanhkhoa` instructed Codex to:

- "keep monthly updates and accept unavailable answers between updates";
- "revise the release policy to accept agent-reviewed evidence";
- "u review for me" and complete Phase 5 securely and accurately.

This replaces the independent-human-review and continuous-HTML-refresh requirements for the Phase 5 curated-knowledge milestone. Codex may review the dataset, sources, answers, contacts and claim entailment, including high/critical cases. Records must identify the reviewer as an agent. No fictitious human or second independent reviewer may be entered. Existing human-review validators and historical reports retain their original meaning; the separate agent-review sidecar is authoritative for this policy.

The milestone covers six registered official sources and the complete frozen `knowledge-v6-agent-review` suite (K001–K032), plus the server security/regression suite, real staging SQL scenarios and authenticated API acceptance. It does not certify the broader E001–E150 product suite or expand the assistant's supported sources. Those broader product regressions, production budgets, provider settings, operational controls and deployment remain Phase 6 work. Phase 5 completion allows production-readiness work to begin; it does not enable production AI or authorize a public beta by itself.

## Monthly updates and unavailable answers

The operator refreshes sources manually each month, starting from the 4 October 2026 snapshot (next planned update: 4 November 2026). This is an operating cadence, not an installed scheduler or a promise of continuous answer availability.

- HTML sources retain a maximum age of **24 hours**; the versioned Registrar source retains **168 hours**.
- After expiry, current factual answers from that source are unavailable until a genuinely fresh capture/fetch, preview, approval and ingestion completes.
- Expired or future-dated evidence must be excluded. No answer-generation call may run on an empty result. Urgent queries retain generic emergency direction without stale NUS contacts.
- Retaining or replaying archived pages must not advance their factual verification time.
- Failed refreshes preserve the last published snapshot, but preservation never makes an expired snapshot eligible for current answers.
- Browser capture remains a staging-only delivery method. Production must use an authorized supported delivery path or leave those sources unavailable. A new production ingestion channel requires its own reviewed implementation and checks.

This accepts reduced availability; it does not relax freshness, citation, privacy, authentication or source-approval controls.

## Completion evidence

1. Freeze all Phase 5 cases, expected behavior and source evidence; bind dataset approval and answer review to SHA-256 hashes of the exact dataset and full live report.
2. Run the whole frozen suite against real isolated staging and the recorded generation/embedding configuration while required sources are within their freshness windows. Keep every failed run. Record exclusions (none are allowed for the completion run).
3. Codex checks each answer against the captured originals and cited passages. Every material factual claim needs an explicit supported-claim entry; contact cases need affirmative contact review. Review refusals, uncertainty, academic years, qualifiers, privacy and measured external-call counts separately from factual claims.
4. Retain the guide's numerical targets as **observed rates on this finite scoped suite**: 100% critical privacy/injection/contact/URL checks; at least 98% citation entailment, 99% hit@5, 95% recall@5, 95% factual correctness and 95% correct no-answer/clarification; zero wrong-year or unlabelled community-as-official answers. Agent-derived semantic rates must be labelled as such. They are not population reliability estimates or proof against every adversarial input. The current validator is stricter: all individual cases and agent judgments must pass.
5. Real PostgreSQL scenarios verify source expiry, future verification timestamps, wrong-year isolation, declared conflicts and rollback preservation. Check every registered source for safe expiry, with no generation on missing evidence.
6. Authenticated HTTP/SQL/Gemini acceptance verifies ownership, citations/passages, clarification, idempotency, quota, feedback and deletion. A real failed-refresh scenario must preserve publication and record the failure.
7. Server lint, tests and build pass on the final implementation. Review the diff for secret exposure and scope changes. Source archives and detailed results remain local and ignored.

The machine validator checks structural completeness, hashes, citation identities, run-time age and required evidence; semantic claim support remains an explicit agent judgment. It is an audit check, not a cryptographic attestation or an independent reviewer.

## Revalidation

Changes to models, prompts, parsers, retrieval, source policy, citations, authorization or safety require a new full scoped run and bound review. Changed source content requires a new preview and approval. Expiry alone invalidates current-answer availability, not a faithfully dated historical milestone result. Never relabel a saved result as a fresh evaluation.

From `server/`, validate the completion packet using `npm run eval:phase5:agent` with `--dataset`, `--report`, `--reviews`, `--sql`, `--api`, `--refresh` and a new `--out` path. Exact completion filenames and hashes are recorded in the completion checkpoint. `eval:knowledge:review` remains the independent-human-review workflow and is not the completion command for this owner-authorized policy.
