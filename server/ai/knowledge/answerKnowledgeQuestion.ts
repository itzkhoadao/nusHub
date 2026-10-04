import type { AiProvider } from "../providers/AiProvider";
import type { GroundedAnswer } from "../domain/types";
import type { ModuleQuestionAnswer } from "../orchestration/answerModuleQuestion";
import {
  NUS_KNOWLEDGE_PROMPT_VERSION,
  NUS_KNOWLEDGE_SYSTEM_INSTRUCTION,
} from "../prompts/nusKnowledgeAssistant.v1";
import type { HybridKnowledgeRetriever } from "./HybridKnowledgeRetriever";
import { isSelfHarmKnowledgeQuery, isUrgentKnowledgeQuery, routeKnowledgeQuery } from "./routeKnowledgeQuery";
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
    retriever: Pick<HybridKnowledgeRetriever, "search">;
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
          : route.reason === "unsafe_input"
            ? "I cannot bypass source verification or fabricate citations. Please ask a factual NUS question."
            : "I cannot access private NUS account, academic, billing, message, or medical records. Use the relevant authenticated NUS service or contact the responsible office.",
      ),
    );
  }
  if (route.action === "clarify") {
    return wrap({ answer: route.question, followUpQuestion: route.question, citations: [], status: "needs_clarification", warnings: [] });
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

  if (route.filters.sourceIds?.includes("nus_registrar_calendar") &&
      /\b(reading week|exam period|semester dates?)\b/i.test(input.text) &&
      !/\bsemester\s*(?:1|2|one|two)\b/i.test(input.text)) {
    const question = "Do you mean regular Semester 1 or Semester 2?";
    return wrap({ answer: question, followUpQuestion: question, citations: [], status: "needs_clarification", warnings: [] });
  }

  let evidence: RetrievedEvidence[];
  try {
    evidence = await dependencies.retriever.search(
      { filters: route.filters, text: input.text },
      input.signal,
    );
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    if (isUrgentKnowledgeQuery(input.text)) return wrap(urgentUnverified());
    throw error;
  }
  if (evidence.length === 0) {
    if (isUrgentKnowledgeQuery(input.text)) {
      return wrap(urgentUnverified());
    }
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

  // Time-critical self-harm support should never wait for a generation provider.
  // Only use the template when one current official OSA passage contains every
  // contact and routing fact it states; otherwise the generic emergency fallback
  // remains available without claiming an unverified NUS contact.
  if (isSelfHarmKnowledgeQuery(input.text)) {
    const support = evidence.find((item) => item.sourceId === "nus_osa" &&
      /Lifeline NUS/i.test(item.content) && /Accident\s*&\s*Emergency/i.test(item.content) &&
      /immediate danger[^.]*999/i.test(item.content));
    const number = support?.content.match(/Lifeline NUS[^\n]{0,80}?\b(\d{4}\s+\d{4})\b/i)?.[1];
    if (support && number) {
      return wrap({
        answer: `I'm sorry you're facing this. If you might be in immediate danger, call 999 now or go to a hospital Accident & Emergency department. NUS also lists its 24-hour Lifeline NUS at ${number}. Please reach out for help now.`,
        citations: [evidenceCitation(support)],
        status: "answered",
        warnings: [],
      });
    }
    return wrap({
      answer: "If you might be in immediate danger, call local emergency services now or go to the nearest emergency department. I could not verify a current NUS support contact from approved sources.",
      citations: [],
      status: "not_verified",
      warnings: ["urgent_support_unverified"],
    });
  }
  if (isUrgentKnowledgeQuery(input.text)) {
    return wrap({
      answer: "If you or someone else may be in immediate danger, call local emergency services now or go to the nearest emergency department. I cannot verify situation-specific NUS guidance from these sources.",
      citations: [],
      status: "not_verified",
      warnings: ["urgent_support_unverified"],
    });
  }

  // The approved transport capture names routes, but its stop order is only
  // shown in map images. A generated ordered list would be unsupported.
  if (route.filters.sourceIds?.includes("nus_transport") &&
      /\bstops?\b/i.test(input.text) &&
      /\b(?:every|all|order|sequence|list)\b/i.test(input.text)) {
    return wrap(notVerified("I cannot verify an ordered shuttle stop list from the approved text. Please check the current route map on the official NUS transport page or in uNivUS."));
  }
  // The UHC FAQ explains booking but has no live appointment inventory.
  if (route.filters.sourceIds?.includes("nus_uhc") &&
      /\b(?:live|right now|current|today)\b/i.test(input.text) &&
      /\b(?:wait(?:ing)? time|available slots?|appointment availability)\b/i.test(input.text)) {
    return wrap(notVerified("I cannot verify live UHC appointment wait times or availability from the approved FAQ. Please check MyUHC through uNivUS or contact UHC directly."));
  }

  // Flattened PDF tables do not establish which date belongs to a mini-semester.
  // Fail closed until the corpus has an independently verified table extraction.
  if (route.filters.sourceIds?.includes("nus_registrar_calendar") && /\bmini[- ]semester\b/i.test(input.text)) {
    return wrap(notVerified("I found the official calendar, but cannot reliably verify mini-semester dates from the extracted table. Please check the Registrar PDF directly."));
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
    signal: input.signal,
    systemInstruction: NUS_KNOWLEDGE_SYSTEM_INSTRUCTION,
  });

  try {
    const answer = validateGroundedKnowledgeAnswer(
      providerResult.answer,
      boundedEvidence,
    );
    const contextualAnswer = addCalendarSectionCitation(answer, boundedEvidence, input.text);
    return wrap(
      {
        ...contextualAnswer,
        warnings: [
          ...contextualAnswer.warnings,
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

function addCalendarSectionCitation(
  answer: GroundedAnswer,
  evidence: RetrievedEvidence[],
  question: string,
): GroundedAnswer {
  if (answer.status !== "answered" || !/\bsemester\s*1\b/i.test(question)) return answer;
  const cited = new Set(answer.citations.flatMap((citation) => citation.claimIds));
  const citedCalendar = evidence.filter((item) => item.sourceId === "nus_registrar_calendar" &&
    cited.has(`knowledge_chunk:${item.chunkId}`));
  if (citedCalendar.length === 0 || citedCalendar.some((item) => /\bSEMESTER 1\b/i.test(item.content))) return answer;
  const preceding = evidence.find((item) => item.sourceId === "nus_registrar_calendar" &&
    citedCalendar.some((row) => row.documentVersionId === item.documentVersionId &&
      Number(row.chunkId) - Number(item.chunkId) === 1) &&
    /\bSEMESTER 1\b/i.test(item.content));
  if (!preceding) {
    return notVerified("I found a calendar date, but cannot verify its Semester 1 context from the cited passages. Please check the Registrar PDF directly.");
  }
  return { ...answer, citations: [...answer.citations, evidenceCitation(preceding)] };
}

function fitEvidence(
  question: string,
  evidence: RetrievedEvidence[],
  maximumCharacters: number,
) {
  const selected: RetrievedEvidence[] = [];
  for (const item of evidence) {
    // Keep whole passages: cutting a table row or exception can reverse its meaning.
    const size = JSON.stringify({ question, evidence: [...selected, item] }).length + 300;
    if (size <= maximumCharacters) selected.push(item);
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

function urgentUnverified(): GroundedAnswer {
  return {
    answer: "If you or someone else may be in immediate danger, call local emergency services now or go to the nearest emergency department. I could not verify current NUS guidance from approved sources.",
    citations: [],
    status: "not_verified",
    warnings: ["approved_evidence_not_found", "urgent_support_unverified"],
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
