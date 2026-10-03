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
