import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { BrowserCaptureFetcher } from "./BrowserCaptureFetcher";
import { parseKnowledgeDocument } from "./documentParser";
import { getKnowledgeSource, KnowledgeSourcePolicyError } from "./sourceRegistry";

test("staging capture preserves official URL and refuses tampered or stale evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nushub-capture-"));
  const source = getKnowledgeSource("nus_transport");
  const html = Buffer.from("<html><body><p>Original official page</p></body></html>");
  const text = [
    "Navigation to omit",
    "NUS Internal Shuttle Bus (ISB) Services",
    "Network Map with effect from 5 Jan 2026",
    "Kent Ridge Campus", "ISB Service A", "ISB Service D", "ISB Service K", "ISB Service R",
    "Bukit Timah Campus", "ISB Service P", "Corporate Admin", "Campus Planning",
  ].join("\n");
  const metadata = {
    sourceUrl: source.baseUrl, capturedAt: "2026-10-04T08:00:00.000Z",
    method: "User-authorized existing Chrome tab; rendered DOM export",
    sha256: createHash("sha256").update(html).digest("hex"),
    htmlBytes: html.byteLength, textCharacters: text.length,
    textSha256: createHash("sha256").update(text).digest("hex"),
    htmlComplete: true, ingestionApproved: false,
  };
  try {
    await writeFile(path.join(directory, "transport.html"), html);
    await writeFile(path.join(directory, "transport.txt"), text);
    await writeFile(path.join(directory, "transport.metadata.json"), JSON.stringify(metadata));
    const fetcher = new BrowserCaptureFetcher(directory, 10_000, () => new Date("2026-10-04T09:00:00.000Z"));
    const fetched = await fetcher.fetch(source, source.baseUrl);
    const parsed = await parseKnowledgeDocument(fetched, { metadata: { network_effective_at: "2026-01-05T00:00:00+08:00" } });
    assert.equal(fetched.canonicalUrl, source.baseUrl);
    assert.match(parsed.content, /ISB Service R/);
    assert.doesNotMatch(parsed.content, /Navigation to omit|Original official page/);
    await assert.rejects(fetcher.fetch(source, "https://evil.example/source"),
      (error: unknown) => error instanceof KnowledgeSourcePolicyError && error.code === "SOURCE_URL_REJECTED");

    const altered = Buffer.from(await readFile(path.join(directory, "transport.html")));
    altered[20] ^= 1;
    await writeFile(path.join(directory, "transport.html"), altered);
    await assert.rejects(fetcher.fetch(source, source.baseUrl),
      (error: unknown) => error instanceof KnowledgeSourcePolicyError && error.code === "SOURCE_APPROVAL_CHANGED");
    await writeFile(path.join(directory, "transport.html"), html);
    await writeFile(path.join(directory, "transport.txt"), text.replace("Service R", "Service X"));
    await assert.rejects(fetcher.fetch(source, source.baseUrl),
      (error: unknown) => error instanceof KnowledgeSourcePolicyError && error.code === "SOURCE_APPROVAL_CHANGED");
    await writeFile(path.join(directory, "transport.txt"), text);
    const staleFetcher = new BrowserCaptureFetcher(directory, 10_000, () => new Date("2026-10-06T09:00:00.000Z"));
    await assert.rejects(staleFetcher.fetch(source, source.baseUrl),
      (error: unknown) => error instanceof KnowledgeSourcePolicyError && error.code === "SOURCE_APPROVAL_INVALID");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
