import { z } from "zod";
import { appErrorFactory } from "@utils/AppError";
import { ErrorCode, type QuerySchema } from "@{{scope}}/contracts";
import type { NextFunction, Request, Response } from "express";
import type { ResponseLocals } from "../types/ResponseLocals";

/** The `req.query` counterpart of `validateBody` — result goes to `res.locals.queryParams`, kept
 * separate from `res.locals.input` so a single route can combine query filters with a validated
 * body (or with `parsePagination`) without one clobbering the other. */
export const validateQuery =
  (schema: QuerySchema) =>
  (req: Request, res: Response<unknown, ResponseLocals>, next: NextFunction): void => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      throw appErrorFactory({
        errorCode: ErrorCode.INVALID_QUERY_PARAMS,
        details: z.flattenError(result.error),
      });
    }
    res.locals.queryParams = result.data;
    next();
  };
