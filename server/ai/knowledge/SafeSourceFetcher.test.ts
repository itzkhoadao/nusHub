import assert from "node:assert/strict";
import test from "node:test";
import { SafeSourceFetcher } from "./SafeSourceFetcher";
import type { KnowledgeSource } from "./types";

const source: KnowledgeSource = {
  allowedDomains: ["www.nus.edu.sg"],
  baseUrl: "https://www.nus.edu.sg/service",
  contentTypes: ["text/html"],
  enabled: true,
  highStakes: false,
  id: "test_source",
  maxStalenessHours: 24,
  name: "Test source",
  owner: "Test owner",
  requiredMetadata: [],
  trustTier: "T1",
};

function createFetcher(fetchImplementation: typeof fetch) {
  return new SafeSourceFetcher({
    fetch: fetchImplementation,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    maxDocumentBytes: 1_024,
    now: () => Date.parse("2026-09-12T00:00:00.000Z"),
    timeoutMs: 1_000,
  });
}

test("fetches only allowlisted public HTTPS content", async () => {
  const fetcher = createFetcher(async () =>
    new Response("<main>Approved source content</main>", {
      headers: { "content-type": "text/html; charset=utf-8", etag: '"v1"' },
    }),
  );

  const result = await fetcher.fetch(source, source.baseUrl);

  assert.equal(result.canonicalUrl, source.baseUrl);
  assert.equal(result.contentType, "text/html");
  assert.equal(result.etag, '"v1"');
});

test("rejects non-allowlisted redirects before following them", async () => {
  const fetcher = createFetcher(async () =>
    new Response(null, {
      headers: { location: "https://attacker.example/document" },
      status: 302,
    }),
  );

  await assert.rejects(
    fetcher.fetch(source, source.baseUrl),
    (error: unknown) => hasCode(error, "SOURCE_URL_REJECTED"),
  );
});

test("rejects private DNS answers and oversized streamed responses", async () => {
  const privateFetcher = new SafeSourceFetcher({
    fetch: async () => new Response("never reached"),
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    maxDocumentBytes: 1_024,
    timeoutMs: 1_000,
  });
  await assert.rejects(
    privateFetcher.fetch(source, source.baseUrl),
    (error: unknown) => hasCode(error, "SOURCE_URL_REJECTED"),
  );

  const multicastFetcher = new SafeSourceFetcher({
    fetch: async () => new Response("never reached"),
    lookup: async () => [{ address: "ff02::1", family: 6 }],
    maxDocumentBytes: 1_024,
    timeoutMs: 1_000,
  });
  await assert.rejects(
    multicastFetcher.fetch(source, source.baseUrl),
    (error: unknown) => hasCode(error, "SOURCE_URL_REJECTED"),
  );

  const oversized = createFetcher(async () =>
    new Response("x".repeat(1_025), { headers: { "content-type": "text/html" } }),
  );
  await assert.rejects(
    oversized.fetch(source, source.baseUrl),
    (error: unknown) => hasCode(error, "SOURCE_RESPONSE_TOO_LARGE"),
  );
});

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
