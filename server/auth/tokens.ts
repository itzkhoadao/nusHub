import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthUser } from "../types";

const ACCESS_TOKEN_TYPE = "access";

type AccessTokenPayload = AuthUser & {
  token_type: typeof ACCESS_TOKEN_TYPE;
};

export function createAccessToken(userId: string) {
  const options: SignOptions = {
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    subject: userId,
  };

  return jwt.sign(
    {
      id: userId,
      token_type: ACCESS_TOKEN_TYPE,
    },
    env.JWT_SECRET,
    options,
  ); // returns signed token string
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    audience: env.JWT_AUDIENCE,
    issuer: env.JWT_ISSUER,
  });

  if (
    typeof decoded === "string" ||
    decoded.token_type !== ACCESS_TOKEN_TYPE ||
    typeof decoded.id !== "string" ||
    decoded.id.length === 0 ||
    decoded.sub !== decoded.id
  ) {
    throw new Error("Invalid access token");
  }

  return decoded as AccessTokenPayload;
}

export function readBearerToken(authorization: string | undefined) {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export function getOptionalAuthenticatedUser(
  authorization: string | undefined,
) {
  const token = readBearerToken(authorization);

  if (!token) {
    return null;
  }

  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}
