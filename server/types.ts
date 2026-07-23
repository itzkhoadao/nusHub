import type { Request } from "express";
import type { JwtPayload } from "jsonwebtoken";

// meaning: AuthUser is a JWT payload, plus it must also have an id field
export type AuthUser = JwtPayload & {
  id: string;
  token_type: "access";
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
