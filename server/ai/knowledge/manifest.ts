import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getKnowledgeSource, KnowledgeSourcePolicyError } from "./sourceRegistry";

const stringMap = z.record(z.string(), z.string().trim().min(1).max(500));

export const knowledgeManifestSchema = z.object({
  documents: z.array(z.object({
    effectiveAt: z.iso.datetime({ offset: true }).optional(),
    metadata: stringMap.optional(),
    title: z.string().trim().min(1).max(500).optional(),
    url: z.url().optional(),
  }).strict()).min(1).max(100),
  metadata: stringMap.optional(),
  sourceId: z.string().regex(/^[a-z0-9_]{3,100}$/),
}).strict();

export type KnowledgeManifest = z.infer<typeof knowledgeManifestSchema>;

export async function loadKnowledgeManifest(filename: string): Promise<KnowledgeManifest> {
  const raw = await readFile(filename, "utf8");
  return validateKnowledgeManifest(JSON.parse(raw) as unknown);
}

export function validateKnowledgeManifest(raw: unknown): KnowledgeManifest {
  const manifest = knowledgeManifestSchema.parse(raw);
  const source = getKnowledgeSource(manifest.sourceId);
  const urls = new Set<string>();
  for (const document of manifest.documents) {
    const url = new URL(document.url ?? source.baseUrl);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443") || !source.allowedDomains.includes(hostname)
    ) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_URL_REJECTED", "Manifest URL is outside the approved HTTPS source domains.",
      );
    }
    url.hash = "";
    if (urls.has(url.toString())) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID", "A manifest contains duplicate document URLs.",
      );
    }
    urls.add(url.toString());
    const metadata = document.metadata ?? {};
    for (const key of Object.keys(metadata)) {
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_METADATA_INVALID", `Manifest metadata key ${key} is invalid.`,
        );
      }
    }
    for (const key of source.requiredMetadata) {
      if (!metadata[key] && !(key === "effective_at" && document.effectiveAt)) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_METADATA_INVALID", `Manifest document is missing ${key}.`,
        );
      }
    }
    if (source.requiredMetadata.includes("effective_at") && !document.effectiveAt) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID", "A versioned source requires effectiveAt.",
      );
    }
    for (const key of ["effective_at", "network_effective_at"]) {
      if (metadata[key] && !Number.isFinite(Date.parse(metadata[key]))) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_METADATA_INVALID", `Manifest ${key} must be a valid timestamp.`,
        );
      }
    }
    if (document.effectiveAt && metadata.effective_at &&
      new Date(document.effectiveAt).getTime() !== new Date(metadata.effective_at).getTime()) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID", "The effectiveAt and effective_at values disagree.",
      );
    }
    if (document.effectiveAt && metadata.network_effective_at &&
      new Date(document.effectiveAt).getTime() !== new Date(metadata.network_effective_at).getTime()) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_METADATA_INVALID", "The effectiveAt and network_effective_at values disagree.",
      );
    }
  }
  return manifest;
}
