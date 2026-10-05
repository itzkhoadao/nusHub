import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { createKnowledgeStagingPool } from "./stagingDatabase";
import { PostgresKnowledgeRepository } from "./PostgresKnowledgeRepository";
import { HybridKnowledgeRetriever } from "./HybridKnowledgeRetriever";
import { answerKnowledgeQuestion } from "./answerKnowledgeQuestion";
import { listKnowledgeSources } from "./sourceRegistry";

// SQL integration scenarios use stored vectors and transaction-local metadata.
// They do not measure live model quality or approve new source content.
async function main() {
  const args = process.argv.slice(2);
  const output = args[args.indexOf("--out") + 1];
  if (!args.includes("--out") || !output || output.startsWith("--")) throw new Error("--out is required");
  const pool = createKnowledgeStagingPool();
  const client = await pool.connect();
  const snapshot = async () => JSON.stringify((await client.query(
    `SELECT sv.id, sv.status, sv.verified_at, c.id AS chunk_id, c.content_hash, c.metadata
     FROM ai_source_versions sv JOIN ai_chunks c ON c.source_version_id = sv.id
     ORDER BY sv.id, c.id`,
  )).rows);
  try {
    const before = await snapshot();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const rows = await client.query<{ id: string; version_id: string; embedding: string }>(
      `SELECT c.id, c.source_version_id AS version_id, c.embedding::text AS embedding
       FROM ai_chunks c JOIN ai_source_versions sv ON sv.id = c.source_version_id
       WHERE sv.status = 'published' AND c.source_id = 'nus_registrar_calendar'
       ORDER BY c.id LIMIT 2`,
    );
    assert.equal(rows.rowCount, 2, "An approved Registrar snapshot with two chunks is required");
    const embedding = JSON.parse(rows.rows[0].embedding) as number[];
    const retriever = new HybridKnowledgeRetriever(new PostgresKnowledgeRepository(client as unknown as Pool), {
      dimensions: 768, model: "gemini-embedding-001", embedQuery: async () => embedding, embedDocuments: async () => [],
    }, { candidateLimit: 30, resultLimit: 5, maxSemanticDistance: 2 });
    const query = { text: "Semester 1 reading week", filters: { sourceIds: ["nus_registrar_calendar"], academicYear: "AY2026/27", trustTiers: ["T1" as const] } };
    assert.ok((await retriever.search(query)).length > 0, "Baseline retrieval must succeed");
    assert.equal((await retriever.search({ ...query, filters: { ...query.filters, academicYear: "AY2024/25" } })).length, 0);
    await client.query("SAVEPOINT fresh");
    await client.query("UPDATE ai_source_versions SET verified_at = NOW() - INTERVAL '10 years' WHERE id = $1", [rows.rows[0].version_id]);
    assert.equal((await retriever.search(query)).length, 0, "Stale evidence must be excluded by both SQL branches");
    await client.query("ROLLBACK TO SAVEPOINT fresh");
    const monthlyExpiry = [];
    for (const source of listKnowledgeSources()) {
      const stored = await client.query<{ id: string; embedding: string }>(
        `SELECT sv.id, c.embedding::text AS embedding FROM ai_source_versions sv
         JOIN ai_chunks c ON c.source_version_id = sv.id
         WHERE sv.status = 'published' AND sv.source_id = $1 ORDER BY c.id LIMIT 1`, [source.id]);
      assert.equal(stored.rowCount, 1, `Missing staging source ${source.id}`);
      const sourceRetriever = new HybridKnowledgeRetriever(new PostgresKnowledgeRepository(client as unknown as Pool), {
        dimensions: 768, model: "gemini-embedding-001",
        embedQuery: async () => JSON.parse(stored.rows[0].embedding) as number[], embedDocuments: async () => [],
      }, { candidateLimit: 30, resultLimit: 5, maxSemanticDistance: 2 });
      const sourceQuery = { text: "official information", filters: { sourceIds: [source.id] } };
      await client.query("SAVEPOINT source_age");
      // Synthetic dates exist only inside this transaction; no snapshot is refreshed.
      await client.query("UPDATE ai_source_versions SET verified_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [stored.rows[0].id]);
      assert.ok((await sourceRetriever.search(sourceQuery)).length > 0);
      await client.query("UPDATE ai_source_versions SET verified_at = NOW() - make_interval(hours => $2::int) WHERE id = $1",
        [stored.rows[0].id, source.maxStalenessHours + 1]);
      assert.equal((await sourceRetriever.search(sourceQuery)).length, 0, `${source.id}: expired evidence leaked`);
      const questions: Record<string, string> = {
        nus_registrar_calendar: "When is regular Semester 1 reading week in AY2026/27?",
        nus_transport: "What NUS shuttle services are available?", nus_libraries: "What are the library opening hours?",
        nus_osa: "I might hurt myself tonight. Where can I get urgent NUS support?",
        nus_uhc: "How do I book a UHC medical appointment?", nus_it: "Where is IT Care?",
      };
      let generationCalls = 0;
      const expiredAnswer = await answerKnowledgeQuestion({ requestId: "11111111-1111-4111-8111-111111111111",
        text: questions[source.id] }, {
        retriever: { search: () => sourceRetriever.search(sourceQuery) }, maxContextChars: 16_000,
        provider: { generateAnswer: async () => { generationCalls++; throw new Error("Expired evidence must not generate"); } },
      });
      assert.equal(expiredAnswer.groundedAnswer.status, "not_verified");
      assert.equal(expiredAnswer.groundedAnswer.citations.length, 0);
      assert.equal(generationCalls, 0);
      if (source.id === "nus_osa") {
        assert.match(expiredAnswer.groundedAnswer.answer, /emergency services/);
        assert.doesNotMatch(expiredAnswer.groundedAnswer.answer, /6516|999/);
      }
      await client.query("UPDATE ai_source_versions SET verified_at = NOW() + INTERVAL '1 day' WHERE id = $1", [stored.rows[0].id]);
      assert.equal((await sourceRetriever.search(sourceQuery)).length, 0, `${source.id}: future timestamp leaked`);
      await client.query("ROLLBACK TO SAVEPOINT source_age");
      monthlyExpiry.push({ sourceId: source.id, maxStalenessHours: source.maxStalenessHours,
        freshFixtureRetrieved: true, expiredExcluded: true, futureExcluded: true,
        expiredStatus: expiredAnswer.groundedAnswer.status, generationCalls });
    }
    for (const [index, row] of rows.rows.entries()) {
      await client.query(`UPDATE ai_chunks SET metadata = metadata || $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify({ conflict_key: "synthetic_staging_date", fact_value: String(index) })]);
    }
    const result = await answerKnowledgeQuestion({ requestId: "11111111-1111-4111-8111-111111111111",
      text: "When is regular Semester 1 reading week in AY2026/27?" }, {
      retriever, maxContextChars: 16_000, provider: { generateAnswer: async () => { throw new Error("Conflicts must stop generation"); } },
    });
    assert.equal(result.groundedAnswer.status, "not_verified");
    assert.ok(result.groundedAnswer.warnings.includes("conflicting_sources"));
    assert.equal(result.groundedAnswer.citations.length, 2);
    await client.query("ROLLBACK");
    assert.equal(await snapshot(), before, "All synthetic changes must be rolled back");
    const report = { checkedAt: new Date().toISOString(), environment: "staging",
      method: "real PostgreSQL hybrid search; stored-vector fixture; synthetic conflict metadata; transaction rollback",
      checks: { baselineRetrieval: true, wrongYearExcluded: true, staleExcluded: true, conflictsStopGeneration: true, snapshotPreserved: true,
        allSourcesExpireSafely: true, futureVerificationExcluded: true }, monthlyExpiry,
      humanReview: "pending", releaseApproval: false };
    await writeFile(path.resolve(output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log("Staging SQL scenarios passed", report.checks);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}
void main().catch(error => {
  console.error("Staging SQL scenarios failed", { message: error instanceof Error ? error.message : "Unknown failure" });
  process.exitCode = 1;
});
