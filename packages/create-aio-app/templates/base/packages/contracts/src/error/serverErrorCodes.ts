export const ServerErrorCodes = {
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ServerErrorCode = (typeof ServerErrorCodes)[keyof typeof ServerErrorCodes];
