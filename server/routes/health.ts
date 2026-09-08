import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db";

type HealthDatabase = Pick<Pool, "query">;

export function createHealthRouter(database: HealthDatabase = pool) {
  const router = Router();

  router.get("/live", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ status: "live" });
  });

  router.get("/ready", async (_request, response) => {
    response.set("Cache-Control", "no-store");

    try {
      await database.query("SELECT 1");
      response.json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  });

  return router;
}
