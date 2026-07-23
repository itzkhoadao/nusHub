import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db";
import { configureSocketServer } from "./socket";

const app = createApp(); // builds the Express app
const server = http.createServer(app);
configureSocketServer(server);

pool.query("SELECT NOW()", (err, res) => {
  // check if can connect to database
  if (err) {
    console.log("Database connection FAILED:", err.message);
  } else {
    console.log("Database connected successfully at:", res.rows[0].now); // now: time of connection
  }
});

server.listen(env.PORT, () => {
  console.log("Server running on port", env.PORT);
});
