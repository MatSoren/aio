import { z } from "zod";
import { DEFAULT_PAGINATION, ErrorCode, PaginationQuerySchema } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";
import type { NextFunction, Request, Response } from "express";
import type { ResponseLocals } from "../types/ResponseLocals";

export const parsePagination = (
  req: Request,
  res: Response<unknown, ResponseLocals>,
  next: NextFunction,
): void => {
  const result = PaginationQuerySchema.safeParse(req.query);
  if (!result.success) {
    throw appErrorFactory({
      errorCode: ErrorCode.INVALID_PAGINATION_PARAMS,
      details: z.flattenError(result.error),
    });
  }
  res.locals.page = {
    skip: result.data.skip ?? DEFAULT_PAGINATION.skip,
    take: result.data.take ?? DEFAULT_PAGINATION.take,
  };
  next();
};
