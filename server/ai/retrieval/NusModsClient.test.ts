import assert from "node:assert/strict";
import test from "node:test";
import { NusModsClient, type NusModsTelemetryEvent } from "./NusModsClient";

const moduleRecord = {
  acadYear: "2026/2027",
  description: "A programming methodology module.",
  moduleCode: "CS2030S",
  moduleCredit: "4",
  preclusion: "CS2030",
  prerequisite: "CS1010S or its equivalent",
  semesterData: [{ semester: 1, timetable: [] }],
  title: "Programming Methodology II",
};

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

test("fetches the fixed module endpoint and caches the validated record", async () => {
  let calls = 0;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const telemetry: NusModsTelemetryEvent[] = [];
  const client = new NusModsClient({
    fetch: async (url, init) => {
      calls += 1;
      requestedUrl = String(url);
      requestedInit = init;
      return jsonResponse(moduleRecord);
    },
    recordTelemetry: (event) => telemetry.push(event),
  });

  const first = await client.getModule("2026-2027", "CS2030S");
  const second = await client.getModule("2026-2027", "CS2030S");

  assert.equal(calls, 1);
  assert.equal(
    requestedUrl,
    "https://api.nusmods.com/v2/2026-2027/modules/CS2030S.json",
  );
  assert.deepEqual(requestedInit?.headers, { Accept: "application/json" });
  assert.equal(requestedInit?.redirect, "error");
  assert.equal(first.status, "found");
  assert.deepEqual(second, first);
  if (first.status === "found") {
    assert.match(first.source.contentHash, /^[a-f0-9]{64}$/);
    assert.equal(first.source.stale, false);
  }
  assert.deepEqual(
    telemetry.map((event) => event.cache),
    ["miss", "fresh"],
  );
});

test("deduplicates concurrent requests for the same module", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new NusModsClient({
    fetch: async () => {
      calls += 1;
      await blocked;
      return jsonResponse(moduleRecord);
    },
  });

  const first = client.getModule("2026-2027", "CS2030S");
  const second = client.getModule("2026-2027", "CS2030S");
  release?.();
  await Promise.all([first, second]);

  assert.equal(calls, 1);
});

test("uses stale data only inside the 48-hour-equivalent fallback window", async () => {
  let now = 0;
  let available = true;
  const client = new NusModsClient({
    cacheTtlMs: 100,
    fetch: async () => {
      if (!available) throw new Error("offline");
      return jsonResponse(moduleRecord);
    },
    maxStalenessMs: 300,
    now: () => now,
  });

  await client.getModule("2026-2027", "CS2030S");
  available = false;
  now = 150;
  const stale = await client.getModule("2026-2027", "CS2030S");
  assert.equal(stale.status, "found");
  if (stale.status === "found") assert.equal(stale.source.stale, true);

  now = 301;
  await assert.rejects(
    () => client.getModule("2026-2027", "CS2030S"),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "SOURCE_UNAVAILABLE",
  );
});

test("distinguishes not-found records from source failures", async () => {
  const notFoundClient = new NusModsClient({
    fetch: async () => jsonResponse({}, { status: 404 }),
  });
  assert.deepEqual(
    await notFoundClient.getModule("2026-2027", "CS9999Z"),
    { status: "not_found" },
  );

  const failingClient = new NusModsClient({
    fetch: async () => jsonResponse({}, { status: 503 }),
  });
  await assert.rejects(
    () => failingClient.getModule("2026-2027", "CS2030S"),
    /successful response/,
  );
});

test("rejects source identity mismatches, non-JSON, and oversized bodies", async () => {
  const mismatchClient = new NusModsClient({
    fetch: async () =>
      jsonResponse({ ...moduleRecord, moduleCode: "CS2040S" }),
  });
  await assert.rejects(
    () => mismatchClient.getModule("2026-2027", "CS2030S"),
    /failed validation/,
  );

  const htmlClient = new NusModsClient({
    fetch: async () =>
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
  });
  await assert.rejects(
    () => htmlClient.getModule("2026-2027", "CS2030S"),
    /non-JSON/,
  );

  const oversizedClient = new NusModsClient({
    fetch: async () => jsonResponse(moduleRecord),
    maxDocumentBytes: 10,
  });
  await assert.rejects(
    () => oversizedClient.getModule("2026-2027", "CS2030S"),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "SOURCE_RESPONSE_TOO_LARGE",
  );
});

test("rejects non-canonical path inputs before making a source request", async () => {
  let called = false;
  const client = new NusModsClient({
    fetch: async () => {
      called = true;
      return jsonResponse(moduleRecord);
    },
  });

  await assert.rejects(
    () => client.getModule("../2026-2027", "CS2030S"),
    /academic year/i,
  );
  await assert.rejects(
    () => client.getModule("2026-2027", "CS2030S/../../moduleList"),
    /module code/i,
  );
  assert.equal(called, false);
});

test("cancelling one caller does not cancel a shared source request", async () => {
  let releaseFetch: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  let calls = 0;
  const client = new NusModsClient({
    fetch: async () => {
      calls += 1;
      await blocked;
      return jsonResponse(moduleRecord);
    },
  });
  const controller = new AbortController();
  const cancelled = client.getModule("2026-2027", "CS2030S", controller.signal);
  const surviving = client.getModule("2026-2027", "CS2030S");

  controller.abort();
  await assert.rejects(
    cancelled,
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "REQUEST_CANCELLED",
  );
  releaseFetch?.();
  assert.equal((await surviving).status, "found");
  assert.equal(calls, 1);
});
