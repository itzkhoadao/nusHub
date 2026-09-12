import assert from "node:assert/strict";
import test from "node:test";
import { chunkDocument } from "./chunkDocument";

test("creates deterministic, bounded chunks while preserving section headings", () => {
  const content = [
    "# Service hours",
    "The service counter opens every weekday. ".repeat(18),
    "# Contact",
    "Contact the responsible office through the official portal. ".repeat(10),
  ].join("\n\n");
  const options = { maxCharacters: 260, minimumCharacters: 60, overlapCharacters: 30 };

  const first = chunkDocument(content, { service_area: "support" }, options);
  const second = chunkDocument(content, { service_area: "support" }, options);

  assert.deepEqual(first, second);
  assert.ok(first.length > 2);
  assert.equal(first[0].heading, "Service hours");
  assert.equal(first.at(-1)?.heading, "Contact");
  assert.ok(first.every((chunk) => chunk.content.length <= 290));
  assert.ok(first.every((chunk) => /^[0-9a-f]{64}$/.test(chunk.contentHash)));
  assert.deepEqual(first[0].metadata, { service_area: "support" });
});

test("rejects chunking limits that cannot make safe progress", () => {
  assert.throws(
    () => chunkDocument("content", {}, { maxCharacters: 100, minimumCharacters: 100 }),
    /Invalid knowledge chunking limits/,
  );
});

test("removes exact duplicate chunks before embedding and persistence", () => {
  const repeated = "This exact service notice is repeated on the official page.";
  const chunks = chunkDocument(`${repeated}\n\n${repeated}`, {}, {
    maxCharacters: 80,
    minimumCharacters: 20,
    overlapCharacters: 0,
  });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].index, 0);
});
