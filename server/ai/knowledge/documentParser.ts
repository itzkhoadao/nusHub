import { load } from "cheerio";
import { PDFParse } from "pdf-parse";
import type {
  FetchedKnowledgeDocument,
  ParsedKnowledgeDocument,
} from "./types";
import { KnowledgeSourcePolicyError } from "./sourceRegistry";

export async function parseKnowledgeDocument(
  fetched: FetchedKnowledgeDocument,
  input: {
    effectiveAt?: string;
    metadata: Record<string, string>;
    title?: string;
  },
): Promise<ParsedKnowledgeDocument> {
  const parsed =
    fetched.contentType === "text/html"
      ? parseHtml(fetched.bytes)
      : await parsePdf(fetched.bytes);
  const content = normalizeText(parsed.content);
  if (content.length < 40) {
    throw new KnowledgeSourcePolicyError(
      "SOURCE_DOCUMENT_EMPTY",
      "The source did not contain enough readable text to publish.",
    );
  }

  return {
    canonicalUrl: fetched.canonicalUrl,
    content,
    contentType: fetched.contentType,
    effectiveAt: input.effectiveAt ?? null,
    etag: fetched.etag,
    fetchedAt: fetched.fetchedAt,
    lastModified: fetched.lastModified,
    metadata: { ...input.metadata },
    title: normalizeInline(input.title ?? parsed.title ?? fallbackTitle(fetched.canonicalUrl)),
  };
}

function parseHtml(bytes: Uint8Array) {
  const $ = load(Buffer.from(bytes).toString("utf8"));
  $("script,style,noscript,template,svg,form,nav,header,footer").remove();
  const title =
    $("main h1, article h1, h1").first().text().trim() ||
    $("title").first().text().trim();
  const root = $("main, article").first().length
    ? $("main, article").first()
    : $("body");
  const blocks: string[] = [];
  root.find("h1,h2,h3,h4,h5,h6,p,li,th,td").each((_index, element) => {
    const value = normalizeInline($(element).text());
    if (!value) return;
    const tag = element.tagName.toLowerCase();
    blocks.push(/^h[1-6]$/.test(tag) ? `# ${value}` : value);
  });
  return { content: blocks.join("\n\n"), title: title || null };
}

async function parsePdf(bytes: Uint8Array) {
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  try {
    const result = await parser.getText();
    return { content: result.text, title: null };
  } catch (error) {
    throw new KnowledgeSourcePolicyError(
      "SOURCE_DOCUMENT_EMPTY",
      "The PDF source could not be parsed safely.",
      { cause: error },
    );
  } finally {
    await parser.destroy();
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInline(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function fallbackTitle(value: string) {
  const url = new URL(value);
  const segment = url.pathname.split("/").filter(Boolean).at(-1);
  return segment ? segment.replace(/[-_]+/g, " ") : url.hostname;
}
