import type { NextFunction, Request, Response } from "express";
import { readBearerToken, verifyAccessToken } from "../auth/tokens";

export default function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = readBearerToken(req.headers.authorization);

  if (!token) {
    // user is not logged in
    return res.status(401).json({ error: "No token provided. Please log in." });
  }

  try {
    req.user = verifyAccessToken(token);
    next(); // authentication passed, move on to the actual route
  } catch {
    return res
      .status(401)
      .json({ error: "Your session is invalid or expired. Please log in again." });
  }
}
