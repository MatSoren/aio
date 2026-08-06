export const ValidationErrorCodes = {
  BODY_REQUIRED: "BODY_REQUIRED",
  INVALID_BODY: "INVALID_BODY",
  INVALID_QUERY_PARAMS: "INVALID_QUERY_PARAMS",
  INVALID_PAGINATION_PARAMS: "INVALID_PAGINATION_PARAMS",
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCodes)[keyof typeof ValidationErrorCodes];
