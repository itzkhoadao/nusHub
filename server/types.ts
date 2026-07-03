import type { Request } from "express";
import type { JwtPayload } from "jsonwebtoken";

export type AuthUser = JwtPayload & {
  id: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
