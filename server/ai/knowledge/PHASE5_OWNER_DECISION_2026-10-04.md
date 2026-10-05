# Phase 5 owner decision and agent audit — 4 October 2026

Historical decision. The owner revised the review and freshness operating policy on 5 October; see [the current policy](PHASE5_RELEASE_POLICY.md) and [completion evidence](PHASE5_COMPLETION_2026-10-05.md). The records below retain their original scope and date.

**Decision: integrate the verified staging implementation into `main`; keep AI production promotion and Phase 6 gated.** The repository owner's 4 October instruction waived independent human review for this staging milestone and requested retaining the captured pages for one to two months. This document records that choice without inventing human reviewers or treating archived pages as newly verified.

## Saved source material and freshness

The original five browser captures, extracted text, metadata and images remain in ignored `server/evaluation-results/browser-capture-20261004/`. A second local copy is `server/evaluation-results/archives/phase5-browser-capture-20261004.zip` (8,538,239 bytes, SHA-256 `5463a9c15e8c38eeaeb72b70b022163d0548aba34be18715c555411927f42f82`). All 88 files were read back from the archive and compared byte-for-byte by SHA-256 with the originals. Its adjacent manifest records a **3 December 2026** retention target. Neither private local artifact is committed to GitHub.

Retention and currentness are separate. The five HTML pages remain usable as an auditable **4 October snapshot** for one to two months. They are not asserted to be current after their registry's 24-hour limit. The SQL retriever excludes expired versions, the staging evaluation refuses an expired corpus, and replaying the saved capture cannot advance `verified_at`. This matters particularly for opening hours, appointment details and urgent contacts. A new current-answer run needs a fresh capture and approval, or an authorized official refresh channel. The user chose monthly or bimonthly manual updates; this leaves periods with no current verified HTML answers unless that channel is established.

## Point-in-time staging proof

The final full live report is ignored `server/evaluation-results/phase5-v5-live-20261004.json` (SHA-256 `0c40e5aa600d3c1e43392225a7f04d2ef769810e74f83a6ca2bf53c307e12707`). It ran `knowledge-v5-draft` against six published official documents and ten chunks with `gemini-3.5-flash-lite`: **22/22 automatic passes**; document hit@5, evidence hit@5, recall@5, MRR@5, and no-result accuracy were each 1.0 on this small set. A preceding repeat of the prior 22-case draft also passed 22/22. This shows repeatability over three successful runs, not a statistical guarantee of 99% retrieval or 100% critical reliability.

The latest real SQL scenario report, `phase5-v5-sql-20261004.json`, passed baseline retrieval, stale exclusion, wrong-year isolation, declared conflict handling and rolled-back fixture preservation. `phase5-v5-chat-api-20261004.json` passed authenticated HTTP/JWT/PostgreSQL/Gemini checks for ownership, grounded streaming, citations, passages, clarification, idempotency, quota, feedback, rename and deletion; its synthetic account was removed. Server lint, **173 tests** and build passed.

## Agent source and answer audit

This is **Codex agent inspection**, under the owner's explicit review waiver, not independent human review. I compared the final report's answers and cited passages with the saved previews and the current official pages below. The Registrar PDF's table order had previously been visually inspected. The 12 answered cases had no unsupported material claim identified in this audit; all expected source URLs and chunk/version identities matched the report. This judgment is qualitative and does not substitute for the guide's independently measured claim-entailment threshold.

| Cases | Agent finding | Official reference |
| --- | --- | --- |
| K001, K015–K017 | The four regular-semester reading/exam date ranges match the AY2026/27 PDF. K001 and K016 cite both the split Semester 1 heading and date row. | [Registrar PDF](https://nus.edu.sg/registrar/docs/default-source/calendar/ay2026-2027.pdf) |
| K002 | A, D, K and R services and R1/R2 effective-date context are supported; no image-only stop order was asserted. | [UCI shuttle page](https://uci.nus.edu.sg/campus-life/campus-services/transportation/internal-shuttle-bus/) |
| K003, K018 | Level 2 is 24/7 daily; Level 3 is 24/7 **during term time**, both with NUS-card access. The qualifier stays adjacent to the Level 3 answer. | [NUS Libraries](https://nus.edu.sg/nuslibraries/spaces/24-hour-study-spaces) |
| K004, K010, K022 | The directory URL, Lifeline NUS `6516 7777`, 24-hour wording, A&E and `999` match the OSA page. The two urgent responses are deterministic and avoid generation delay. | [OSA support directory](https://osa.nus.edu.sg/wellness/nus-student-support-directory/) |
| K005 | Student booking through MyUHC/uNivUS is supported by the appointment FAQ. | [UHC FAQ](https://nus.edu.sg/uhc/faqs) |
| K006 | The walk-in counter location is Level 6, Central Library Building. | [NUS IT contact](https://nusit.nus.edu.sg/contact/) |

K007–K009 and K011–K014 correctly avoid an unsupported year, private records, credentials, ambiguous semester or mini-semester, and injected instructions. K019 and K020 now abstain deterministically from an image-only stop sequence and live appointment wait time while directing users to the official channel. K021 gives immediate general emergency direction without diagnosing or inventing a NUS contact. The `knowledge-v5-draft` ground truth and these judgments are still labelled **pending human review** in machine-readable artifacts; no false reviewer names or approvals were entered.

## Limits of this decision

This is a **point-in-time technical staging proof**, not a declaration that the full `docs/AI_EVALUATION_GUIDE.md` release gate has passed. The owner waived the independent review process for this milestone, but the guide's human citation/contact review and broader approved safety coverage remain unmeasured. The 22 cases are a development draft, and the protected pages lack a durable refresh mechanism. Production AI should remain controlled by `AI_ENABLED` and should not rely on the 4 October HTML snapshot for current facts after expiry. Do not start Phase 6 or a public beta solely on this evidence.
