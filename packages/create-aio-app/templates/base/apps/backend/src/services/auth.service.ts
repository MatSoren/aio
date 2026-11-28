import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { appEnv } from "@config/envs";

const SALT_ROUNDS = 10;

// Passwords only. bcrypt is slow on purpose (a leaked hash of a low-entropy, human-chosen secret
// has to be expensive to brute-force), but it only reads the first 72 bytes of its input — fine
// for a password, wrong for a JWT (see `hashRefreshToken` below).
export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

// Refresh tokens: SHA-256, never bcrypt. bcrypt truncates its input to 72 bytes, and the first 72
// bytes of a JWT (header + `{"sub":"<uuid>"...`) are identical for every token issued to the same
// user — so a bcrypt hash of the current refresh token would also match every older, already
// rotated one. A JWT is long and high-entropy, so a fast hash is enough here: there's nothing to
// brute-force, the hash only has to cover the whole token.
export const hashRefreshToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Constant-time comparison of a presented refresh token against the stored SHA-256 hex digest. */
export const refreshTokenMatches = (token: string, storedHash: string): boolean => {
  const presented = Buffer.from(hashRefreshToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  // `timingSafeEqual` throws on a length mismatch — e.g. a row still holding a pre-SHA-256 bcrypt
  // hash, which then just fails to match and forces a re-login.
  return presented.length === stored.length && timingSafeEqual(presented, stored);
};

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, appEnv.auth.accessSecret, { expiresIn: appEnv.auth.accessExpiration });

// `jwtid` makes every refresh token unique even when two are signed in the same second for the
// same user (same `iat`/`exp`): without it, a rotation within that second would hand back the very
// token it was supposed to retire, and the compare-and-swap in the refresh endpoint couldn't tell
// two concurrent refreshes apart.
export const signRefreshToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, appEnv.auth.refreshSecret, { expiresIn: appEnv.auth.refreshExpiration, jwtid: randomUUID() });

/** Throws `jsonwebtoken`'s own `TokenExpiredError`/`JsonWebTokenError` on failure — callers (the
 * auth middleware, the refresh endpoint) translate those into `ErrorCode.TOKEN_EXPIRED` /
 * `INVALID_TOKEN` themselves, since only they know which of the two codes fits their situation. */
export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, appEnv.auth.accessSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, appEnv.auth.refreshSecret) as AccessTokenPayload;

/** Issues a fresh access+refresh pair and returns the SHA-256 hash of the refresh token alongside
 * it — callers persist `refreshTokenHash` on the user row so logout/rotation can revoke it
 * server-side. The raw refresh token is never stored, only its hash: a stolen DB dump can't be
 * replayed to mint new sessions with it. */
export const issueTokens = (
  user: { id: string; email: string },
): { accessToken: string; refreshToken: string; refreshTokenHash: string } => {
  const payload = { sub: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = hashRefreshToken(refreshToken);
  return { accessToken, refreshToken, refreshTokenHash };
};
