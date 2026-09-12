import assert from "node:assert/strict";
import test from "node:test";
import {
  createModuleQuestionService,
  shouldUseKnowledgeQuestion,
} from "./createModuleQuestionService";

test("keeps module records structured and routes official campus topics to knowledge", () => {
  assert.equal(
    shouldUseKnowledgeQuestion({
      intent: "prerequisite",
      moduleCode: "CS2040S",
      originalText: "What are the prerequisites for CS2040S?",
    }),
    false,
  );
  assert.equal(
    shouldUseKnowledgeQuestion({
      intent: "summary",
      originalText: "When does reading week begin?",
    }),
    true,
  );
  assert.equal(
    shouldUseKnowledgeQuestion({
      intent: "summary",
      originalText: "How do I reset my NUS password?",
    }),
    true,
  );
  assert.equal(
    shouldUseKnowledgeQuestion({
      intent: "summary",
      moduleCode: "CS2040S",
      originalText: "When does the library open?",
    }),
    true,
  );
  assert.equal(
    shouldUseKnowledgeQuestion({
      intent: "summary",
      originalText: "Where can I get help in a medical emergency?",
    }),
    true,
  );
});

test("passes the original question and request identity into knowledge orchestration", async () => {
  let receivedText = "";
  let receivedRequestId = "";
  const service = createModuleQuestionService({
    answerKnowledge: async (input) => {
      receivedText = input.text;
      receivedRequestId = input.requestId;
      return {
        academicYear: null,
        groundedAnswer: {
          answer: "Not verified",
          citations: [],
          status: "not_verified",
          warnings: [],
        },
        moduleCode: null,
      };
    },
  });

  await service({
    intent: "summary",
    originalText: "When does the library open?",
    requestId: "22222222-2222-4222-8222-222222222222",
  });

  assert.equal(receivedText, "When does the library open?");
  assert.equal(receivedRequestId, "22222222-2222-4222-8222-222222222222");
});
