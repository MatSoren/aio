import type { NextFunction, Request, Response } from "express";
import { ErrorCode } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";
import { prisma } from "@config/database";
import { verifyAccessToken } from "@services/auth.service";
import type { AuthResponseLocals } from "../types/ResponseLocals";

/** Reads the access token from `Authorization: Bearer <token>`, verifies it, and loads the user
 * into `res.locals.user`. One DB hit per authenticated request — trades a bit of latency for
 * always reflecting the current state of the user (e.g. a ban takes effect immediately instead
 * of waiting out the access token's lifetime). */
export const jwtAuth = async (
  req: Request,
  res: Response<unknown, AuthResponseLocals>,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw appErrorFactory({ errorCode: ErrorCode.MISSING_AUTHORIZATION });
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw appErrorFactory({ errorCode: ErrorCode.MISSING_AUTHORIZATION });
  }

  let payload: { sub: string };
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    const isExpired = error instanceof Error && error.name === "TokenExpiredError";
    throw appErrorFactory({ errorCode: isExpired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.INVALID_TOKEN });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw appErrorFactory({ errorCode: ErrorCode.USER_NOT_FOUND, statusCode: 401 });
  }

  res.locals.user = user;
  next();
};
