import type { Request, Response } from "express";
import { ErrorCode } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";

/** Mounted after every route, right before errorHandler. Reaching this means nothing matched —
 * thrown synchronously (not `next(err)`) so it goes through the exact same error path as
 * everything else, and shows up in the ApiResponse envelope instead of Express's default HTML 404. */
export const notFoundHandler = (req: Request, _res: Response): void => {
  throw appErrorFactory({
    errorCode: ErrorCode.ENTITY_NOT_FOUND,
    statusCode: 404,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
};
