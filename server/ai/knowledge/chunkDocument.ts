import { createHash } from "node:crypto";
import type { KnowledgeChunkDraft } from "./types";

export type ChunkDocumentOptions = {
  maxCharacters?: number;
  minimumCharacters?: number;
  overlapCharacters?: number;
};

export function chunkDocument(
  content: string,
  metadata: Record<string, string>,
  options: ChunkDocumentOptions = {},
): KnowledgeChunkDraft[] {
  const maximum = options.maxCharacters ?? 1_800;
  const minimum = options.minimumCharacters ?? 120;
  const overlap = options.overlapCharacters ?? 180;
  if (minimum <= 0 || overlap < 0 || maximum <= minimum || overlap >= maximum) {
    throw new RangeError("Invalid knowledge chunking limits");
  }

  const paragraphs = content.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const chunks: Array<{ content: string; heading: string | null }> = [];
  let heading: string | null = null;
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (value) chunks.push({ content: value, heading });
    buffer = value.length > overlap ? tailAtWord(value, overlap) : "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.startsWith("# ")) {
      if (buffer.trim()) {
        flush();
        buffer = "";
      }
      heading = paragraph.slice(2).trim() || heading;
      continue;
    }
    for (const part of splitLongText(paragraph, maximum)) {
      const candidate = buffer ? `${buffer}\n\n${part}` : part;
      if (candidate.length > maximum && buffer) flush();
      buffer = buffer ? `${buffer}\n\n${part}` : part;
      if (buffer.length >= maximum) flush();
    }
  }
  if (buffer.trim()) chunks.push({ content: buffer.trim(), heading });

  if (
    chunks.length > 1 &&
    chunks.at(-1)!.content.length < minimum &&
    chunks.at(-1)!.heading === chunks.at(-2)!.heading
  ) {
    const tail = chunks.pop()!;
    const previous = chunks.at(-1)!;
    const merged = `${previous.content}\n\n${tail.content}`;
    if (merged.length <= maximum + overlap) previous.content = merged;
    else chunks.push(tail);
  }

  const seen = new Set<string>();
  const uniqueChunks = chunks.filter((chunk) => {
    const contentHash = sha256(chunk.content);
    if (seen.has(contentHash)) return false;
    seen.add(contentHash);
    return true;
  });

  return uniqueChunks.map((chunk, index) => ({
    content: chunk.content,
    contentHash: sha256(chunk.content),
    heading: chunk.heading,
    index,
    metadata: { ...metadata },
    tokenEstimate: Math.max(1, Math.ceil(chunk.content.length / 4)),
  }));
}

function splitLongText(value: string, maximum: number) {
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > maximum) {
    const candidates = [
      remaining.lastIndexOf(". ", maximum),
      remaining.lastIndexOf("; ", maximum),
      remaining.lastIndexOf(" ", maximum),
    ];
    const boundary = candidates.find((candidate) => candidate >= maximum * 0.6) ?? maximum;
    const includePunctuation = remaining[boundary] === "." || remaining[boundary] === ";";
    parts.push(remaining.slice(0, boundary + (includePunctuation ? 1 : 0)).trim());
    remaining = remaining.slice(boundary + (includePunctuation ? 1 : 0)).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function tailAtWord(value: string, size: number) {
  const start = Math.max(0, value.length - size);
  const boundary = value.indexOf(" ", start);
  return value.slice(boundary >= 0 ? boundary + 1 : start).trim();
}

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
