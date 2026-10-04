# Phase 5 provider recovery and expanded staging run — 4 October 2026

**Status: 22/22 automatic checks passed on the expanded draft, with all six official sources in isolated staging. Phase 5 is still open. Phase 6 has not begun.** The case set and answer judgments require independent human review, and the five browser-captured HTML sources need an authorized repeatable refresh path.

## Diagnosis and implementation

The previous full-corpus run scored 8/17 because nine generation requests timed out. A transport diagnostic separated a simple generation call from the production-style structured call. Simple calls to `gemini-3.6-flash` succeeded, but structured calls to that model returned HTTP **429** within about half a second, through both the SDK and direct REST. The SDK's one automatic retry obscured that response as the configured 20-second deadline. These observations apply to the configured account and time of testing; they do not establish a universal model outage.

The provider now disables its hidden retry, classifies 429 as `AI_PROVIDER_RATE_LIMITED`, and records content-free transport, validation, and upstream-status telemetry. The streaming API gives the client a stable, safe rate-limit message and persists the failure code. It does not expose provider error bodies, keys, or prompts. The isolated staging launcher defaults to the evaluated `gemini-3.5-flash-lite`; the evaluation and authenticated-chat CLIs also accept `--generation-model` for explicit comparison. The normal deployment model setting has not been changed by this staging decision.

The answer prompt is versioned as `nus-knowledge-assistant.v2` and asks for direct user-facing prose, conditional facts stated with their conditions, and citations covering both a split calendar heading and its date row. The calendar answer path adds the adjacent Semester 1 heading citation when its evidence is available and fails closed when that context is missing. The draft evaluation now checks selected exact facts, rejects exposed internal chunk IDs and instruction-like prose, and includes five additional boundary cases: term-time library access, an image-only shuttle stop order, a live UHC wait time, urgent physical safety, and a self-harm wording variant. These checks improve regression coverage but do not replace claim-level human entailment review.

The evaluation preflight now rejects expired published snapshots. Re-ingesting an old capture cannot renew its `verified_at` time; a fresh capture, preview, approval and publication are required.

## Live evidence

The latest full report is the ignored `server/evaluation-results/phase5-v4-flash-lite-final-20261004.json`. It records source versions, dataset hash, Git revision and dirty-state marker, model, prompt, retrieved passages, answer/citation identities and every case outcome. `knowledge-v4-draft` scored **22/22 automatic passes** with `gemini-3.5-flash-lite` and the standard 20-second request deadline. On this small draft set, document hit@5, evidence hit@5, recall@5, MRR@5, and no-result accuracy were each 1.0. The 22 cases include 12 answered cases and 10 clarification, refusal, or not-verified cases. The earlier 8/17 run remains retained as a real failure, not merged into the new score.

The authenticated loopback HTTP check with real PostgreSQL and Gemini also passed on `gemini-3.5-flash-lite`: ownership, clarification follow-up, grounded streaming, exact passages, idempotency, quota, feedback, rename and deletion. Its report is `server/evaluation-results/phase5-v4-flash-lite-chat-api-final-20261004.json`; the synthetic account was removed. The server verification suite passed lint, **172 tests**, and build after the API error change.

The agent inspected the generated answers and corresponding passages, including the split Registrar citations, Libraries' Level 3 term-time condition, UHC appointment channel, and OSA emergency numbers. This is agent triage only. The exact report-bound review packet is `server/evaluation-results/phase5-v4-flash-lite-review-final-20261004.json` with an adjacent `.md` evidence view; its human judgments are intentionally blank. Reviewers must verify each material claim and high-stakes contact against the current official source. The draft cases themselves need factual approval, with two distinct reviewers for high and critical risk cases.

## Remaining release gates

- Complete independent dataset and answer/citation reviews, including exact contact accuracy and the guide's claim-entailment threshold. Automatic citation identity is not entailment.
- Obtain source-owner-authorized, repeatable delivery for the five protected HTML pages. Direct fetch still returns access-control screens; the Chrome capture channel is staging-only. Its 24-hour snapshots from 4 October 09:13–09:20 UTC expire on 5 October at the corresponding times. New content requires new previews and approvals.
- Freeze an approved evaluation set with sufficient coverage, repeat live reliability measurements over time, and verify the full release thresholds in `docs/AI_EVALUATION_GUIDE.md`. A single 22-case pass does not establish a ≥98% citation-entailment rate or 100% critical-case reliability.

Keep the PR in draft and do not begin Phase 6 load/failure testing, production budgets, rollback deployment or beta until those Phase 5 gates pass. Private reports and credentials remain ignored; no connection string is included here.
