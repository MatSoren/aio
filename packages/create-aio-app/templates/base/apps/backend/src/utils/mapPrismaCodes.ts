import { Prisma } from "@generated/prisma/client";
import { AppError, appErrorFactory } from "./AppError";
import { ErrorCode } from "@{{scope}}/contracts";

type PrismaErrorMeta = Record<string, unknown> | undefined;

const fieldLabel = (meta: PrismaErrorMeta): string => {
  const modelName = meta?.modelName;
  return typeof modelName === "string" ? `${modelName} ` : "";
};

// Prisma's driver-adapter errors nest the failed constraint's field list a few levels deep and
// the exact shape isn't guaranteed across drivers — walk it defensively instead of assuming it,
// so a shape mismatch degrades to a generic message instead of throwing *inside* the error handler.
const constraintFields = (meta: PrismaErrorMeta): string => {
  const cause = (meta?.driverAdapterError as { cause?: unknown } | undefined)?.cause;
  const fields = (cause as { constraint?: { fields?: unknown } } | undefined)?.constraint?.fields;
  return Array.isArray(fields) ? fields.join(", ") : "field";
};

const valueTooLong = (meta: PrismaErrorMeta) =>
  appErrorFactory({
    statusCode: 400,
    errorCode: ErrorCode.INVALID_BODY,
    message: `${fieldLabel(meta)}value too long`,
  });
const resourceNotFound = (meta: PrismaErrorMeta) =>
  appErrorFactory({
    statusCode: 404,
    errorCode: ErrorCode.ENTITY_NOT_FOUND,
    message: `${fieldLabel(meta)}not found`,
  });
const duplicateValue = (meta: PrismaErrorMeta) =>
  appErrorFactory({
    statusCode: 409,
    errorCode: ErrorCode.ENTITY_DUPLICATED,
    message: `${constraintFields(meta)} already exists`,
  });
const relationConstraintFailed = (meta: PrismaErrorMeta) =>
  appErrorFactory({
    statusCode: 409,
    errorCode: ErrorCode.ENTITY_DUPLICATED,
    message: `${fieldLabel(meta)}relation constraint failed`,
  });
const invalidInputData = (meta: PrismaErrorMeta) =>
  appErrorFactory({
    statusCode: 400,
    errorCode: ErrorCode.INVALID_BODY,
    message: `${fieldLabel(meta)}invalid input data`,
  });
const databaseTimeout = () =>
  appErrorFactory({ statusCode: 503, errorCode: ErrorCode.SERVICE_UNAVAILABLE, message: "Database timeout" });
const databaseError = () =>
  appErrorFactory({ statusCode: 500, errorCode: ErrorCode.INTERNAL_SERVER_ERROR, message: "Database error" });

// Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference
const prismaErrorMap: Record<string, (meta: PrismaErrorMeta) => AppError> = {
  P2000: valueTooLong,
  P2001: resourceNotFound,
  P2015: resourceNotFound,
  P2018: resourceNotFound,
  P2025: resourceNotFound,
  P2002: duplicateValue,
  P2003: relationConstraintFailed,
  P2014: relationConstraintFailed,
  P2011: invalidInputData,
  P2012: invalidInputData,
  P2013: invalidInputData,
  P2019: invalidInputData,
  P2020: invalidInputData,
  P2023: invalidInputData,
  P2024: databaseTimeout,
};

export const mapPrismaErrorToAppError = (error: unknown): AppError => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const handler = prismaErrorMap[error.code];
    return handler ? handler(error.meta) : databaseError();
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return appErrorFactory({ statusCode: 400, errorCode: ErrorCode.INVALID_BODY, message: "Validation error" });
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return appErrorFactory({
      statusCode: 503,
      errorCode: ErrorCode.SERVICE_UNAVAILABLE,
      message: "Database initialization error",
    });
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return appErrorFactory({
      statusCode: 500,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: "Database engine crashed",
    });
  }
  return databaseError();
};
