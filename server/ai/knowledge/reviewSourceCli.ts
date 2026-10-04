import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sha256 } from "./chunkDocument";
import { loadKnowledgeManifest } from "./manifest";
import { assertSourceApproval, sourceApprovalSchema } from "./sourceApproval";
import { getKnowledgeSource, KNOWLEDGE_SOURCE_REGISTRY_VERSION } from "./sourceRegistry";

async function main() {
  const args = process.argv.slice(2);
  const argument = (flag: string) => {
    const index = args.indexOf(flag);
    const value = index >= 0 ? args[index + 1] : undefined;
    if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
    return value;
  };
  if (!args.includes("--approve")) throw new Error("Human review requires an explicit --approve after reading the complete preview.");
  const manifest = await loadKnowledgeManifest(path.resolve(argument("--manifest")));
  const preview = z.object({
    sourceId: z.string(), manifestHash: z.string(), registryVersion: z.string(), inspectedAt: z.iso.datetime(),
    documents: z.array(z.object({ canonicalUrl: z.url(), contentHash: z.string(), content: z.string().min(1) })),
  }).parse(JSON.parse(await readFile(path.resolve(argument("--preview")), "utf8")) as unknown);
  if (preview.documents.some((item) => sha256(item.content) !== item.contentHash)) {
    throw new Error("Preview content hash mismatch. Inspect the source again.");
  }
  const approval = sourceApprovalSchema.parse({
    ...preview,
    documents: preview.documents.map(({ canonicalUrl, contentHash }) => ({ canonicalUrl, contentHash })),
    decision: "approved", reviewer: argument("--reviewer"), notes: argument("--notes"),
    reviewedAt: new Date().toISOString(),
  });
  assertSourceApproval(approval, manifest, KNOWLEDGE_SOURCE_REGISTRY_VERSION,
    getKnowledgeSource(manifest.sourceId).maxStalenessHours);
  await writeFile(path.resolve(argument("--out")), `${JSON.stringify(approval, null, 2)}\n`, { flag: "wx" });
  console.log("Recorded human source approval", { sourceId: approval.sourceId, reviewer: approval.reviewer });
}

void main().catch(() => {
  console.error("Source review could not be recorded. Check the preview, required flags, freshness, and output path.");
  process.exitCode = 1;
});
