const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require("./routes/auth"); // imports the router from auth.js
const postRoutes = require("./routes/posts");
const commentRoutes = require("./routes/comments");
const userRoutes = require('./routes/users');

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/posts/:postId/comments", commentRoutes);
app.use("/api/users", userRoutes);

const pool = new Pool({
  // creates a PostgreSQL connection pool
  connectionString: process.env.DATABASE_URL,
});

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

app.listen(process.env.PORT, () => {
  console.log("Server running on port", process.env.PORT);
});
