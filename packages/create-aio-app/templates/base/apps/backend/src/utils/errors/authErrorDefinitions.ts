import { AuthErrorCodes, type AuthErrorCode } from "@{{scope}}/contracts";
import type { ErrorDefinition } from "../../types/ErrorDefinition";

export const authErrorDefinitions = {
  [AuthErrorCodes.INVALID_CREDENTIALS]: { status: 401, message: "Invalid credentials" },
  [AuthErrorCodes.MISSING_AUTHORIZATION]: {
    status: 401,
    message: "Missing or malformed Authorization header",
  },
  [AuthErrorCodes.INVALID_TOKEN]: { status: 401, message: "Invalid authentication token" },
  [AuthErrorCodes.TOKEN_EXPIRED]: { status: 401, message: "Authentication token has expired" },
  [AuthErrorCodes.TOKEN_NOT_PROVIDED]: { status: 401, message: "Authentication token not provided" },
  [AuthErrorCodes.INVALID_REFRESH_TOKEN]: { status: 401, message: "Invalid or revoked refresh token" },
  [AuthErrorCodes.REFRESH_TOKEN_NOT_FOUND]: { status: 404, message: "Refresh token not found" },
} as const satisfies Record<AuthErrorCode, ErrorDefinition>;
