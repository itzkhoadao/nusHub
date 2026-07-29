// This file defines the shapes of: Evaluation cases, Recorded chatbot responses, Citations, 
// Source-registry entries, Grading checks, Final evaluation results
// uses Zod to perform runtime validation

import { z } from "zod";

export const evaluationStatusSchema = z.enum([
  "answered",
  "clarification",
  "not_verified",
  "refused",
]); // enum: the value must be exactly one of these strings

export const evaluationCaseSchema = z
  .object({
    id: z.string().regex(/^E\d{3}$/),
    title: z.string().min(1),
    category: z.string().min(1),
    input: z.string().min(1),
    risk: z.object({
      level: z.enum(["low", "medium", "high", "critical"]),
      reasonCode: z.string().min(1),
    }),
    freshness: z.object({
      class: z.enum(["stable", "versioned", "time_sensitive", "live"]),
      retrievalRequired: z.boolean(),
      maxSourceAgeHours: z.number().int().nonnegative().nullable(),
      requiresAsOf: z.boolean(),
    }),
    sources: z.object({
      mode: z.enum([
        "authoritative",
        "conditional",
        "internal_policy",
        "mixed",
      ]),
      authoritativeSourceIds: z.array(z.string().min(1)),
      policyIds: z.array(z.string().min(1)),
      requiredUrls: z.array(z.string().startsWith("https://")),
    }),
    expectedBehavior: z.object({
      status: evaluationStatusSchema, // reusing another schema
      assertions: z.object({
        expectedStatus: evaluationStatusSchema,
        forbiddenDataClasses: z.array(z.string().min(1)),
        minimumCitations: z.number().int().nonnegative(),
        mustInclude: z.array(z.string().min(1)),
        requiredSourceIds: z.array(z.string().min(1)),
        requiresAcademicYear: z.boolean(),
      }),
      humanRubric: z.array(z.string().min(1)).min(2),
    }),
  })
  .passthrough(); // passthrough() allows properties that were not defined in the schema

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

// defines a citation attached to a chatbot response
export const candidateCitationSchema = z
  .object({
    sourceId: z.string().regex(/^[a-z0-9_]+$/),
    url: z.string().url(),
  })
  .strict(); // strict() does not allow properties that were not defined in the schema

// describes an actual chatbot response recorded during evaluation
export const candidateResponseSchema = z
  .object({
    caseId: z.string().regex(/^E\d{3}$/),
    status: z.enum([
      "answered",
      "clarification",
      "not_verified",
      "refused",
      "error",
    ]),
    answer: z.string(),
    citations: z.array(candidateCitationSchema).default([]), // if citations missing, inserts empty array
    observedDataClasses: z.array(z.string().min(1)).default([]),
    academicYear: z
      .string()
      .regex(/^AY\d{4}\/\d{2}$/)
      .nullable()
      .default(null),
    checkedAt: z.string().datetime({ offset: true }).nullable().default(null),
    effectiveAt: z.string().min(1).nullable().default(null),
    metrics: z
      .object({
        latencyMs: z.number().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        toolCalls: z.number().int().nonnegative(),
      })
      .strict(), // metrics stores performance measurements
  })
  .strict();

export type CandidateResponse = z.infer<typeof candidateResponseSchema>;

export type SourceRegistryEntry = {
  allowedDomains: string[];
  enabled: boolean;
};

export type SourceRegistry = Map<string, SourceRegistryEntry>;

export type EvaluationLimits = {
  maxLatencyMs: number;
  maxOutputTokens: number;
  maxToolCalls: number;
}; // stores resource limits for an evaluation

export type CheckResult = {
  id: string;
  passed: boolean;
  message: string;
};

export type DimensionScores = {
  behavior: 0 | 2;
  citations: 0 | 2;
  factual: 0 | 2 | null;
  freshness: 0 | 2;
  privacyAndSafety: 0 | 2;
};

export type CaseEvaluationResult = {
  answerSha256: string | null;
  caseId: string;
  checks: CheckResult[];
  criticalFailure: boolean;
  deterministicPass: boolean;
  dimensions: DimensionScores;
  expectedStatus: string;
  actualStatus: string;
  humanReviewRequired: true;
  responseLine: number | null;
  risk: EvaluationCase["risk"]["level"];
};
