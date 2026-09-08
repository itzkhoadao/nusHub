import assert from "node:assert/strict";
import test from "node:test";
import { groundedAnswerSchema } from "../domain/types";
import { answerModuleQuestion } from "./answerModuleQuestion";
import { NusModsError } from "../retrieval/NusModsError";
import type { GetNusModuleResult, GetNusModuleTool } from "../tools/getNusModule";

const foundResult: GetNusModuleResult = {
  academicYear: { apiValue: "2026-2027", label: "AY2026/27" },
  module: {
    acadYear: "2026-2027",
    description: "A rigorous methodology module.",
    moduleCode: "CS2030S",
    moduleCredit: "4",
    preclusion: "CS2030",
    prerequisite: "CS1010S or its equivalent",
    prereqTree: { or: ["CS1010S:D", "CS1101S:D"] },
    semesterData: [
      {
        semester: 1,
        timetable: [
          {
            classNo: "1",
            day: "Monday",
            endTime: "1200",
            lessonType: "Lecture",
            startTime: "1000",
            venue: "COM1-B103",
            weeks: [1, 2, 3, 5],
          },
          {
            classNo: "01",
            day: "Tuesday",
            endTime: "1300",
            lessonType: "Tutorial",
            startTime: "1200",
            venue: "COM1-0201",
            weeks: [2, 3],
          },
        ],
      },
      { semester: 2, timetable: [] },
    ],
    title: "Programming Methodology II",
  },
  moduleCode: "CS2030S",
  source: {
    academicYear: "2026-2027",
    contentHash: "a".repeat(64),
    fetchedAt: "2026-09-08T01:00:00.000Z",
    moduleCode: "CS2030S",
    sourceId: "nusmods_api",
    stale: false,
    url: "https://api.nusmods.com/v2/2026-2027/modules/CS2030S.json",
  },
  status: "found",
};

function toolReturning(result: GetNusModuleResult): GetNusModuleTool {
  return { execute: async () => result } as unknown as GetNusModuleTool;
}

test("asks for the academic year before source retrieval", async () => {
  let called = false;
  const tool = {
    execute: async () => {
      called = true;
      return foundResult;
    },
  } as unknown as GetNusModuleTool;

  const result = await answerModuleQuestion(
    { intent: "summary", moduleCode: "CS2030S" },
    tool,
  );

  assert.equal(result.groundedAnswer.status, "needs_clarification");
  assert.match(result.groundedAnswer.followUpQuestion ?? "", /academic year/i);
  assert.equal(called, false);
});

test("rejects injection-like module text before source retrieval", async () => {
  let called = false;
  const tool = {
    execute: async () => {
      called = true;
      return foundResult;
    },
  } as unknown as GetNusModuleTool;

  const result = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "summary",
      moduleCode: "CS2030S'; DROP TABLE users; --",
    },
    tool,
  );

  assert.equal(result.groundedAnswer.status, "refused");
  assert.equal(called, false);
});

test("answers summaries and prerequisite questions from one cited record", async () => {
  const tool = toolReturning(foundResult);
  const summary = await answerModuleQuestion(
    {
      academicYear: "2026-2027",
      intent: "summary",
      moduleCode: "cs2030s",
    },
    tool,
  );
  const prerequisite = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "prerequisite",
      moduleCode: "CS2030S",
    },
    tool,
  );

  assert.equal(summary.groundedAnswer.status, "answered");
  assert.match(summary.groundedAnswer.answer, /Programming Methodology II/);
  assert.match(summary.groundedAnswer.answer, /AY2026\/27/);
  assert.match(summary.groundedAnswer.answer, /Semesters 1 and 2/);
  assert.equal(summary.groundedAnswer.citations[0].sourceId, "nusmods_api");
  assert.match(prerequisite.groundedAnswer.answer, /at least one of CS1010S/);
  assert.match(prerequisite.groundedAnswer.answer, /grade D or better/);
  groundedAnswerSchema.parse(summary.groundedAnswer);
  groundedAnswerSchema.parse(prerequisite.groundedAnswer);
});

