import type { GroundedAnswer } from "../domain/types";
import type { ModuleQuestion } from "../orchestration/answerModuleQuestion";

export type AiConversationSummary = {
  created_at: string;
  id: string;
  title: string;
  updated_at: string;
};

export type AiStoredCitation = GroundedAnswer["citations"][number] & {
  position: number;
};

export type AiStoredMessage = {
  academic_year: string | null;
  answer_status: GroundedAnswer["status"] | null;
  citations: AiStoredCitation[];
  content: string;
  created_at: string;
  delivery_status: "processing" | "completed" | "failed" | "interrupted";
  error_code: string | null;
  feedback_rating: "helpful" | "unhelpful" | null;
  follow_up_question: string | null;
  id: string;
  module_code: string | null;
  role: "user" | "assistant";
  updated_at: string;
  warnings: string[];
};

export type AiConversationDetail = AiConversationSummary & {
  messages: AiStoredMessage[];
};

export type AiExchange = {
  assistantMessageId: string;
  replayed: boolean;
  userMessageId: string;
};

export type CompleteAssistantInput = {
  academicYear: string | null;
  answer: GroundedAnswer;
  assistantMessageId: string;
  moduleCode: string | null;
};

export interface AiConversationStore {
  beginExchange(input: {
    content: string;
    conversationId: string;
    dailyLimit: number;
    idempotencyKey: string;
    requestId: string;
    userId: string;
  }): Promise<AiExchange>;
  completeAssistant(input: CompleteAssistantInput): Promise<void>;
  createConversation(userId: string, title?: string): Promise<AiConversationSummary>;
  deleteConversation(conversationId: string, userId: string): Promise<boolean>;
  failAssistant(input: {
    assistantMessageId: string;
    errorCode: string;
    interrupted: boolean;
  }): Promise<void>;
  getConversation(conversationId: string, userId: string): Promise<AiConversationDetail | null>;
  getMessage(messageId: string, userId: string): Promise<AiStoredMessage | null>;
  listConversations(userId: string): Promise<AiConversationSummary[]>;
  setFeedback(input: {
    messageId: string;
    rating: "helpful" | "unhelpful";
    userId: string;
  }): Promise<boolean>;
}

export type ModuleAnswerService = (
  question: ModuleQuestion & { signal?: AbortSignal },
) => Promise<{
  academicYear: string | null;
  groundedAnswer: GroundedAnswer;
  moduleCode: string | null;
}>;
