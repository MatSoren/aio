import { AuthErrorCodes } from "./authErrorCodes";
import { AuthorizationErrorCodes } from "./authorizationErrorCodes";
import { ValidationErrorCodes } from "./validationErrorCodes";
import { ResourceErrorCodes } from "./resourceErrorCodes";
import { ServerErrorCodes } from "./serverErrorCodes";
// @aio:error-import

export * from "./authErrorCodes";
export * from "./authorizationErrorCodes";
export * from "./validationErrorCodes";
export * from "./resourceErrorCodes";
export * from "./serverErrorCodes";
// @aio:error-export

/** Merge of every error-code category. Declaration merging (a `const` object and a type sharing
 * the same name) makes `ErrorCode` usable both as a value (`ErrorCode.ENTITY_NOT_FOUND`) and as a
 * type (`errorCode: ErrorCode`) — contracts stays the single source of truth for the whole set. */
export const ErrorCode = {
  ...AuthErrorCodes,
  ...AuthorizationErrorCodes,
  ...ValidationErrorCodes,
  ...ResourceErrorCodes,
  ...ServerErrorCodes,
  // @aio:error-merge
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