test("preserves multiple prerequisite groups from the structured rule tree", async () => {
  const result = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "prerequisite",
      moduleCode: "CS2040S",
    },
    toolReturning({
      ...foundResult,
      moduleCode: "CS2040S",
      module: {
        ...foundResult.module,
        moduleCode: "CS2040S",
        prereqTree: {
          and: [
            { or: ["CS1010S:D", "CS1101S:D"] },
            { or: ["CS1231S:D", "MA1100:D"] },
          ],
        },
      },
    }),
  );

  assert.match(result.groundedAnswer.answer, /group 1: at least one of CS1010S/);
  assert.match(result.groundedAnswer.answer, /group 2: at least one of CS1231S/);
});

test("keeps prerequisite absence separate from a listed preclusion", async () => {
  const result = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "prerequisite",
      moduleCode: "CS1010S",
    },
    toolReturning({
      ...foundResult,
      moduleCode: "CS1010S",
      module: {
        ...foundResult.module,
        moduleCode: "CS1010S",
        prerequisite: undefined,
        preclusion: "CS1010 and its variants",
      },
    }),
  );

  assert.match(result.groundedAnswer.answer, /does not list a prerequisite/);
  assert.match(result.groundedAnswer.warnings.join(" "), /preclusion/i);
});

test("requires a semester for timetable questions and formats lecture entries", async () => {
  const tool = toolReturning(foundResult);
  const clarification = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "timetable",
      moduleCode: "CS2030S",
    },
    tool,
  );
  assert.equal(clarification.groundedAnswer.status, "needs_clarification");
  assert.match(clarification.groundedAnswer.followUpQuestion ?? "", /semester/i);

  const answer = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "timetable",
      moduleCode: "CS2030S",
      semester: 1,
    },
    tool,
  );
  assert.match(answer.groundedAnswer.answer, /1: Monday 1000-1200/);
  assert.match(answer.groundedAnswer.answer, /weeks 1-3, 5/);
  assert.doesNotMatch(answer.groundedAnswer.answer, /Tutorial/);
});

test("distinguishes typo clarification, unknown modules, and unavailable sources", async () => {
  const typo = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "summary",
      moduleCode: "CS204OS",
    },
    toolReturning({
      academicYear: foundResult.academicYear,
      moduleCode: "CS204OS",
      status: "not_found",
      suggestions: ["CS2040S"],
    }),
  );
  assert.equal(typo.groundedAnswer.status, "needs_clarification");
  assert.equal(typo.groundedAnswer.followUpQuestion, "Did you mean CS2040S?");

  const unknown = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "summary",
      moduleCode: "CS9999Z",
    },
    toolReturning({
      academicYear: foundResult.academicYear,
      moduleCode: "CS9999Z",
      status: "not_found",
      suggestions: [],
    }),
  );
  assert.equal(unknown.groundedAnswer.status, "not_verified");
  assert.deepEqual(unknown.groundedAnswer.citations, []);

  const unavailableTool = {
    execute: async () => {
      throw new NusModsError("SOURCE_UNAVAILABLE", "offline");
    },
  } as unknown as GetNusModuleTool;
  const unavailable = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "summary",
      moduleCode: "CS2030S",
    },
    unavailableTool,
  );
  assert.equal(unavailable.groundedAnswer.status, "not_verified");
  assert.match(unavailable.groundedAnswer.warnings.join(" "), /source_unavailable/);
});

test("labels stale-but-allowed cached answers", async () => {
  const stale = await answerModuleQuestion(
    {
      academicYear: "AY2026/27",
      intent: "preclusion",
      moduleCode: "CS2030S",
    },
    toolReturning({
      ...foundResult,
      source: { ...foundResult.source, stale: true },
    }),
  );

  assert.equal(stale.groundedAnswer.status, "answered");
  assert.match(stale.groundedAnswer.warnings.join(" "), /less than 48 hours/i);
});
