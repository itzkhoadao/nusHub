import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { AiConfig } from "../ai/config/aiConfig";
import {
  AiConversationNotFoundError,
  AiQuotaExceededError,
  PostgresAiConversationStore,
} from "../ai/conversation/PostgresAiConversationStore";
import {
  AiConcurrencyLimitError,
  AiRequestCoordinator,
} from "../ai/conversation/AiRequestCoordinator";
import {
  initializeEventStream,
  streamAnswerEvents,
  writeCompletionEvent,
  writeEvent,
} from "../ai/conversation/sse";
import type {
  AiConversationStore,
  AiStoredMessage,
  ModuleAnswerService,
} from "../ai/conversation/types";
import { createModuleQuestionService } from "../ai/createModuleQuestionService";
import {
  groundedAnswerSchema,
  type GroundedAnswer,
} from "../ai/domain/types";
import { parseModuleQuestionText } from "../ai/orchestration/parseModuleQuestion";
import type { ModuleQuestion } from "../ai/orchestration/answerModuleQuestion";
import { AppError } from "../errors/AppError";
import { readRequiredIdempotencyKey } from "../middleware/idempotency";

const identifierSchema = z.string().uuid();
const createConversationSchema = z
  .object({ title: z.string().trim().min(1).max(80).optional() })
  .strict();
const feedbackSchema = z
  .object({ rating: z.enum(["helpful", "unhelpful"]) })
  .strict();

export type AiConversationRouteDependencies = {
  answerModuleQuestion?: ModuleAnswerService;
  coordinator?: AiRequestCoordinator;
  store?: AiConversationStore;
};

