import { ResourceErrorCodes, type ResourceErrorCode } from "@{{scope}}/contracts";
import type { ErrorDefinition } from "../../types/ErrorDefinition";

export const resourceErrorDefinitions = {
  [ResourceErrorCodes.ENTITY_NOT_FOUND]: { status: 404, message: "Not found" },
  [ResourceErrorCodes.ENTITY_DUPLICATED]: { status: 409, message: "Already exists" },
  [ResourceErrorCodes.USER_NOT_FOUND]: { status: 404, message: "User not found" },
  [ResourceErrorCodes.EMAIL_ALREADY_EXISTS]: { status: 409, message: "Email already registered" },
  [ResourceErrorCodes.MEDIA_NOT_FOUND]: { status: 404, message: "Media not found" },
} as const satisfies Record<ResourceErrorCode, ErrorDefinition>;
