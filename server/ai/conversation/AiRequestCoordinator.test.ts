import assert from "node:assert/strict";
import test from "node:test";
import {
  AiConcurrencyLimitError,
  AiRequestCoordinator,
} from "./AiRequestCoordinator";

test("limits concurrent requests per user without affecting other users", () => {
  const coordinator = new AiRequestCoordinator(1);
  const releaseFirst = coordinator.acquire("first-user");

  assert.throws(
    () => coordinator.acquire("first-user"),
    AiConcurrencyLimitError,
  );
  const releaseSecond = coordinator.acquire("second-user");
  releaseFirst();
  const releaseRetry = coordinator.acquire("first-user");

  releaseFirst();
  releaseSecond();
  releaseRetry();
});