export function createAiConversationRouter(
  config: AiConfig,
  dependencies: AiConversationRouteDependencies = {},
) {
  const router = express.Router();
  const store = dependencies.store ?? new PostgresAiConversationStore();
  const answerModuleQuestion =
    dependencies.answerModuleQuestion ?? createModuleQuestionService();
  const coordinator =
    dependencies.coordinator ??
    new AiRequestCoordinator(config.maxConcurrentRequestsPerUser);

  router.use((_req, _res, next) => {
    if (!config.enabled) {
      return next(
        new AppError(
          503,
          "AI_DISABLED",
          "The AI assistant is currently unavailable.",
        ),
      );
    }
    next();
  });

  router.post("/conversations", asyncHandler(async (req, res) => {
    const input = parseBody(createConversationSchema, req.body);
    const conversation = await store.createConversation(req.user.id, input.title);
    res.status(201).json({ conversation, request_id: req.requestId });
  }));

  router.get("/conversations", asyncHandler(async (req, res) => {
    const conversations = await store.listConversations(req.user.id);
    res.json({ conversations, request_id: req.requestId });
  }));

  router.get("/conversations/:conversationId", asyncHandler(async (req, res) => {
    const conversationId = parseIdentifier(req.params.conversationId);
    const conversation = await store.getConversation(conversationId, req.user.id);
    if (!conversation) throw notFound();
    res.json({ conversation, request_id: req.requestId });
  }));

  router.delete("/conversations/:conversationId", asyncHandler(async (req, res) => {
    const conversationId = parseIdentifier(req.params.conversationId);
    if (!(await store.deleteConversation(conversationId, req.user.id))) {
      throw notFound();
    }
    res.status(204).end();
  }));

  router.post(
    "/conversations/:conversationId/messages",
    asyncHandler(async (req, res) => {
      if (
        req.get("Accept")?.toLowerCase().includes("text/event-stream") !== true
      ) {
        throw new AppError(
          406,
          "AI_STREAM_REQUIRED",
          "This endpoint requires Accept: text/event-stream.",
        );
      }

      const conversationId = parseIdentifier(req.params.conversationId);
      const idempotencyKey = readRequiredIdempotencyKey(req);
      const messageSchema = z
        .object({ content: z.string().trim().min(1).max(config.maxInputChars) })
        .strict();
      const { content } = parseBody(messageSchema, req.body);
      let release: (() => void) | undefined;

      try {
        release = coordinator.acquire(req.user.id);
        const exchange = await store.beginExchange({
          content,
          conversationId,
          dailyLimit: config.dailyRequestLimitPerUser,
          idempotencyKey,
          requestId: req.requestId,
          userId: req.user.id,
        });

        if (exchange.replayed) {
          const stored = await store.getMessage(
            exchange.assistantMessageId,
            req.user.id,
          );
          if (!stored) throw notFound();
          if (stored.delivery_status === "processing") {
            res.set("Retry-After", "1");
            throw new AppError(
              409,
              "AI_REQUEST_IN_PROGRESS",
              "This AI request is still processing.",
            );
          }
          initializeEventStream(res);
          writeEvent(res, req.requestId, "response.started", {
            message_id: stored.id,
            replayed: true,
          });
          if (stored.delivery_status !== "completed") {
            writeEvent(res, req.requestId, "response.failed", {
              code: stored.error_code ?? "AI_RESPONSE_FAILED",
              message: "The earlier AI request did not complete.",
            });
            res.end();
            return;
          }
          await streamAnswerEvents({
            academicYear: stored.academic_year,
            answer: storedMessageAnswer(stored),
            assistantMessageId: stored.id,
            moduleCode: stored.module_code,
            requestId: req.requestId,
            res,
          });
          res.end();
          return;
        }

        const controller = new AbortController();
        let completed = false;
        res.once("close", () => {
          if (!completed) controller.abort();
        });
        initializeEventStream(res);
        writeEvent(res, req.requestId, "response.started", {
          message_id: exchange.assistantMessageId,
          replayed: false,
        });

        try {
          const parsedQuestion = parseModuleQuestionText(content);
          const conversation = await store.getConversation(
            conversationId,
            req.user.id,
          );
          const question = applyConversationContext(
            parsedQuestion,
            conversation?.messages ?? [],
          );
          const result = await answerModuleQuestion({
            ...question,
            originalText: content,
            requestId: req.requestId,
            signal: controller.signal,
          });
          if (controller.signal.aborted) throw new Error("AI_STREAM_CANCELLED");
          const validatedAnswer = groundedAnswerSchema.parse(
            result.groundedAnswer,
          );

          await streamAnswerEvents({
            academicYear: result.academicYear,
            answer: validatedAnswer,
            assistantMessageId: exchange.assistantMessageId,
            includeCompletion: false,
            moduleCode: result.moduleCode,
            requestId: req.requestId,
            res,
            signal: controller.signal,
          });
          if (controller.signal.aborted) throw new Error("AI_STREAM_CANCELLED");
          await store.completeAssistant({
            academicYear: result.academicYear,
            answer: validatedAnswer,
            assistantMessageId: exchange.assistantMessageId,
            modelId: result.modelId,
            moduleCode: result.moduleCode,
            promptVersion: result.promptVersion,
          });
          writeCompletionEvent({
            academicYear: result.academicYear,
            answer: validatedAnswer,
            moduleCode: result.moduleCode,
            requestId: req.requestId,
            res,
          });
          completed = true;
          res.end();
        } catch (error) {
          const interrupted = controller.signal.aborted ||
            (error instanceof Error && error.message === "AI_STREAM_CANCELLED");
          try {
            await store.failAssistant({
              assistantMessageId: exchange.assistantMessageId,
              errorCode: interrupted ? "AI_REQUEST_CANCELLED" : "AI_RESPONSE_FAILED",
              interrupted,
            });
          } catch {
            // The client still receives a stable terminal event when possible;
            // persistence outages are reported through request-level telemetry.
            console.error("Could not persist AI response failure", {
              requestId: req.requestId,
            });
          }
          if (!interrupted) {
            writeEvent(res, req.requestId, "response.failed", {
              code: "AI_RESPONSE_FAILED",
              message: "The assistant could not complete this response.",
            });
            completed = true;
            res.end();
          }
        }
      } catch (error) {
        if (error instanceof AiConversationNotFoundError) throw notFound();
        if (error instanceof AiQuotaExceededError) {
          res.set("Retry-After", secondsUntilTomorrowUtc());
          throw new AppError(
            429,
            "AI_DAILY_QUOTA_EXCEEDED",
            "Your daily AI request limit has been reached.",
          );
        }
        if (error instanceof AiConcurrencyLimitError) {
          res.set("Retry-After", "1");
          throw new AppError(
            429,
            "AI_CONCURRENT_LIMIT_EXCEEDED",
            "Wait for your current AI response to finish before starting another.",
          );
        }
        throw error;
      } finally {
        release?.();
      }
    }),
  );

  router.post("/messages/:messageId/feedback", asyncHandler(async (req, res) => {
    const messageId = parseIdentifier(req.params.messageId);
    const input = parseBody(feedbackSchema, req.body);
    const updated = await store.setFeedback({
      messageId,
      rating: input.rating,
      userId: req.user.id,
    });
    if (!updated) throw notFound();
    res.json({ rating: input.rating, request_id: req.requestId });
  }));

  return router;
}

export function applyConversationContext(
  question: ModuleQuestion,
  messages: AiStoredMessage[],
): ModuleQuestion {
  const previousAnswer = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        message.delivery_status === "completed" &&
        (message.academic_year || message.module_code),
    );

  if (!previousAnswer) return question;
  return {
    ...question,
    academicYear: question.academicYear ?? previousAnswer.academic_year ?? undefined,
    moduleCode: question.moduleCode ?? previousAnswer.module_code ?? undefined,
  };
}

function storedMessageAnswer(message: AiStoredMessage): GroundedAnswer {
  return {
    answer: message.content,
    citations: message.citations.map(({ position: _position, ...citation }) => citation),
    ...(message.follow_up_question
      ? { followUpQuestion: message.follow_up_question }
      : {}),
    status: message.answer_status ?? "not_verified",
    warnings: message.warnings,
  };
}

function parseIdentifier(value: string | string[] | undefined) {
  const result = identifierSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, "INVALID_IDENTIFIER", "The identifier is invalid.");
  }
  return result.data;
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, "INVALID_AI_REQUEST", "The AI request is invalid.");
  }
  return result.data;
}

function notFound() {
  return new AppError(
    404,
    "AI_RESOURCE_NOT_FOUND",
    "The AI conversation or message was not found.",
  );
}

function secondsUntilTomorrowUtc() {
  const now = new Date();
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return String(Math.max(1, Math.ceil((tomorrow - now.getTime()) / 1_000)));
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}
