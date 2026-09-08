import assert from "node:assert/strict";
import test from "node:test";
import { NusModsClient } from "../retrieval/NusModsClient";
import { GetNusModuleTool, findClosestModuleCodes } from "./getNusModule";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("suggests close module codes deterministically", () => {
  assert.deepEqual(
    findClosestModuleCodes("CS204OS", ["CS2040S", "CS2040", "CS2030S", "MA2001"]),
    ["CS2040S", "CS2030S", "CS2040"],
  );
});

test("returns a typo suggestion after a definitive module 404", async () => {
  const client = new NusModsClient({
    fetch: async (url) =>
      String(url).endsWith("moduleList.json")
        ? jsonResponse([
            { moduleCode: "CS2040S", semesters: [1, 2], title: "Data Structures" },
            { moduleCode: "MA2001", semesters: [1], title: "Linear Algebra" },
          ])
        : jsonResponse({}, 404),
  });
  const tool = new GetNusModuleTool(client);

  const result = await tool.execute({
    academicYear: "AY2026/27",
    moduleCode: "CS204OS",
  });

  assert.equal(result.status, "not_found");
  if (result.status === "not_found") {
    assert.deepEqual(result.suggestions, ["CS2040S"]);
  }
});

test("rejects malicious module input before making a network request", async () => {
  let fetchCalled = false;
  const client = new NusModsClient({
    fetch: async () => {
      fetchCalled = true;
      return jsonResponse({});
    },
  });
  const tool = new GetNusModuleTool(client);

  await assert.rejects(() =>
    tool.execute({
      academicYear: "AY2026/27",
      moduleCode: "CS2030S'; DROP TABLE users; --",
    }),
  );
  assert.equal(fetchCalled, false);
});

test("does not claim a safe typo is unknown when the module list is unavailable", async () => {
  const client = new NusModsClient({
    fetch: async () => jsonResponse({}, 503),
  });
  const tool = new GetNusModuleTool(client);

  await assert.rejects(
    () =>
      tool.execute({
        academicYear: "AY2026/27",
        moduleCode: "CS204OS",
      }),
    /module list/,
  );
});
