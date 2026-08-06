import type { ErrorCode } from "@{{scope}}/contracts";
import { errorDefinitions } from "./errors";
import type { AppErrorOptions } from "../types/AppErrorOptions";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: ErrorCode,
    message: string,
    public details?: unknown,
    public isOperational = true,
  ) {
    super(message);
    this.name = "AppError";
    // Needed after `extends Error` on down-level targets, or `instanceof AppError` can come back
    // false for errors caught a few frames up the call stack.
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace?.(this, AppError);
  }
}

// Wraps the constructor so call sites never write `new AppError(...)` directly — this is the one
// place that resolves `status`/`message` from `errorDefinitions`, and the one place future
// cross-cutting concerns (logging, error tracking) would hook in.
export const appErrorFactory = (options: AppErrorOptions): AppError => {
  const definition = errorDefinitions[options.errorCode];
  return new AppError(
    options.statusCode ?? definition.status,
    options.errorCode,
    options.message ?? definition.message,
    options.details,
    options.isOperational ?? true,
  );
};
