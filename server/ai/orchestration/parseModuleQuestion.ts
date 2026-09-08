import type { ModuleQuestion } from "./answerModuleQuestion";

const academicYearPattern = /\b(?:AY\s*)?(\d{4})\s*[/-]\s*(\d{2}|\d{4})\b/i;
const moduleCandidatePattern = /\b[A-Za-z]{1,4}[A-Za-z0-9]{4,6}\b/g;
const semesterPattern = /\b(?:semester|sem)\s*([1-4])\b/i;

export function parseModuleQuestionText(input: string): ModuleQuestion {
  const academicYearMatch = academicYearPattern.exec(input);
  const moduleCode = findModuleCandidate(input);
  const semesterMatch = semesterPattern.exec(input);
  const normalized = input.toLowerCase();

  return {
    academicYear: academicYearMatch
      ? `${academicYearMatch[1]}/${academicYearMatch[2]}`
      : undefined,
    intent: inferIntent(normalized),
    moduleCode,
    semester: semesterMatch ? Number(semesterMatch[1]) : undefined,
    unsafeInput: looksLikeInjection(input) || undefined,
  };
}

function looksLikeInjection(input: string) {
  return /(?:;\s*(?:drop|delete|insert|update|alter|create|select)\b|--|\/\*)/i.test(
    input,
  );
}

function findModuleCandidate(input: string) {
  const candidates = Array.from(
    input.matchAll(moduleCandidatePattern),
    (match) => match[0],
  );
  return candidates.find((candidate) => {
    const upper = candidate.toUpperCase();
    const digitCount = [...upper].filter((character) => /\d/.test(character)).length;
    return digitCount >= 3 && !/^AY\d{4}/.test(upper);
  });
}

function inferIntent(input: string): ModuleQuestion["intent"] {
  if (/\b(preclusion|preclude|cannot take|can't take|conflict)\b/.test(input)) {
    return "preclusion";
  }
  if (/\b(corequisite|coreq|co-requisite)\b/.test(input)) {
    return "corequisite";
  }
  if (/\b(prerequisites?|prereqs?|requirements?|required before)\b/.test(input)) {
    return "prerequisite";
  }
  if (/\b(timetable|lecture|class time|schedule)\b/.test(input)) {
    return "timetable";
  }
  if (/\b(offered|available|which sem|which semester)\b/.test(input)) {
    return "offering";
  }
  return "summary";
}
