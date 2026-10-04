# Curated knowledge: staging and evaluation

This workflow intentionally separates a **source preview**, a **staging database**, and **human approval**. None of the commands below silently switches to the default `DATABASE_URL`.

## 1. Prepare staging

Provision a separate PostgreSQL database with pgvector available. The staging CLI reads `server/.env.staging` privately when `STAGING_DATABASE_URL` is absent from the shell; explicit shell configuration wins. It must point to a different host/database target than `DATABASE_URL`. Never paste connection strings into issues or chat.

For local staging, run from the repository root:

```powershell
./server/scripts/setup-knowledge-staging.ps1
# If Docker is absent from PATH on Windows:
./server/scripts/setup-knowledge-staging.ps1 -Docker 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
```

The script generates a random password in ignored `.env.staging`, restricts that file to its Windows owner, starts a dedicated Compose project with a persistent volume and loopback port 55432, and applies migrations. It preserves existing configuration on retry. The image is versioned (`pgvector/pgvector:0.8.2-pg18-bookworm`). Startup and database health must succeed before claiming staging is ready. In a restricted agent sandbox, owner-only file access can require an approved elevated command; a missing/unreadable private file does not trigger a default-database fallback.

From `server/`:

```powershell
npm run ai:staging:prepare
```

This applies the normal migrations through `012` to staging and verifies pgvector. Do not use it for production. The default remote database is deliberately not used.

## 2. Inspect, review, and ingest one source at a time

The six candidate manifests are in `ai/knowledge/manifests/`. Inspect each **before** ingestion:

```powershell
npm run ai:inspect -- --manifest ai/knowledge/manifests/registrar-2026-27.json --out evaluation-results/registrar-preview.json
```

The preview contains the fetched URL, full extracted text, hash, and every chunk. Review it for access-control pages, boilerplate, missing tables, wrong reading order, outdated dates, and accidental personal data. An HTTP 200 response is not proof that the real page was fetched. The inspector and parser reject known access-control interstitials. A failed preview means **do not ingest** that source.

After a human approves the source, record the approval against the complete preview:

```powershell
npm run ai:source:approve -- --approve --manifest ai/knowledge/manifests/registrar-2026-27.json --preview evaluation-results/registrar-preview.json --reviewer YOUR_NAME --notes "Reviewed text, chunks, dates and PDF table order" --out evaluation-results/registrar-approval.json
```

Do not run this command to invent a reviewer or imply independent review occurred. Delegated approval must state that delegation in its notes. Source ingestion authorization and release-quality human factual review are separate records.

Then ingest the full manifest into staging:

```powershell
npm run ai:ingest -- --staging --manifest ai/knowledge/manifests/registrar-2026-27.json --approval evaluation-results/registrar-approval.json
```

Repeat one source at a time. A manifest is a **complete replacement snapshot** for that source, not an incremental addition. Check the reported document/chunk counts. Re-run the same manifest to check the `unchanged` path, then change a staging-only manifest and verify that failed refreshes do not supersede the previous published snapshot. The production ingestion mode now requires an explicit `--production` flag.

Both staging and production ingestion require approval. Approval binds the source ID, parsed manifest hash, registry version, canonical URLs and extracted content hashes. It expires according to source freshness. Changed content is rejected before embedding, reuse or publication; review a fresh preview to approve a changed snapshot.

After publication, verify a real failed refresh against the staging ledger:

```powershell
npm run ai:staging:verify -- --manifest ai/knowledge/manifests/registrar-2026-27.json --approval evaluation-results/registrar-approval.json --out evaluation-results/staging-snapshot-preservation.json
```

This deliberately mismatches the in-memory approved content hash, fetches the real source, and asserts that the failed run is recorded while published version/document/chunk identities remain identical. It never creates a new human approval or uses the default database.

Generation uses explicit `AI_THINKING_LEVEL=low` with a default combined thinking/output budget of 2,048 tokens. The previous 800-token budget produced a failed live structured-answer run. Truncated/invalid JSON still fails closed; it is never repaired into a guessed answer. Reports record thinking level and token budget so changing them requires a new evaluation run. Provider outages remain visible failures, even when a later run passes.

As of 2026-10-03, the registrar PDF preview succeeded locally (5,200 characters, four chunks). The five HTML source pages returned access-control interstitials to this machine's fetcher; their manifests are **candidates, not ingestion-approved**. Recheck from the staging runtime or arrange an authorized source delivery mechanism. Do not copy browser-rendered text into the database as a workaround.

