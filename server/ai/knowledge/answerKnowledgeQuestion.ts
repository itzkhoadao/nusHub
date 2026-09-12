import type { AiProvider } from "../providers/AiProvider";
import type { GroundedAnswer } from "../domain/types";
import type { ModuleQuestionAnswer } from "../orchestration/answerModuleQuestion";
import {
  NUS_KNOWLEDGE_PROMPT_VERSION,
  NUS_KNOWLEDGE_SYSTEM_INSTRUCTION,
} from "../prompts/nusKnowledgeAssistant.v1";
import type { HybridKnowledgeRetriever } from "./HybridKnowledgeRetriever";
import { routeKnowledgeQuery } from "./routeKnowledgeQuery";
import type { RetrievedEvidence } from "./types";
import {
  GroundingValidationError,
  validateGroundedKnowledgeAnswer,
} from "./validateGroundedKnowledgeAnswer";

export async function answerKnowledgeQuestion(
  input: {
    requestId: string;
    signal?: AbortSignal;
    text: string;
    unsafeInput?: boolean;
  },
  dependencies: {
    maxContextChars: number;
    provider: AiProvider;
    retriever: HybridKnowledgeRetriever;
  },
): Promise<ModuleQuestionAnswer> {
  if (input.unsafeInput) {
    return wrap(refused("The request contains unsafe tool input and was rejected before retrieval."));
  }
  const route = routeKnowledgeQuery(input.text);
  if (route.action === "refuse") {
    return wrap(
      refused(
        route.reason === "credentials"
          ? "I cannot request, retrieve, or handle passwords, security codes, tokens, or private keys. Use the official NUS support and account-recovery channels instead."
          : "I cannot access private NUS account, academic, billing, message, or medical records. Use the relevant authenticated NUS service or contact the responsible office.",
      ),
    );
  }
  if (route.action === "unsupported") {
    return wrap({
      answer:
        "I can currently help with NUS modules, academic-calendar dates, campus transport, libraries, student support, University Health Centre services, and NUS IT guidance. Please ask within one of those areas.",
      citations: [],
      status: "not_verified",
      warnings: ["unsupported_knowledge_scope"],
    });
  }

  const evidence = await dependencies.retriever.search(
    { filters: route.filters, text: input.text },
    input.signal,
  );
  if (evidence.length === 0) {
    return wrap(notVerified("I could not find current approved evidence for that question."));
  }

  const conflicts = findConflicts(evidence);
  if (conflicts.length > 0) {
    return wrap({
      answer:
        "I found conflicting current official evidence, so I cannot provide a verified answer. Please confirm this directly with the responsible NUS office.",
      citations: conflicts.map(evidenceCitation),
      status: "not_verified",
      warnings: ["conflicting_sources"],
    });
  }

  const boundedEvidence = fitEvidence(
    input.text,
    evidence,
    dependencies.maxContextChars,
  );
  if (boundedEvidence.length === 0) {
    return wrap(notVerified("The retrieved evidence could not fit within the safe context limit."));
  }

  const providerResult = await dependencies.provider.generateAnswer({
    input: JSON.stringify({
      evidence: boundedEvidence.map((item) => ({
        claimId: `knowledge_chunk:${item.chunkId}`,
        content: item.content,
        documentVersionId: item.documentVersionId,
        effectiveAt: item.effectiveAt,
        heading: item.heading,
        retrievedAt: item.fetchedAt,
        sourceId: item.sourceId,
        title: item.title,
        trustTier: item.trustTier,
        url: item.url,
      })),
      question: input.text,
    }),
    requestId: input.requestId,
    systemInstruction: NUS_KNOWLEDGE_SYSTEM_INSTRUCTION,
  });

  try {
    const answer = validateGroundedKnowledgeAnswer(
      providerResult.answer,
      boundedEvidence,
    );
    return wrap(
      {
        ...answer,
        warnings: [
          ...answer.warnings,
          ...(route.highStakes
            ? ["This information is not professional advice. Verify consequential details directly with the responsible NUS office."]
            : []),
        ],
      },
      providerResult.model,
    );
  } catch (error) {
    if (!(error instanceof GroundingValidationError)) throw error;
    return wrap({
      answer:
        "I retrieved relevant information, but the generated answer did not pass citation validation. Please check the official sources directly.",
      citations: [],
      status: "not_verified",
      warnings: ["citation_validation_failed"],
    });
  }
}

function fitEvidence(
  question: string,
  evidence: RetrievedEvidence[],
  maximumCharacters: number,
) {
  const selected: RetrievedEvidence[] = [];
  let used = question.length + 300;
  for (const item of evidence) {
    const metadataSize = JSON.stringify({ ...item, content: "" }).length;
    const remaining = maximumCharacters - used - metadataSize;
    if (remaining < 240) break;
    const content = item.content.slice(0, remaining);
    selected.push({ ...item, content });
    used += metadataSize + content.length;
  }
  return selected;
}

function findConflicts(evidence: RetrievedEvidence[]) {
  const byKey = new Map<string, Map<string, RetrievedEvidence>>();
  for (const item of evidence) {
    const key = item.metadata.conflict_key;
    const value = item.metadata.fact_value;
    if (typeof key !== "string" || typeof value !== "string") continue;
    const values = byKey.get(key) ?? new Map<string, RetrievedEvidence>();
    values.set(value, item);
    byKey.set(key, values);
  }
  return [...byKey.values()]
    .filter((values) => values.size > 1)
    .flatMap((values) => [...values.values()]);
}

function evidenceCitation(evidence: RetrievedEvidence) {
  return {
    claimIds: [`knowledge_chunk:${evidence.chunkId}`],
    documentVersionId: evidence.documentVersionId,
    effectiveAt: evidence.effectiveAt,
    retrievedAt: evidence.fetchedAt,
    sourceId: evidence.sourceId,
    title: evidence.title,
    url: evidence.url,
  };
}

function refused(answer: string): GroundedAnswer {
  return { answer, citations: [], status: "refused", warnings: [] };
}

function notVerified(answer: string): GroundedAnswer {
  return {
    answer,
    citations: [],
    status: "not_verified",
    warnings: ["approved_evidence_not_found"],
  };
}

function wrap(
  groundedAnswer: GroundedAnswer,
  modelId: string | null = null,
): ModuleQuestionAnswer {
  return {
    academicYear: null,
    groundedAnswer,
    modelId,
    moduleCode: null,
    promptVersion: NUS_KNOWLEDGE_PROMPT_VERSION,
  };
}
