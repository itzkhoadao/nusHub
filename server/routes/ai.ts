import express from "express";
import { aiConfig, type AiConfig } from "../ai/config/aiConfig";
import authenticate from "../middleware/authenticate";
import {
  createAiConversationRouter,
  type AiConversationRouteDependencies,
} from "./aiConversationRoutes";

export function createAiRouter(
  config: AiConfig = aiConfig,
  dependencies: AiConversationRouteDependencies = {},
) {
  const router = express.Router();

  // This endpoint is intentionally non-billable: it reports safe configuration
  // state but never calls Gemini or exposes keys, prompts, quotas, or user data.
  router.get("/health", authenticate, (req, res) => {
    return res.status(config.enabled ? 200 : 503).json({
      enabled: config.enabled,
      model: config.generationModel,
      provider: config.provider,
      request_id: req.requestId,
      status: config.enabled ? "configured" : "disabled",
    });
  });

  router.use(
    "/",
    authenticate,
    createAiConversationRouter(config, dependencies),
  );

  return router;
}

export default createAiRouter();
