import { prisma } from "@config/database";
import { appErrorFactory } from "@utils/AppError";
import { hashPassword, verifyPassword, issueTokens, verifyRefreshToken, refreshTokenMatches } from "@services/auth.service";
import { setAuthCookies, clearAuthCookies } from "@utils/authCookies";
import {
  ErrorCode,
  type LoginBody,
  type LoginResponse,
  type RegisterBody,
  type RegisterResponse,
  type RefreshBody,
  type RefreshResponse,
} from "@{{scope}}/contracts";
import type { AuthEndpoint, Endpoint } from "../types/ControllerEndpoint";

const login: Endpoint<LoginResponse, LoginBody> = async (_req, res) => {
  const { email, password } = res.locals.input;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, createdAt: true, updatedAt: true },
  });
  // Same error for "no such user" and "wrong password" — either one telling the client which
  // case it hit would let them enumerate registered emails.
  if (!user || !(await verifyPassword(password, user.password))) {
    throw appErrorFactory({ errorCode: ErrorCode.INVALID_CREDENTIALS });
  }

  const { accessToken, refreshToken, refreshTokenHash } = issueTokens(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });
  // Set cookies for browser clients AND return the tokens in the body for bearer clients
  // (mobile, scripts) — the same login works for both without either side branching on which
  // kind of client made the request.
  setAuthCookies(res, { accessToken, refreshToken });

  res.json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt },
      accessToken,
      refreshToken,
    },
  });
};

const register: Endpoint<RegisterResponse, RegisterBody> = async (_req, res) => {
  const { email, password } = res.locals.input;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw appErrorFactory({ errorCode: ErrorCode.EMAIL_ALREADY_EXISTS });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, password: passwordHash } });

  const { accessToken, refreshToken, refreshTokenHash } = issueTokens(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });
  setAuthCookies(res, { accessToken, refreshToken });

  res.status(201).json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt },
      accessToken,
      refreshToken,
    },
  });
};

const refresh: Endpoint<RefreshResponse, RefreshBody> = async (req, res) => {
  // Bearer client: token is in the validated body. Cookie client: body is empty, fall back to
  // the cookie.
  const token = res.locals.input.refreshToken ?? (req.cookies?.refreshToken as string | undefined);
  if (!token) {
    throw appErrorFactory({ errorCode: ErrorCode.TOKEN_NOT_PROVIDED });
  }

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw appErrorFactory({ errorCode: ErrorCode.INVALID_REFRESH_TOKEN });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, refreshTokenHash: true },
  });
  if (!user?.refreshTokenHash) {
    throw appErrorFactory({ errorCode: ErrorCode.REFRESH_TOKEN_NOT_FOUND });
  }

  // Doesn't match the last-issued token: either it was already rotated by a previous refresh, or
  // this one is stolen and being replayed. Same code either way, don't distinguish.
  const isValid = refreshTokenMatches(token, user.refreshTokenHash);
  if (!isValid) {
    throw appErrorFactory({ errorCode: ErrorCode.INVALID_REFRESH_TOKEN });
  }

  const tokens = issueTokens(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: tokens.refreshTokenHash } });
  setAuthCookies(res, tokens);

  res.json({ success: true, data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
};

const logout: AuthEndpoint = async (_req, res) => {
  await prisma.user.update({ where: { id: res.locals.user.id }, data: { refreshTokenHash: null } });
  clearAuthCookies(res);
  res.json({ success: true, data: null });
};

export default { login, register, refresh, logout };
