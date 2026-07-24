import express from "express";
const router = express.Router();
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";

import { createAccessToken } from "../auth/tokens";
import { env } from "../config/env";
import { pool } from "../db";
import { respondWithCaughtError } from "../middleware/errorHandler";
// register with Google Account option
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// sign up with Google => not choose a username manually
async function createUniqueUsername(
  name: string | undefined,
  email: string | undefined,
  googleId: string,
) {
  const fallbackName = email?.split("@")[0] || `google_${googleId.slice(0, 8)}`;
  const cleanName = (name || fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  const baseUsername = cleanName || fallbackName;
  let username = baseUsername;
  let suffix = 1;

  // checks the database until it finds an unused username
  while (true) {
    const existing = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [username],
    );

    if (existing.rows.length === 0) {
      return username;
    }

    username = `${baseUsername}_${suffix}`;
    suffix += 1;
  }
}

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
      `INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3)
       RETURNING id, username, email, (onboarding_completed_at IS NOT NULL) AS onboarding_completed`,
      [username, email, hash],
    );

    // Create a token (indicate the user is signed in)
    const token = createAccessToken(result.rows[0].id); // result is the id, username, email returned by pool query

    res.json({ user: result.rows[0], token }); // sends a success response to the frontend
  } catch (err) {
    respondWithCaughtError(req, res, err);
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

    if (!user.password_hash) {
      return res.status(401).json({
        error: "This account uses Google sign-in. Please continue with Google.",
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Wrong password
      return res.status(401).json({ error: "Wrong password" });
    }

    // Create a token
    const token = createAccessToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        onboarding_completed: Boolean(user.onboarding_completed_at),
      },
    });
  } catch (err) {
    respondWithCaughtError(req, res, err);
  }
});

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    }); // verifies the Google credential

    // extracts Google user information
    const payload = ticket.getPayload();
    const googleId = payload?.sub || "";
    const email = payload?.email;
    const avatarUrl = payload?.picture || null;
    let result = await pool.query(
      `SELECT id, username, email,
              (onboarding_completed_at IS NOT NULL) AS onboarding_completed
       FROM users WHERE google_id = $1 OR email = $2`,
      [googleId, email],
    );

    if (result.rows.length === 0) {
      // user does not exist, create new Google user
      const username = await createUniqueUsername(
        payload?.name,
        email,
        googleId,
      );

      result = await pool.query(
        `INSERT INTO users (username, email, password_hash, google_id, avatar_url, auth_provider)
         VALUES ($1, $2, $3, $4, $5, 'google')
         RETURNING id, username, email,
                   (onboarding_completed_at IS NOT NULL) AS onboarding_completed`,
        [username, email, "", googleId, avatarUrl],
      ); 
    } else {
      await pool.query(
        `UPDATE users
         SET google_id = COALESCE(google_id, $1),
             avatar_url = COALESCE($2, avatar_url),
             auth_provider = CASE
               WHEN auth_provider = 'local' THEN 'google'
               ELSE auth_provider
             END
         WHERE id = $3`,
        [googleId, avatarUrl, result.rows[0].id],
      );
    }

    const user = result.rows[0];
    const token = createAccessToken(user.id);

    res.json({ user, token }); // send user info to front-end 
  } catch {
    res.status(401).json({ error: "Google sign-in failed" });
  }
});

export default router;