## 3. Retrieval and answer evaluation

`evaluation/knowledge-cases.v1.json` now contains the `knowledge-v2-draft` dataset with fourteen cases, including missing-year/semester clarification, mini-semester extraction limits and injection refusal. Its `reviewStatus` remains `pending_human_review`; the filename stays stable for existing tooling.

```powershell
npm run eval:knowledge
npm run eval:knowledge -- --run --out evaluation-results/knowledge-live.json
```

The first command only validates the case file. The second requires `STAGING_DATABASE_URL`, a Gemini key, migration `012`, and all expected documents published in staging. It measures exact-document hit@5 and recall@5, answer-relevant chunk hit@5, MRR@5, wrong-year/no-result behavior, status, and citation identity. The report includes retrieved chunks, answers, and case-specific human rubrics. Keep reports in the ignored `evaluation-results/` directory.

Automatic citation checks prove that a citation points to a retrieved document; they **cannot prove that the cited passage entails every claim**. A human reviewer must inspect every answer against its source. High/critical cases need a second reviewer. Never treat `automaticPassCount` as release approval. Update the draft case set after review, and only then decide whether the product targets in `docs/AI_EVALUATION_GUIDE.md` are met.

When only Registrar is approved and available, a development-only pilot can exercise calendar, wrong-year and refusal cases:

```powershell
npm run eval:knowledge -- --run --cases K001,K007,K008,K009,K011,K012,K013,K014 --out evaluation-results/knowledge-registrar-pilot.json
```

The report marks this as `development_subset`, lists omitted cases, and records dataset hash, registry, models, embedding dimensions and per-answer model/prompt identity. It never substitutes for the full suite. The full suite fails preflight if any expected source document is missing.

Test stale filtering, wrong-year isolation and declared conflicts through the real SQL retriever:

```powershell
npm run ai:staging:scenarios -- --out evaluation-results/staging-sql-scenarios.json
npm run eval:chat:staging -- --out evaluation-results/staging-chat-api.json
```

The SQL scenarios use stored-vector fixtures and synthetic conflict metadata inside a rolled-back transaction. They do not measure live Gemini quality or publish synthetic knowledge. The chatbot API check uses a temporary staging account, actual HTTP/JWT/SQL, and one live Gemini answer; it verifies clarification follow-up, replay, quota, ownership, citations, passage lookup, feedback, rename and deletion, then removes its account. Use a new output filename for each run.

Approval is enforced inside `KnowledgeIngestionService`, including manifest/domain validation, review freshness and fetched-text hashes. Calling the service directly cannot skip the approval gate. Approval audit metadata is added by the service without changing the approved manifest.

Review the dataset by adding `reviews` entries (`caseId`, `reviewer`, `reviewedAt`, `decision`, `notes`). `reviewStatus: approved` is accepted only when every case has its required distinct reviewers and no rejection. High/critical cases require two. Repeated entries with the same reviewer do not satisfy independent review. Keep the dataset pending until factual verification is actually complete; source approval does not approve draft ground truth.

Create and validate an answer-review packet bound to the exact live report:

```powershell
npm run eval:knowledge:review -- --report evaluation-results/knowledge-live.json --out evaluation-results/knowledge-human-reviews.json
# Humans complete the JSON; an adjacent Markdown file includes each answer and passage.
npm run eval:knowledge:review -- --report evaluation-results/knowledge-live.json --reviews evaluation-results/knowledge-human-reviews.json
```

The validator rejects incomplete judgments, wrong report hashes, duplicate reviewers and future dates, and checks contact accuracy when the case declares it. A reviewed pilot pass still does not authorize Phase 6: claim-level release metrics, full approved safety/injection regression coverage, and stale/conflicting-source staging evidence remain mandatory.

## Source provenance

- Registrar: official AY2026/27 PDF, dated 30 July 2026.
- UCI: current Internal Shuttle Bus page, with network effective 5 January 2026.
- Libraries: official 24-hour study spaces page.
- OSA: official student support directory.
- UHC: official FAQ page.
- NUS IT: official IT Care contact page.

The source registry still controls the allowed domains, file types, freshness windows, and required metadata. The manifest is not an authorization override.
