import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import {
  createAccessToken,
  getOptionalAuthenticatedUser,
  readBearerToken,
  verifyAccessToken,
} from "./tokens";

test("creates a verifiable access token with bounded session claims", () => {
  const token = createAccessToken("user-123");
  const user = verifyAccessToken(token);

  assert.equal(user.id, "user-123");
  assert.equal(user.sub, "user-123");
  assert.equal(user.iss, env.JWT_ISSUER);
  assert.ok(Array.isArray(user.aud) || user.aud === env.JWT_AUDIENCE);
  assert.equal(user.token_type, "access");
  assert.equal(typeof user.iat, "number");
  assert.equal(typeof user.exp, "number");
  assert.ok((user.exp ?? 0) > (user.iat ?? 0));
});

test("rejects a token with the wrong audience", () => {
  const token = jwt.sign(
    { id: "user-123", token_type: "access" },
    env.JWT_SECRET,
    {
      audience: "another-application",
      expiresIn: "1h",
      issuer: env.JWT_ISSUER,
      subject: "user-123",
    },
  );

  assert.throws(() => verifyAccessToken(token));
});

test("rejects a modified token", () => {
  const token = createAccessToken("user-123");
  const finalCharacter = token.endsWith("a") ? "b" : "a";
  const modifiedToken = `${token.slice(0, -1)}${finalCharacter}`;

  assert.throws(() => verifyAccessToken(modifiedToken));
});

test("parses only a well-formed Bearer authorization header", () => {
  assert.equal(readBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(readBearerToken("bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(readBearerToken("Basic abc.def.ghi"), null);
  assert.equal(readBearerToken("Bearer"), null);
  assert.equal(readBearerToken(undefined), null);
});

test("optional authentication returns null for invalid credentials", () => {
  assert.equal(getOptionalAuthenticatedUser(undefined), null);
  assert.equal(getOptionalAuthenticatedUser("Bearer invalid"), null);
});
