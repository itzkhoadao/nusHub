import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import {
  apiCors,
  apiRateLimiter,
  authRateLimiter,
} from "./middleware/apiSecurity";
import {
  errorHandler,
  notFound,
} from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import authRoutes from "./routes/auth";
import commentRoutes from "./routes/comments";
import conversationRoutes from "./routes/conversations";
import groupRoutes from "./routes/groups";
import notificationRoutes from "./routes/notifications";
import postRoutes from "./routes/posts";
import recentRoutes from "./routes/recent";
import userRoutes from "./routes/users";

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(apiCors);
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT })); // default limit: 1MB
  app.use("/api", apiRateLimiter);

  app.use("/api/auth", authRateLimiter, authRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/posts/:postId/comments", commentRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/recent", recentRoutes);
  app.use("/api/notifications", notificationRoutes);

  app.get("/", (_req, res) => {
    res.json({ message: "NUSHub API is running!" });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
