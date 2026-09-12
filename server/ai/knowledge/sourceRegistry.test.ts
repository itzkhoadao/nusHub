import assert from "node:assert/strict";
import test from "node:test";
import {
  getKnowledgeSource,
  listKnowledgeSources,
} from "./sourceRegistry";

test("enables only the reviewed Phase 5 official source set", () => {
  const sources = listKnowledgeSources();
  assert.deepEqual(
    sources.map((source) => source.id).sort(),
    [
      "nus_it",
      "nus_libraries",
      "nus_osa",
      "nus_registrar_calendar",
      "nus_transport",
      "nus_uhc",
    ],
  );
  assert.ok(sources.every((source) => source.enabled && source.trustTier === "T1"));
  assert.throws(() => getKnowledgeSource("nus_finance"), /not enabled/);
});
