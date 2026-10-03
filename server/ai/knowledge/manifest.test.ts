import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadKnowledgeManifest } from "./manifest";
import { createKnowledgeStagingPool } from "./stagingDatabase";

test("all curated manifests are valid without fetching or writing to a database", async () => {
  const names = ["registrar-2026-27", "transport", "libraries", "student-affairs", "health-centre", "it-care"];
  const manifests = await Promise.all(names.map((name) =>
    loadKnowledgeManifest(path.join(__dirname, "manifests", `${name}.json`)),
  ));
  assert.equal(new Set(manifests.map((item) => item.sourceId)).size, 6);
});

test("staging database cannot silently alias the default database", () => {
  assert.throws(() => createKnowledgeStagingPool({}), /STAGING_DATABASE_URL/);
  assert.throws(() => createKnowledgeStagingPool({
    DATABASE_URL: "postgresql://prod:secret@db.example.edu:5432/nushub",
    STAGING_DATABASE_URL: "postgresql://other:different@db.example.edu/nushub",
  }), /different host\/database/);
  const pool = createKnowledgeStagingPool({
    DATABASE_URL: "postgresql://prod:secret@db.example.edu/nushub",
    STAGING_DATABASE_URL: "postgresql://stage:secret@db.example.edu/nushub_staging",
  });
  return pool.end();
});
