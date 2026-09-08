import { z } from "zod";

const moduleCreditSchema = z.union([z.string().trim().min(1), z.number()]);

export type NusModsPrerequisiteTree =
  | string
  | { and: NusModsPrerequisiteTree[] }
  | { or: NusModsPrerequisiteTree[] };

const nusModsPrerequisiteTreeSchema: z.ZodType<NusModsPrerequisiteTree> = z.lazy(
  () =>
    z.union([
      z.string().min(1),
      z.object({ and: z.array(nusModsPrerequisiteTreeSchema).min(1) }).strict(),
      z.object({ or: z.array(nusModsPrerequisiteTreeSchema).min(1) }).strict(),
    ]),
);

export const nusModsLessonSchema = z
  .object({
    classNo: z.string(),
    day: z.string(),
    endTime: z.string(),
    lessonType: z.string(),
    size: z.number().optional(),
    startTime: z.string(),
    venue: z.string().optional(),
    weeks: z.array(z.number().int().positive()),
  })
  .passthrough();

export const nusModsSemesterSchema = z
  .object({
    examDate: z.string().optional(),
    examDuration: z.number().optional(),
    semester: z.number().int().min(1).max(4),
    timetable: z.array(nusModsLessonSchema).default([]),
  })
  .passthrough();

export const nusModsModuleSchema = z
  .object({
    acadYear: z.string().min(1),
    corequisite: z.string().trim().min(1).optional(),
    department: z.string().optional(),
    description: z.string().trim().min(1),
    faculty: z.string().optional(),
    moduleCode: z.string().min(1),
    moduleCredit: moduleCreditSchema,
    preclusion: z.string().trim().min(1).optional(),
    prerequisite: z.string().trim().min(1).optional(),
    prerequisiteRule: z.string().trim().min(1).optional(),
    prereqTree: nusModsPrerequisiteTreeSchema.optional(),
    semesterData: z.array(nusModsSemesterSchema).default([]),
    title: z.string().trim().min(1),
  })
  .passthrough();

export const nusModsModuleListSchema = z.array(
  z
    .object({
      moduleCode: z.string().min(1),
      semesters: z.array(z.number().int().min(1).max(4)),
      title: z.string().min(1),
    })
    .passthrough(),
);

export type NusModsModule = z.infer<typeof nusModsModuleSchema>;
export type NusModsLesson = z.infer<typeof nusModsLessonSchema>;
export type NusModsModuleListItem = z.infer<typeof nusModsModuleListSchema>[number];

export type NusModsSourceMetadata = {
  academicYear: string;
  contentHash: string;
  fetchedAt: string;
  moduleCode?: string;
  sourceId: "nusmods_api";
  stale: boolean;
  url: string;
};

export type NusModsModuleResult =
  | {
      module: NusModsModule;
      source: NusModsSourceMetadata;
      status: "found";
    }
  | {
      status: "not_found";
    };
