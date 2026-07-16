import cors from "cors";
import "dotenv/config";
import express from "express";
import http from "http";
import { pool } from "./db";
import { configureSocketServer } from "./socket";

import authRoutes from "./routes/auth";
import commentRoutes from "./routes/comments";
import conversationRoutes from "./routes/conversations";
import groupRoutes from "./routes/groups";
import notificationRoutes from "./routes/notifications";
import postRoutes from "./routes/posts";
import recentRoutes from "./routes/recent";
import userRoutes from "./routes/users";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
configureSocketServer(server);

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/posts/:postId/comments", commentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/recent", recentRoutes);
app.use("/api/notifications", notificationRoutes);

pool.query("SELECT NOW()", (err, res) => {
  // check if can connect to database
  if (err) {
    console.log("Database connection FAILED:", err.message);
  } else {
    console.log("Database connected successfully at:", res.rows[0].now); // now: time of connection
  }
});

app.get("/", (req, res) => {
  res.json({ message: "NUSHub API is running!" });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
