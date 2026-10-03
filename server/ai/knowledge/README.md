# Curated knowledge: staging and evaluation

This workflow intentionally separates a **source preview**, a **staging database**, and **human approval**. None of the commands below silently switches to the default `DATABASE_URL`.

## 1. Prepare staging

Provision a separate PostgreSQL database with pgvector available. Set `STAGING_DATABASE_URL` in the shell before running these commands (for example, `$env:STAGING_DATABASE_URL = '<your private staging URL>'` in PowerShell). It must point to a different host/database target than `DATABASE_URL`. The CLI does not automatically load `.env.staging`; if you use a private file, load it into the shell yourself. Never paste connection strings into issues or chat.

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

After review, ingest the full manifest into staging:

```powershell
npm run ai:ingest -- --staging --manifest ai/knowledge/manifests/registrar-2026-27.json
```

Repeat one source at a time. A manifest is a **complete replacement snapshot** for that source, not an incremental addition. Check the reported document/chunk counts. Re-run the same manifest to check the `unchanged` path, then change a staging-only manifest and verify that failed refreshes do not supersede the previous published snapshot. The production ingestion mode now requires an explicit `--production` flag.

As of 2026-10-03, the registrar PDF preview succeeded locally (5,200 characters, four chunks). The five HTML source pages returned access-control interstitials to this machine's fetcher; their manifests are **candidates, not ingestion-approved**. Recheck from the staging runtime or arrange an authorized source delivery mechanism. Do not copy browser-rendered text into the database as a workaround.

## 3. Retrieval and answer evaluation

`evaluation/knowledge-cases.v1.json` has ten draft cases: six exact-source questions, a wrong-year no-answer case, two private/credential refusals, and an urgent-support scenario. Its `reviewStatus` is deliberately `pending_human_review`.

```powershell
npm run eval:knowledge
npm run eval:knowledge -- --run --out evaluation-results/knowledge-live.json
```

The first command only validates the case file. The second requires `STAGING_DATABASE_URL`, a Gemini key, migration `012`, and all expected documents published in staging. It measures exact-document hit@5 and recall@5, answer-relevant chunk hit@5, MRR@5, wrong-year/no-result behavior, status, and citation identity. The report includes retrieved chunks, answers, and case-specific human rubrics. Keep reports in the ignored `evaluation-results/` directory.

Automatic citation checks prove that a citation points to a retrieved document; they **cannot prove that the cited passage entails every claim**. A human reviewer must inspect every answer against its source. High/critical cases need a second reviewer. Never treat `automaticPassCount` as release approval. Update the draft case set after review, and only then decide whether the product targets in `docs/AI_EVALUATION_GUIDE.md` are met.

## Source provenance

- Registrar: official AY2026/27 PDF, dated 30 July 2026.
- UCI: current Internal Shuttle Bus page, with network effective 5 January 2026.
- Libraries: official 24-hour study spaces page.
- OSA: official student support directory.
- UHC: official FAQ page.
- NUS IT: official IT Care contact page.

The source registry still controls the allowed domains, file types, freshness windows, and required metadata. The manifest is not an authorization override.
