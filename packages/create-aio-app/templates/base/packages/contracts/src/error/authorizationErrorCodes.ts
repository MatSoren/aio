export const AuthorizationErrorCodes = {
  FORBIDDEN: "FORBIDDEN",
} as const;

export type AuthorizationErrorCode = (typeof AuthorizationErrorCodes)[keyof typeof AuthorizationErrorCodes];
