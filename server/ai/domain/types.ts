import { z } from "zod";

export const citationSchema = z
  .object({
    claimIds: z.array(z.string().min(1)),
    documentVersionId: z.string().min(1),
    effectiveAt: z.string().datetime().nullable(),
    retrievedAt: z.string().datetime(),
    sourceId: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
  })
  .strict();

export const groundedAnswerSchema = z
  .object({
    answer: z.string().trim().min(1),
    citations: z.array(citationSchema),
    followUpQuestion: z.string().trim().min(1).optional(),
    status: z.enum([
      "answered",
      "needs_clarification",
      "not_verified",
      "refused",
    ]),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;

export type AiProviderRequest = {
  input: string;
  requestId: string;
  systemInstruction: string;
};

export type AiTokenUsage = {
  input: number | null;
  output: number | null;
};

export type AiProviderResult = {
  answer: GroundedAnswer;
  model: string;
  tokenUsage: AiTokenUsage;
};

