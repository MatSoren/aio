import type { ErrorCode } from "@{{scope}}/contracts";

export type AppErrorOptions = {
  errorCode: ErrorCode;
  statusCode?: number;
  message?: string;
  details?: unknown;
  isOperational?: boolean;
};
