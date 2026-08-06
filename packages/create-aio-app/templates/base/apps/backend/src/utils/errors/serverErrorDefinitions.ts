import { ServerErrorCodes, type ServerErrorCode } from "@{{scope}}/contracts";
import type { ErrorDefinition } from "../../types/ErrorDefinition";

export const serverErrorDefinitions = {
  [ServerErrorCodes.INTERNAL_SERVER_ERROR]: { status: 500, message: "Internal server error" },
  [ServerErrorCodes.SERVICE_UNAVAILABLE]: { status: 503, message: "Service temporarily unavailable" },
} as const satisfies Record<ServerErrorCode, ErrorDefinition>;
