import { readFile } from "node:fs/promises";
import { z } from "zod";
import { sha256 } from "./chunkDocument";
import { knowledgeManifestSchema, type KnowledgeManifest } from "./manifest";
import { KnowledgeSourcePolicyError } from "./sourceRegistry";
import type { ParsedKnowledgeDocument } from "./types";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceApprovalSchema = z.object({
  sourceId: z.string().min(1),
  manifestHash: hash,
  registryVersion: z.string().min(1),
  inspectedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime(),
  reviewer: z.string().trim().min(1).max(200),
  decision: z.literal("approved"),
  notes: z.string().trim().min(1).max(2000),
  documents: z.array(z.object({ canonicalUrl: z.url(), contentHash: hash }).strict()).min(1).max(100),
}).strict();

export type SourceApproval = z.infer<typeof sourceApprovalSchema>;

export function knowledgeManifestHash(manifest: KnowledgeManifest) {
  return sha256(JSON.stringify(knowledgeManifestSchema.parse(manifest)));
}

export async function loadSourceApproval(filename: string) {
  return sourceApprovalSchema.parse(JSON.parse(await readFile(filename, "utf8")) as unknown);
}

export function assertSourceApproval(
  approval: SourceApproval,
  manifest: KnowledgeManifest,
  registryVersion: string,
  maxAgeHours: number,
  now = new Date(),
) {
  const inspected = Date.parse(approval.inspectedAt);
  const reviewed = Date.parse(approval.reviewedAt);
  if (approval.sourceId !== manifest.sourceId ||
    approval.manifestHash !== knowledgeManifestHash(manifest) ||
    approval.registryVersion !== registryVersion ||
    inspected > reviewed || reviewed > now.getTime() ||
    now.getTime() - inspected > maxAgeHours * 3_600_000 ||
    approval.documents.length !== manifest.documents.length ||
    new Set(approval.documents.map((item) => item.canonicalUrl)).size !== approval.documents.length) {
    throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_INVALID", "Source approval does not match this manifest, registry, or freshness window. Inspect and review again.");
  }
}

export function assertApprovedContent(approval: SourceApproval, documents: ParsedKnowledgeDocument[]) {
  if (documents.length !== approval.documents.length || documents.some((document) =>
    !approval.documents.some((approved) => approved.canonicalUrl === document.canonicalUrl &&
      approved.contentHash === sha256(document.content)))) {
    throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_CHANGED", "Fetched content differs from the human-approved preview. Inspect and review again before ingestion.");
  }
}
