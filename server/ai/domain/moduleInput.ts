import { z } from "zod";

export const moduleQuestionIntentSchema = z.enum([
  "summary",
  "prerequisite",
  "preclusion",
  "corequisite",
  "offering",
  "timetable",
]);

export type ModuleQuestionIntent = z.infer<typeof moduleQuestionIntentSchema>;

export type AcademicYear = {
  apiValue: string;
  label: string;
};

export class ModuleInputError extends Error {
  readonly field: "academicYear" | "moduleCode" | "semester";

  constructor(
    field: ModuleInputError["field"],
    message: string,
  ) {
    super(message);
    this.name = "ModuleInputError";
    this.field = field;
  }
}

export function parseAcademicYear(value: string): AcademicYear {
  const normalized = value.trim().toUpperCase();
  const match = /^(?:AY)?(\d{4})[/-](\d{2}|\d{4})$/.exec(normalized);

  if (!match) {
    throw new ModuleInputError(
      "academicYear",
      "Use an academic year such as AY2026/27.",
    );
  }

  const startYear = Number(match[1]);
  const endYear = match[2].length === 2
    ? Math.floor(startYear / 100) * 100 + Number(match[2])
    : Number(match[2]);

  if (endYear !== startYear + 1) {
    throw new ModuleInputError(
      "academicYear",
      "The academic year must contain two consecutive years.",
    );
  }

  return {
    apiValue: `${startYear}-${endYear}`,
    label: `AY${startYear}/${String(endYear).slice(-2)}`,
  };
}

export function parseModuleCode(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{1,4}\d{4}[A-Z]{0,2}$/.test(normalized)) {
    throw new ModuleInputError(
      "moduleCode",
      "The module code is invalid. Use a code such as CS2030S.",
    );
  }

  return normalized;
}

export function parseSemester(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new ModuleInputError(
      "semester",
      "Semester must be 1, 2, 3, or 4.",
    );
  }

  return value;
}
