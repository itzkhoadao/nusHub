import type { GroundedAnswer } from "../domain/types";
import {
  ModuleInputError,
  moduleQuestionIntentSchema,
  parseAcademicYear,
  parseModuleCode,
  parseSemester,
  type ModuleQuestionIntent,
} from "../domain/moduleInput";
import { NusModsError } from "../retrieval/NusModsError";
import type {
  NusModsLesson,
  NusModsModule,
  NusModsPrerequisiteTree,
  NusModsSourceMetadata,
} from "../retrieval/NusModsTypes";
import type { GetNusModuleTool } from "../tools/getNusModule";

export type ModuleQuestion = {
  academicYear?: string;
  intent: ModuleQuestionIntent;
  moduleCode?: string;
  originalText?: string;
  requestId?: string;
  semester?: number;
  signal?: AbortSignal;
  unsafeInput?: boolean;
};

export type ModuleQuestionAnswer = {
  academicYear: string | null;
  groundedAnswer: GroundedAnswer;
  modelId?: string | null;
  moduleCode: string | null;
  promptVersion?: string;
};

const unsafeModuleCodeCharacters = /[^A-Za-z0-9\s-]/;

export async function answerModuleQuestion(
  question: ModuleQuestion,
  tool: GetNusModuleTool,
): Promise<ModuleQuestionAnswer> {
  throwIfCancelled(question.signal);
  if (question.unsafeInput) {
    return wrap(
      null,
      null,
      refused("The request contains unsafe tool input and was rejected before any source lookup."),
    );
  }
  const intentResult = moduleQuestionIntentSchema.safeParse(question.intent);
  if (!intentResult.success) {
    return wrap(null, null, refused("That module question type is not supported."));
  }

  if (!question.academicYear?.trim()) {
    return wrap(
      null,
      null,
      clarification(
        "I need the academic year before checking NUSMods.",
        "Which academic year should I use (for example, AY2026/27)?",
      ),
    );
  }

  let academicYear;
  try {
    academicYear = parseAcademicYear(question.academicYear);
  } catch (error) {
    return wrap(
      null,
      null,
      inputErrorAnswer(error, question.academicYear),
    );
  }

  if (!question.moduleCode?.trim()) {
    return wrap(
      academicYear.label,
      null,
      clarification(
        `I need a module code to check NUSMods for ${academicYear.label}.`,
        "Which module code should I look up?",
      ),
    );
  }

  let moduleCode;
  try {
    moduleCode = parseModuleCode(question.moduleCode);
  } catch (error) {
    const candidate = question.moduleCode.trim().toUpperCase();
    if (
      error instanceof ModuleInputError &&
      error.field === "moduleCode" &&
      /^[A-Z0-9]{2,16}$/.test(candidate)
    ) {
      // A safe but malformed candidate (for example CS204OS) may be compared
      // against the module list. It is never sent to the per-module endpoint.
      moduleCode = candidate;
    } else {
    return wrap(
      academicYear.label,
      null,
      inputErrorAnswer(error, question.moduleCode),
    );
    }
  }

  if (question.intent === "timetable" && question.semester === undefined) {
    return wrap(
      academicYear.label,
      moduleCode,
      clarification(
        `The timetable depends on the semester in ${academicYear.label}.`,
        "Which semester should I check (1, 2, 3, or 4)?",
      ),
    );
  }

  let semester: number | undefined;
  if (question.semester !== undefined) {
    try {
      semester = parseSemester(question.semester);
    } catch (error) {
      return wrap(
        academicYear.label,
        moduleCode,
        inputErrorAnswer(error, String(question.semester)),
      );
    }
  }

  try {
    const result = await tool.execute(
      {
        academicYear: academicYear.apiValue,
        moduleCode,
      },
      { signal: question.signal },
    );
    throwIfCancelled(question.signal);

    if (result.status === "not_found") {
      if (result.suggestions.length > 0) {
        const suggestion = result.suggestions[0];
        return wrap(
          academicYear.label,
          moduleCode,
          clarification(
            `${moduleCode} was not found in NUSMods for ${academicYear.label}.`,
            `Did you mean ${suggestion}?`,
          ),
        );
      }

      return wrap(academicYear.label, moduleCode, {
        answer: `${moduleCode} was not found in NUSMods for ${academicYear.label}. I cannot verify details for this module.`,
        citations: [],
        status: "not_verified",
        warnings: ["module_not_found"],
      });
    }

    const answer = formatAnswer(
      question.intent,
      result.module,
      academicYear.label,
      result.source,
      semester,
    );
    return wrap(academicYear.label, moduleCode, answer);
  } catch (error) {
    if (error instanceof NusModsError) {
      if (error.code === "REQUEST_CANCELLED") throw error;
      return wrap(academicYear.label, moduleCode, {
        answer: `I could not verify ${moduleCode} for ${academicYear.label} because NUSMods is currently unavailable.`,
        citations: [],
        status: "not_verified",
        warnings: ["source_unavailable", error.code.toLowerCase()],
      });
    }

    throw error;
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new NusModsError("REQUEST_CANCELLED", "The module lookup was cancelled.");
  }
}

