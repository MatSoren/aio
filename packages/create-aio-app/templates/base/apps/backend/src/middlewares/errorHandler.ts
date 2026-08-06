import { appEnv } from "@config/envs";
import { ErrorCode, type ApiResponse } from "@{{scope}}/contracts";
import { AppError, appErrorFactory } from "@utils/AppError";
import { isPrismaError } from "@utils/isPrismaError";
import { mapPrismaErrorToAppError } from "@utils/mapPrismaCodes";
import type { Request, Response, NextFunction } from "express";

type ErrorWithStatusCode = Error & {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: { statusCode?: number | string };
};

// Duck-types the status off errors that don't extend our AppError — covers the property names
// used by common third-party libraries (Boom, http-errors, multer's MulterError, ...).
const getStatusCode = (error: Error): number => {
  const err = error as ErrorWithStatusCode;
  const raw = err.statusCode ?? err.status ?? err.status_code ?? err.output?.statusCode;
  const status = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isInteger(status) ? status : 500;
};

/** Last middleware mounted (see app.ts). Serializes ANY thrown error — ours or a library's — into
 * the `ApiResponse` envelope, so a client never sees Express's default HTML error page. */
export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response<ApiResponse<null>>,
  _next: NextFunction,
): void => {
  let err: AppError;

  if (error instanceof AppError) {
    err = error;
  } else if (isPrismaError(error)) {
    console.error("Prisma error:", error);
    err = mapPrismaErrorToAppError(error);
  } else {
    console.error("Unhandled error:", error);
    err = appErrorFactory({
      statusCode: getStatusCode(error),
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      isOperational: false,
    });
  }

  res.status(err.statusCode);

  const response: ApiResponse<null> = {
    success: false,
    error: { message: err.message, code: err.errorCode, details: err.details },
    // Stack traces only in development — never leak internals to a client in production.
    ...(appEnv.app.nodeEnv === "development" && err.stack ? { stack: err.stack } : {}),
  };

  res.json(response);
};
