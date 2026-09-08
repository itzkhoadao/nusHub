import { createModuleQuestionService } from "./createModuleQuestionService";
import { moduleQuestionIntentSchema } from "./domain/moduleInput";

type CliArguments = {
  academicYear?: string;
  intent?: string;
  moduleCode?: string;
  semester?: number;
};

function parseArguments(argumentsList: string[]): CliArguments {
  const result: CliArguments = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!value || !flag.startsWith("--")) continue;

    if (flag === "--academic-year") result.academicYear = value;
    if (flag === "--module") result.moduleCode = value;
    if (flag === "--intent") result.intent = value;
    if (flag === "--semester") result.semester = Number(value);
    index += 1;
  }
  return result;
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const intent = moduleQuestionIntentSchema.safeParse(arguments_.intent);

  if (!intent.success) {
    throw new Error(
      "Use --intent summary|prerequisite|preclusion|corequisite|offering|timetable",
    );
  }

  const answer = await createModuleQuestionService()({
    academicYear: arguments_.academicYear,
    intent: intent.data,
    moduleCode: arguments_.moduleCode,
    semester: arguments_.semester,
  });
  console.log(JSON.stringify(answer, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Module lookup failed");
  process.exitCode = 1;
});
