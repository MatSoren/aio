import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { appEnv } from "@config/envs";

const SALT_ROUNDS = 10;

// Generic bcrypt wrappers — used for both the login password and (in `issueTokens` below) the
// refresh token, since both are "a secret we only ever need to compare against its hash," never
// to recover.
export const hashSecret = (secret: string): Promise<string> => bcrypt.hash(secret, SALT_ROUNDS);

export const verifySecret = (secret: string, hash: string): Promise<boolean> => bcrypt.compare(secret, hash);

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, appEnv.auth.accessSecret, { expiresIn: appEnv.auth.accessExpiration });

export const signRefreshToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, appEnv.auth.refreshSecret, { expiresIn: appEnv.auth.refreshExpiration });

/** Throws `jsonwebtoken`'s own `TokenExpiredError`/`JsonWebTokenError` on failure — callers (the
 * auth middleware, the refresh endpoint) translate those into `ErrorCode.TOKEN_EXPIRED` /
 * `INVALID_TOKEN` themselves, since only they know which of the two codes fits their situation. */
export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, appEnv.auth.accessSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, appEnv.auth.refreshSecret) as AccessTokenPayload;

/** Issues a fresh access+refresh pair and returns a bcrypt hash of the refresh token alongside
 * it — callers persist `refreshTokenHash` on the user row so logout/rotation can revoke it
 * server-side. The raw refresh token is never stored, only its hash: a stolen DB dump can't be
 * replayed to mint new sessions with it. */
export const issueTokens = async (
  user: { id: string; email: string },
): Promise<{ accessToken: string; refreshToken: string; refreshTokenHash: string }> => {
  const payload = { sub: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = await hashSecret(refreshToken);
  return { accessToken, refreshToken, refreshTokenHash };
};
