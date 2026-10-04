import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chunkDocument, sha256 } from "./chunkDocument";
import { parseKnowledgeDocument } from "./documentParser";
import { loadKnowledgeManifest } from "./manifest";
import { SafeSourceFetcher } from "./SafeSourceFetcher";
import { getKnowledgeSource } from "./sourceRegistry";
import { KNOWLEDGE_SOURCE_REGISTRY_VERSION } from "./sourceRegistry";
import { knowledgeManifestHash } from "./sourceApproval";

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = argument(args, "--manifest");
  const outputPath = argument(args, "--out", false);
  if (!manifestPath) {
    throw new Error("Usage: npm run ai:inspect -- --manifest path/to/manifest.json [--out path/to/preview.json]");
  }
  const manifest = await loadKnowledgeManifest(path.resolve(manifestPath));
  const source = getKnowledgeSource(manifest.sourceId);
  const fetcher = new SafeSourceFetcher({ maxDocumentBytes: 10 * 1024 * 1024, timeoutMs: 15_000 });
  const documents = [];
  const contentHashes = new Set<string>();
  for (const input of manifest.documents) {
    const fetched = await fetcher.fetch(source, input.url ?? source.baseUrl);
    const parsed = await parseKnowledgeDocument(fetched, {
      effectiveAt: input.effectiveAt,
      metadata: {
        ...input.metadata,
        ...(input.effectiveAt ? { effective_at: input.effectiveAt } : {}),
      },
      title: input.title,
    });
    const hash = sha256(parsed.content);
    if (contentHashes.has(hash)) throw new Error("Manifest contains duplicate extracted text");
    contentHashes.add(hash);
    const chunks = chunkDocument(parsed.content, parsed.metadata);
    if (chunks.length === 0) throw new Error(`No chunks extracted from ${parsed.canonicalUrl}`);
    documents.push({
      canonicalUrl: parsed.canonicalUrl,
      chunkCount: chunks.length,
      chunks,
      content: parsed.content,
      contentHash: hash,
      contentType: parsed.contentType,
      effectiveAt: parsed.effectiveAt,
      fetchedAt: parsed.fetchedAt,
      metadata: parsed.metadata,
      title: parsed.title,
    });
    console.log(JSON.stringify({
      url: parsed.canonicalUrl,
      characters: parsed.content.length,
      chunks: chunks.length,
      firstChunk: chunks[0].content.slice(0, 360),
    }));
  }
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify({
      inspectedAt: new Date().toISOString(),
      manifestHash: knowledgeManifestHash(manifest),
      registryVersion: KNOWLEDGE_SOURCE_REGISTRY_VERSION,
      sourceId: source.id,
      documents,
    }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    console.log(`Wrote preview to ${resolved}`);
  }
}

function argument(args: string[], flag: string, required = true) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a path${required ? "" : " when supplied"}`);
  }
  return value;
}

void main().catch((error: unknown) => {
  console.error("Knowledge source inspection failed", {
    code: error && typeof error === "object" && "code" in error ? error.code : "INSPECTION_FAILED",
    message: error instanceof Error ? error.message : "Unknown failure",
  });
  process.exitCode = 1;
});
