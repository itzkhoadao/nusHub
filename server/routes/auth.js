const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if the user already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE email=$1 OR username=$2",
      [email, username], // provide values for placeholders $1 and $2
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email or username already taken" });
    }

    // Hash the password
    const hash = await bcrypt.hash(password, 10);

    // Save user to database
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email",
      [username, email, hash],
    );

    // Create a token (indicate the user is signed in)
    const token = jwt.sign(
      { id: result.rows[0].id }, // result is the id, username, email returned by pool query
      process.env.JWT_SECRET,
    );

    res.json({ user: result.rows[0], token }); // sends a success response to the frontend
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user is in the database
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "No account with that email" });
    }

    // Check password
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Wrong password
      return res.status(401).json({ error: "Wrong password" });
    }

    // Create a token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
