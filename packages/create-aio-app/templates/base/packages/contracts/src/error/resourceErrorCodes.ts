export const ResourceErrorCodes = {
  ENTITY_NOT_FOUND: "ENTITY_NOT_FOUND",
  ENTITY_DUPLICATED: "ENTITY_DUPLICATED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  // Uploads module is on by default; kept here rather than behind a wiring insert since there is
  // no flag to opt out of it.
  MEDIA_NOT_FOUND: "MEDIA_NOT_FOUND",
} as const;

export type ResourceErrorCode = (typeof ResourceErrorCodes)[keyof typeof ResourceErrorCodes];
