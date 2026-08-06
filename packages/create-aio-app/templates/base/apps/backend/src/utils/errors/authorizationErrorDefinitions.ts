import { AuthorizationErrorCodes, type AuthorizationErrorCode } from "@{{scope}}/contracts";
import type { ErrorDefinition } from "../../types/ErrorDefinition";

export const authorizationErrorDefinitions = {
  [AuthorizationErrorCodes.FORBIDDEN]: {
    status: 403,
    message: "You don't have permission to perform this action",
  },
} as const satisfies Record<AuthorizationErrorCode, ErrorDefinition>;
