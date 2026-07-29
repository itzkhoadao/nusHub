// This file reads evaluation data from files, parses it, validates with the Zod schemas 
// from contracts.ts, rejects malformed/duplicate entries, returns data in Map objects

import { readFile } from "node:fs/promises";
import {
  candidateResponseSchema,
  evaluationCaseSchema,
  type CandidateResponse,
  type EvaluationCase,
  type SourceRegistry,
} from "./contracts";

type LocatedCandidateResponse = {
  line: number; // where it appears in source file
  response: CandidateResponse; // validated candidate response
};

// parses a file written in JSONL
function parseJsonLines(text: string, filename: string) {
  return text
    .split(/\r?\n/) // divides the file into lines
    .map((line, index) => ({ line, lineNumber: index + 1 })) // attach line number
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, lineNumber }) => {
      try {
        return { lineNumber, value: JSON.parse(line) as unknown }; // parse each line
      } catch (error) {
        throw new Error(
          `${filename}:${lineNumber} is not valid JSON`,
          { cause: error },
        );
      }
    });
}

export async function loadEvaluationCases(filename: string) {
  const text = await readFile(filename, "utf8");
  const cases = parseJsonLines(text, filename).map(({ lineNumber, value }) => {
    const parsed = evaluationCaseSchema.safeParse(value); // validate each line as an evaluation case
    if (!parsed.success) {
      throw new Error(
        `${filename}:${lineNumber} is not a valid evaluation case: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  });

  // create lookup Map, for example:
  // Map {
  // "E001" => { ...evaluation case... },
  // "E002" => { ...evaluation case... },
  // }
  const casesById = new Map<string, EvaluationCase>();

  // add to lookup Map while detecting duplicate cases
  for (const evaluationCase of cases) {
    if (casesById.has(evaluationCase.id)) {
      throw new Error(`Duplicate evaluation case ${evaluationCase.id}`);
    }
    casesById.set(evaluationCase.id, evaluationCase);
  }

  return casesById;
}

// loads actual chatbot responses
export async function loadCandidateResponses(filename: string) {
  const text = await readFile(filename, "utf8");
  const responses = new Map<string, LocatedCandidateResponse>();

  for (const { lineNumber, value } of parseJsonLines(text, filename)) {
    const parsed = candidateResponseSchema.safeParse(value); // validate each line
    if (!parsed.success) {
      throw new Error(
        `${filename}:${lineNumber} is not a valid candidate response: ${parsed.error.message}`,
      );
    }
    if (responses.has(parsed.data.caseId)) { // avoid duplicates
      throw new Error(`Duplicate candidate response ${parsed.data.caseId}`);
    }
    responses.set(parsed.data.caseId, {
      line: lineNumber,
      response: parsed.data,
    }); // add to lookup Map
  }

  return responses;
}

// loads source registry from YAML file
// converts into sth like this:
// Map {
//   "nus_housing" => {
//     allowedDomains: [
//       "nus.edu.sg",
//       "uhms.nus.edu.sg"
//     ],
//     enabled: true
//   },
//   "moe_singapore" => {
//     allowedDomains: [
//       "moe.gov.sg"
//     ],
//     enabled: false
//   }
// }
export async function loadSourceRegistry(filename: string) {
  const text = await readFile(filename, "utf8");
  const registry: SourceRegistry = new Map();

  for (const block of text.split(/^ {2}- id: /m).slice(1)) {
    const [sourceId, ...bodyLines] = block.split(/\r?\n/);
    const body = bodyLines.join("\n");
    const enabled = body.match(/^\s+enabled: (true|false)$/m)?.[1] === "true";
    const domainList = body.match(
      /allowed_domains:\s*\[([\s\S]*?)\]/,
    )?.[1];
    const allowedDomains = domainList
      ? domainList
          .split(",")
          .map((domain) => domain.trim())
          .filter(Boolean)
      : [];

    registry.set(sourceId.trim(), { allowedDomains, enabled });
  }

  if (registry.size === 0) {
    throw new Error(`No sources found in ${filename}`);
  }

  return registry;
}
