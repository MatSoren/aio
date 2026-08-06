import { z } from "zod";
import { appErrorFactory } from "@utils/AppError";
import { ErrorCode } from "@{{scope}}/contracts";
import type { NextFunction, Request, Response } from "express";
import type { ResponseLocals } from "../types/ResponseLocals";

/** Validates `req.body` against `schema` and writes the parsed result to `res.locals.input`.
 * Controllers read from there, never from raw `req.body` — so validation can't be forgotten or
 * silently re-done downstream with different rules. */
export const validateBody =
  <T>(schema: z.ZodType<T>, isRequired = true) =>
  (req: Request, res: Response<unknown, ResponseLocals<T>>, next: NextFunction): void => {
    if (!req.body) {
      if (isRequired) {
        throw appErrorFactory({ errorCode: ErrorCode.BODY_REQUIRED });
      }
      res.locals.input = {} as T;
      next();
      return;
    }

    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw appErrorFactory({
        errorCode: ErrorCode.INVALID_BODY,
        details: z.flattenError(result.error),
      });
    }
    res.locals.input = result.data;
    next();
  };
