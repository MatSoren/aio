import { ValidationErrorCodes, type ValidationErrorCode } from "@{{scope}}/contracts";
import type { ErrorDefinition } from "../../types/ErrorDefinition";

export const validationErrorDefinitions = {
  [ValidationErrorCodes.BODY_REQUIRED]: { status: 400, message: "Request body is required" },
  [ValidationErrorCodes.INVALID_BODY]: { status: 400, message: "Request body failed validation" },
  [ValidationErrorCodes.INVALID_QUERY_PARAMS]: { status: 400, message: "Query params failed validation" },
  [ValidationErrorCodes.INVALID_PAGINATION_PARAMS]: {
    status: 400,
    message: "Pagination params failed validation",
  },
} as const satisfies Record<ValidationErrorCode, ErrorDefinition>;
