import assert from "node:assert/strict";
import test from "node:test";
import { parseKnowledgeDocument } from "./documentParser";
import { KnowledgeSourcePolicyError } from "./sourceRegistry";

test("extracts readable HTML and removes executable or navigational text", async () => {
  const parsed = await parseKnowledgeDocument(
    {
      bytes: Buffer.from(`
        <html><head><title>NUS Service</title><script>steal()</script></head>
        <body><nav>Ignore me</nav><main><h1>Opening hours</h1>
        <p>Monday to Friday, excluding public holidays.</p>
        <p>Use the official service counter for assistance.</p></main></body></html>`),
      canonicalUrl: "https://www.nus.edu.sg/service",
      contentType: "text/html",
      etag: null,
      fetchedAt: "2026-09-12T00:00:00.000Z",
      lastModified: null,
    },
    { metadata: { page_type: "hours" } },
  );

  assert.equal(parsed.title, "Opening hours");
  assert.match(parsed.content, /Monday to Friday/);
  assert.doesNotMatch(parsed.content, /steal|Ignore me/);
  assert.deepEqual(parsed.metadata, { page_type: "hours" });
});

test("rejects a 200 response carrying an access-control interstitial", async () => {
  await assert.rejects(
    parseKnowledgeDocument({
      bytes: Buffer.from('<html><head><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"><script src="/_Incapsula_Resource"></script></head><body>Access denied</body></html>'),
      canonicalUrl: "https://nusit.nus.edu.sg/contact/",
      contentType: "text/html",
      etag: null,
      fetchedAt: "2026-10-03T00:00:00.000Z",
      lastModified: null,
    }, { metadata: { service_area: "it_support" } }),
    (error: unknown) => error instanceof KnowledgeSourcePolicyError &&
      error.code === "SOURCE_FETCH_FAILED",
  );
});

test("rejects a short challenge page even without recognizable challenge wording", async () => {
  await assert.rejects(
    parseKnowledgeDocument({
      bytes: Buffer.from('<html><body><main><h1>Notice</h1><p>Reference 12345</p></main><script src="/_Incapsula_Resource"></script></body></html>'),
      canonicalUrl: "https://nusit.nus.edu.sg/contact/",
      contentType: "text/html",
      etag: null,
      fetchedAt: "2026-10-03T00:00:00.000Z",
      lastModified: null,
    }, { metadata: { service_area: "it_support" } }),
    (error: unknown) => error instanceof KnowledgeSourcePolicyError &&
      error.code === "SOURCE_FETCH_FAILED",
  );
});

test("accepts a real page with an Incapsula script alongside substantial content", async () => {
  const parsed = await parseKnowledgeDocument({
    bytes: Buffer.from(`<html><body><main><h1>Campus bus services</h1><p>${"Kent Ridge services A, D, K and R. ".repeat(8)}</p></main><script src="/_Incapsula_Resource"></script></body></html>`),
    canonicalUrl: "https://uci.nus.edu.sg/campus-life/campus-services/transportation/internal-shuttle-bus/",
    contentType: "text/html", etag: null, fetchedAt: "2026-10-04T00:00:00.000Z", lastModified: null,
  }, { metadata: { network_effective_at: "2026-01-05T00:00:00+08:00" } });
  assert.match(parsed.content, /Kent Ridge services/);
});
