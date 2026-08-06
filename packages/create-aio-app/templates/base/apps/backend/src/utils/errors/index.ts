import type { ErrorCode } from "@{{scope}}/contracts";
import type { ErrorDefinition } from "../../types/ErrorDefinition";
import { authErrorDefinitions } from "./authErrorDefinitions";
import { authorizationErrorDefinitions } from "./authorizationErrorDefinitions";
import { validationErrorDefinitions } from "./validationErrorDefinitions";
import { resourceErrorDefinitions } from "./resourceErrorDefinitions";
import { serverErrorDefinitions } from "./serverErrorDefinitions";
// @aio:error-def-import

// `satisfies Record<ErrorCode, ErrorDefinition>` is the actual enforcement: every code exported
// from `packages/contracts/src/error` must have a `{status, message}` entry here, or this fails
// to compile. Forgetting either half of a new error code breaks the build, not a code review.
export const errorDefinitions = {
  ...authErrorDefinitions,
  ...authorizationErrorDefinitions,
  ...validationErrorDefinitions,
  ...resourceErrorDefinitions,
  ...serverErrorDefinitions,
  // @aio:error-def-merge
} as const satisfies Record<ErrorCode, ErrorDefinition>;
