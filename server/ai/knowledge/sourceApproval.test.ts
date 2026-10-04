import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "./chunkDocument";
import type { KnowledgeManifest } from "./manifest";
import { assertApprovedContent, assertSourceApproval, knowledgeManifestHash, sourceApprovalSchema } from "./sourceApproval";
import type { ParsedKnowledgeDocument } from "./types";

const manifest: KnowledgeManifest = { sourceId: "nus_it", documents: [{ url: "https://nusit.nus.edu.sg/contact/", metadata: { service_area: "it_support" } }] };
const document: ParsedKnowledgeDocument = { canonicalUrl: manifest.documents[0].url!, content: "Official IT Care information", contentType: "text/html", effectiveAt: null, etag: null, fetchedAt: "2026-10-03T01:00:00.000Z", lastModified: null, metadata: {}, title: "IT Care" };
const approval = sourceApprovalSchema.parse({ sourceId: "nus_it", manifestHash: knowledgeManifestHash(manifest), registryVersion: "test", inspectedAt: "2026-10-03T00:00:00.000Z", reviewedAt: "2026-10-03T01:00:00.000Z", reviewer: "human-reviewer", decision: "approved", notes: "Checked complete source text", documents: [{ canonicalUrl: document.canonicalUrl, contentHash: sha256(document.content) }] });

test("approved preview rejects changed content, URL, and incomplete snapshots", () => {
  assertApprovedContent(approval, [document]);
  assert.throws(() => assertApprovedContent(approval, [{ ...document, content: "Changed facts" }]), /differs/);
  assert.throws(() => assertApprovedContent(approval, [{ ...document, canonicalUrl: "https://nusit.nus.edu.sg/other/" }]), /differs/);
  assert.throws(() => assertApprovedContent(approval, []), /differs/);
});

test("approval rejects manifest drift, registry changes, expired or future review", () => {
  const now = new Date("2026-10-03T02:00:00.000Z");
  assertSourceApproval(approval, manifest, "test", 24, now);
  assert.throws(() => assertSourceApproval(approval, { ...manifest, metadata: { changed: "yes" } }, "test", 24, now));
  assert.throws(() => assertSourceApproval(approval, manifest, "new", 24, now));
  assert.throws(() => assertSourceApproval(approval, manifest, "test", 1, now));
  assert.throws(() => assertSourceApproval(approval, manifest, "test", 24, new Date("2026-10-03T00:00:00.000Z")));
});
