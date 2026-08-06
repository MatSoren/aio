import { z } from "zod";

export type QuerySchema = z.ZodObject<Record<string, z.ZodTypeAny>>;

/** Coerces a query-string boolean (`"true"`/`"false"` as sent over HTTP, or an already-boolean
 * value for callers building the query object in code) into a real `boolean`. */
export const createQueryBooleanSchema = (fieldName: string) =>
  z.union([z.boolean(), z.string()]).transform((value, ctx) => {
    if (typeof value === "boolean") return value;

    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;

    ctx.addIssue({ code: "custom", message: `${fieldName} must be true or false` });
    return z.NEVER;
  });

export const DEFAULT_PAGINATION = {
  skip: 0,
  take: 10,
} as const;

const MAX_TAKE = 100;

export const PaginationQuerySchema = z.object({
  skip: z.coerce
    .number({ message: "skip must be a number" })
    .int({ message: "skip must be an integer" })
    .min(0, { message: "skip must be greater than or equal to 0" })
    .optional(),
  take: z.coerce
    .number({ message: "take must be a number" })
    .int({ message: "take must be an integer" })
    .min(1, { message: "take must be greater than or equal to 1" })
    .max(MAX_TAKE, { message: `take must be less than or equal to ${MAX_TAKE}` })
    .optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
