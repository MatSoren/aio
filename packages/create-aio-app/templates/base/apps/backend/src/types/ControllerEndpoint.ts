import type { Request, Response } from "express";
import type { ApiResponse } from "@{{scope}}/contracts";
import type { AuthResponseLocals, ResponseLocals } from "./ResponseLocals";

/** The controller contract: two generics, `TResponse` types `res.json()`, `TInput` types
 * `res.locals.input`. No `next` in the signature — controllers throw, they don't call `next(err)`
 * (see errorHandler.ts for why that's safe under Express 5). */
export type Endpoint<TResponse = null, TInput = null> = (
  req: Request,
  res: Response<ApiResponse<TResponse>, ResponseLocals<TInput>>,
) => void | Promise<void>;

export type AuthEndpoint<TResponse = null, TInput = null> = (
  req: Request,
  res: Response<ApiResponse<TResponse>, AuthResponseLocals<TInput>>,
) => void | Promise<void>;
