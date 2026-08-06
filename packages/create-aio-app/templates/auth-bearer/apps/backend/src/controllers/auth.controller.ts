import { prisma } from "@config/database";
import { appErrorFactory } from "@utils/AppError";
import { hashSecret, verifySecret, issueTokens, verifyRefreshToken } from "@services/auth.service";
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
  if (!user || !(await verifySecret(password, user.password))) {
    throw appErrorFactory({ errorCode: ErrorCode.INVALID_CREDENTIALS });
  }

  const { accessToken, refreshToken, refreshTokenHash } = await issueTokens(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });

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

  const passwordHash = await hashSecret(password);
  const user = await prisma.user.create({ data: { email, password: passwordHash } });

  const { accessToken, refreshToken, refreshTokenHash } = await issueTokens(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } });

  res.status(201).json({
    success: true,
    data: {
      user: { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt },
      accessToken,
      refreshToken,
    },
  });
};

const refresh: Endpoint<RefreshResponse, RefreshBody> = async (_req, res) => {
  const { refreshToken } = res.locals.input;

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
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
  // this one is stolen and being replayed. Either way, don't distinguish — same code either way.
  const isValid = await verifySecret(refreshToken, user.refreshTokenHash);
  if (!isValid) {
    throw appErrorFactory({ errorCode: ErrorCode.INVALID_REFRESH_TOKEN });
  }

  const tokens = await issueTokens(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: tokens.refreshTokenHash } });

  res.json({ success: true, data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
};

const logout: AuthEndpoint = async (_req, res) => {
  await prisma.user.update({ where: { id: res.locals.user.id }, data: { refreshTokenHash: null } });
  res.json({ success: true, data: null });
};

export default { login, register, refresh, logout };
