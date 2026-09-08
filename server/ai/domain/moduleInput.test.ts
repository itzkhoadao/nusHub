import assert from "node:assert/strict";
import test from "node:test";
import {
  ModuleInputError,
  parseAcademicYear,
  parseModuleCode,
  parseSemester,
} from "./moduleInput";

test("normalizes supported academic-year forms", () => {
  assert.deepEqual(parseAcademicYear("AY2026/27"), {
    apiValue: "2026-2027",
    label: "AY2026/27",
  });
  assert.deepEqual(parseAcademicYear("2026-2027"), {
    apiValue: "2026-2027",
    label: "AY2026/27",
  });
  assert.deepEqual(parseAcademicYear("2026/27"), {
    apiValue: "2026-2027",
    label: "AY2026/27",
  });
});

test("rejects malformed and non-consecutive academic years", () => {
  assert.throws(() => parseAcademicYear("current"), ModuleInputError);
  assert.throws(() => parseAcademicYear("2026-2028"), /consecutive/);
});

test("normalizes valid module codes and rejects injection text", () => {
  assert.equal(parseModuleCode(" cs2030s "), "CS2030S");
  assert.throws(
    () => parseModuleCode("CS2030S'; DROP TABLE users; --"),
    ModuleInputError,
  );
});

test("accepts only NUS semester numbers", () => {
  assert.equal(parseSemester(4), 4);
  assert.throws(() => parseSemester(0), ModuleInputError);
  assert.throws(() => parseSemester(1.5), ModuleInputError);
});
