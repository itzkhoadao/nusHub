import { z } from "zod";
import {
  ModuleInputError,
  parseAcademicYear,
  parseModuleCode,
  type AcademicYear,
} from "../domain/moduleInput";
import type { NusModsClient } from "../retrieval/NusModsClient";
import type {
  NusModsModule,
  NusModsSourceMetadata,
} from "../retrieval/NusModsTypes";

export const GET_NUS_MODULE_TOOL_NAME = "get_nus_module";

export const getNusModuleInputSchema = z
  .object({
    academicYear: z.string().min(1).max(11),
    moduleCode: z.string().min(1).max(16),
  })
  .strict();

export type GetNusModuleInput = z.infer<typeof getNusModuleInputSchema>;

export type GetNusModuleResult =
  | {
      academicYear: AcademicYear;
      module: NusModsModule;
      moduleCode: string;
      source: NusModsSourceMetadata;
      status: "found";
    }
  | {
      academicYear: AcademicYear;
      moduleCode: string;
      suggestions: string[];
      status: "not_found";
    };

export class GetNusModuleTool {
  readonly description =
    "Read one public NUSMods module record for an explicit academic year.";
  readonly inputSchema = getNusModuleInputSchema;
  readonly name = GET_NUS_MODULE_TOOL_NAME;
  readonly readOnly = true;

  constructor(private readonly client: NusModsClient) {}

  async execute(input: GetNusModuleInput): Promise<GetNusModuleResult> {
    const validatedInput = this.inputSchema.parse(input);
    const academicYear = parseAcademicYear(validatedInput.academicYear);
    let moduleCode: string;
    try {
      moduleCode = parseModuleCode(validatedInput.moduleCode);
    } catch (error) {
      const candidate = validatedInput.moduleCode.trim().toUpperCase();
      if (!(error instanceof ModuleInputError) || !/^[A-Z0-9]{2,16}$/.test(candidate)) {
        throw error;
      }

      return {
        academicYear,
        moduleCode: candidate,
        status: "not_found",
        suggestions: await this.findSuggestions(
          academicYear.apiValue,
          candidate,
          false,
        ),
      };
    }
    const result = await this.client.getModule(academicYear.apiValue, moduleCode);

    if (result.status === "found") {
      return {
        academicYear,
        module: result.module,
        moduleCode,
        source: result.source,
        status: "found",
      };
    }

    return {
      academicYear,
      moduleCode,
      status: "not_found",
      suggestions: await this.findSuggestions(
        academicYear.apiValue,
        moduleCode,
        true,
      ),
    };
  }

  private async findSuggestions(
    academicYear: string,
    moduleCode: string,
    optional: boolean,
  ) {
    try {
      const list = await this.client.listModules(academicYear);
      return findClosestModuleCodes(
        moduleCode,
        list.modules.map((module) => module.moduleCode.toUpperCase()),
      );
    } catch (error) {
      // Suggestions are optional and must never turn a definitive not-found
      // result into a source error. For a malformed candidate, however, the
      // module list is the only evidence and its failure must be surfaced.
      if (!optional) throw error;
      return [];
    }
  }
}

export function findClosestModuleCodes(
  requestedCode: string,
  availableCodes: string[],
): string[] {
  return availableCodes
    .map((moduleCode) => ({
      distance: levenshteinDistance(requestedCode, moduleCode),
      moduleCode,
    }))
    .filter(({ distance }) => distance <= 2)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.moduleCode.localeCompare(right.moduleCode),
    )
    .slice(0, 3)
    .map(({ moduleCode }) => moduleCode);
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}
