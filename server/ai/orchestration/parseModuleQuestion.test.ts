import assert from "node:assert/strict";
import test from "node:test";
import { parseModuleQuestionText } from "./parseModuleQuestion";

test("extracts a structured prerequisite question", () => {
  assert.deepEqual(
    parseModuleQuestionText("What are the prerequisites for CS2040S in AY2026/27?"),
    {
      academicYear: "2026/27",
      intent: "prerequisite",
      moduleCode: "CS2040S",
      semester: undefined,
      unsafeInput: undefined,
    },
  );
});

test("extracts timetable semester and safe typo candidates", () => {
  assert.deepEqual(
    parseModuleQuestionText("Show the timetable for CS204OS, semester 2, 2026-2027"),
    {
      academicYear: "2026/2027",
      intent: "timetable",
      moduleCode: "CS204OS",
      semester: 2,
      unsafeInput: undefined,
    },
  );
});

test("leaves missing context absent so orchestration can clarify", () => {
  assert.deepEqual(parseModuleQuestionText("Is this module offered this semester?"), {
    academicYear: undefined,
    intent: "offering",
    moduleCode: undefined,
    semester: undefined,
    unsafeInput: undefined,
  });
});

test("flags tool-injection text even when it contains a valid-looking code", () => {
  const question = parseModuleQuestionText("CS2030S'; DROP TABLE users; --");

  assert.equal(question.moduleCode, "CS2030S");
  assert.equal(question.unsafeInput, true);
});
