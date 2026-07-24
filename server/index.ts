import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { runMigrations } from "./database/migrate";
import { pool } from "./db";
import { configureSocketServer } from "./socket";

async function startServer() {
  await runMigrations();

  const connectionCheck = await pool.query("SELECT NOW()");
  console.log(
    "Database connected successfully at:",
    connectionCheck.rows[0].now,
  );

  const app = createApp();
  const server = http.createServer(app);
  configureSocketServer(server);

  server.listen(env.PORT, () => {
    console.log("Server running on port", env.PORT);
  });
}

startServer().catch(async (error: unknown) => {
  console.error("Server startup failed:", error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
