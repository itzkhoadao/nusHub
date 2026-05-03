const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.log("Database connection FAILED:", err.message);
  } else {
    console.log("Database connected successfully at:", res.rows[0].now);
  }
});

app.get("/", (req, res) => {
  res.json({ message: "NUSHub API is running!" });
});

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