function formatAnswer(
  intent: ModuleQuestionIntent,
  module: NusModsModule,
  academicYearLabel: string,
  source: NusModsSourceMetadata,
  semester?: number,
): GroundedAnswer {
  const offeredSemesters = module.semesterData
    .map((entry) => entry.semester)
    .sort((left, right) => left - right);
  const identity = `${module.moduleCode} — ${module.title}`;
  let answer: string;
  const warnings: string[] = [];

  switch (intent) {
    case "summary":
      answer = `${identity} (${String(module.moduleCredit)} units), ${academicYearLabel}. ${module.description} Offered in ${formatSemesterList(offeredSemesters)}.`;
      break;
    case "prerequisite":
      answer = module.prerequisite
        ? `${identity}, ${academicYearLabel}. Prerequisite: ${formatPrerequisite(module)}`
        : `${identity}, ${academicYearLabel}. NUSMods does not list a prerequisite for this academic year.`;
      if (!module.prerequisite && module.preclusion) {
        warnings.push("A preclusion is listed separately; no prerequisite does not mean every student may take the module.");
      }
      break;
    case "preclusion":
      answer = module.preclusion
        ? `${identity}, ${academicYearLabel}. Preclusion: ${cleanRuleText(module.preclusion)}`
        : `${identity}, ${academicYearLabel}. NUSMods does not list a preclusion for this academic year.`;
      break;
    case "corequisite":
      answer = module.corequisite
        ? `${identity}, ${academicYearLabel}. Corequisite: ${cleanRuleText(module.corequisite)}`
        : `${identity}, ${academicYearLabel}. NUSMods does not list a corequisite for this academic year.`;
      break;
    case "offering":
      answer = `${identity} is listed in ${formatSemesterList(offeredSemesters)} for ${academicYearLabel}.`;
      break;
    case "timetable":
      answer = formatTimetable(module, academicYearLabel, semester as number);
      break;
  }

  if (source.stale) {
    warnings.push(
      "NUSMods could not be refreshed, so this answer uses cached data that is less than 48 hours old.",
    );
  }

  return {
    answer,
    citations: [
      {
        claimIds: ["nusmods_module_record"],
        documentVersionId: `nusmods_api:${source.academicYear}:${module.moduleCode}:${source.contentHash.slice(0, 16)}`,
        effectiveAt: null,
        retrievedAt: source.fetchedAt,
        sourceId: source.sourceId,
        title: `${module.moduleCode} in ${academicYearLabel} — NUSMods API`,
        url: source.url,
      },
    ],
    status: "answered",
    warnings,
  };
}

function formatPrerequisite(module: NusModsModule): string {
  if (!module.prereqTree) return cleanRuleText(module.prerequisite as string);
  return formatPrerequisiteTree(module.prereqTree);
}

function formatPrerequisiteTree(tree: NusModsPrerequisiteTree): string {
  if (typeof tree === "string") return formatCourseRequirement(tree);

  if ("or" in tree) {
    return `at least one of ${tree.or.map(formatPrerequisiteTree).join(", ")}`;
  }

  return tree.and
    .map((group, index) => `group ${index + 1}: ${formatPrerequisiteTree(group)}`)
    .join("; and ");
}

function formatCourseRequirement(requirement: string): string {
  const [course, grade] = requirement.split(":", 2);
  return grade ? `${course} (grade ${grade} or better)` : course;
}

function cleanRuleText(value: string): string {
  return value
    .replace(/DegreeTHEN\(/g, "Degree, then (")
    .replace(/AND(?=must)/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTimetable(
  module: NusModsModule,
  academicYearLabel: string,
  semester: number,
): string {
  const semesterRecord = module.semesterData.find(
    (entry) => entry.semester === semester,
  );

  if (!semesterRecord) {
    return `${module.moduleCode} — ${module.title} is not listed in Semester ${semester} for ${academicYearLabel}.`;
  }

  const lectures = semesterRecord.timetable.filter((lesson) =>
    lesson.lessonType.toLowerCase().includes("lecture"),
  );

  if (lectures.length === 0) {
    return `${module.moduleCode} — ${module.title} has no lecture timetable entries listed for Semester ${semester}, ${academicYearLabel}.`;
  }

  const entries = lectures.map(formatLesson).join("; ");
  return `${module.moduleCode} — ${module.title}, Semester ${semester}, ${academicYearLabel}. Lecture classes: ${entries}.`;
}

function formatLesson(lesson: NusModsLesson): string {
  const venue = lesson.venue?.trim() || "venue not listed";
  return `${lesson.classNo}: ${lesson.day} ${lesson.startTime}-${lesson.endTime}, ${venue}, weeks ${formatWeeks(lesson.weeks)}`;
}

function formatWeeks(weeks: number[]): string {
  if (weeks.length === 0) return "not listed";
  const sorted = [...new Set(weeks)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (const week of sorted.slice(1)) {
    if (week === end + 1) {
      end = week;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = week;
    end = week;
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(", ");
}

function formatSemesterList(semesters: number[]): string {
  if (semesters.length === 0) return "no semesters listed";
  if (semesters.length === 1) return `Semester ${semesters[0]}`;
  const finalSemester = semesters[semesters.length - 1];
  return `Semesters ${semesters.slice(0, -1).join(", ")} and ${finalSemester}`;
}

function inputErrorAnswer(error: unknown, originalValue: string): GroundedAnswer {
  if (!(error instanceof ModuleInputError)) throw error;

  if (
    error.field === "moduleCode" &&
    unsafeModuleCodeCharacters.test(originalValue)
  ) {
    return refused("The module code contains unsafe characters and was rejected before any source lookup.");
  }

  return clarification(error.message, `Please provide a valid ${error.field}.`);
}

function clarification(answer: string, followUpQuestion: string): GroundedAnswer {
  return {
    answer,
    citations: [],
    followUpQuestion,
    status: "needs_clarification",
    warnings: [],
  };
}

function refused(answer: string): GroundedAnswer {
  return {
    answer,
    citations: [],
    status: "refused",
    warnings: ["invalid_or_unsupported_input"],
  };
}

function wrap(
  academicYear: string | null,
  moduleCode: string | null,
  groundedAnswer: GroundedAnswer,
): ModuleQuestionAnswer {
  return {
    academicYear,
    groundedAnswer,
    modelId: null,
    moduleCode,
    promptVersion: "nusmods-structured.v1",
  };
}
