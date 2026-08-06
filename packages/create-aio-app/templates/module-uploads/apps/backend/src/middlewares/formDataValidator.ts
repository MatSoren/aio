import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { ErrorCode } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";
import type { AuthResponseLocals } from "../types/ResponseLocals";
import type { MulterFiles } from "../types/MulterFiles";

/** Either a fixed schema, or one resolved per-request (e.g. a schema that varies by the
 * authenticated user's role). */
type SchemaResolver<T> =
  | z.ZodType<T>
  | ((req: Request, res: Response<unknown, AuthResponseLocals<T>>) => z.ZodType<T>);

interface FormDataOptions<T> {
  /** Map of multer file field name -> schema property. When a file was uploaded for the field,
   * its stored filename is written to that property; if no file was uploaded, whatever is
   * already in `data` for that key (if anything) is left as-is. */
  fileFields?: Record<string, string>;
  /** Extra fields merged into the payload before validation — e.g. injecting a value from the
   * JWT that the client shouldn't be trusted to send itself. */
  augment?: (req: Request, res: Response<unknown, AuthResponseLocals<T>>) => Record<string, unknown>;
  /** Name of the multipart field carrying the JSON payload. Defaults to `"data"`. */
  dataField?: string;
}

/** Validates a `multipart/form-data` body: JSON in one field (`data` by default) plus files in
 * separate fields, mounted after a `safeUpload`-wrapped multer middleware. Convention: the client
 * always sends `data` as a JSON string alongside any files —
 * `packages/api-client`'s `createMultipartBody` builds requests exactly this way, so the two
 * sides of the wire stay in sync by construction rather than by documentation. */
export const validateFormData =
  <T>(schema: SchemaResolver<T>, options: FormDataOptions<T> = {}) =>
  (req: Request, res: Response<unknown, AuthResponseLocals<T>>, next: NextFunction): void => {
    const { fileFields = {}, augment, dataField = "data" } = options;

    // The JSON payload is optional: a request may carry only uploaded files (e.g. replacing just
    // a profile picture). When `data` is absent, start from `{}` and let the (possibly partial)
    // schema decide what's actually required — enforcing presence here would wrongly reject
    // file-only updates. A present-but-malformed `data` is still a client error.
    const raw = (req.body as Record<string, unknown> | undefined)?.[dataField];
    let parsed: Record<string, unknown> = {};
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw appErrorFactory({
          errorCode: ErrorCode.INVALID_BODY,
          details: { message: `Failed to parse \`${dataField}\` field as JSON` },
        });
      }
    }

    const payload: Record<string, unknown> = { ...parsed, ...(augment ? augment(req, res) : {}) };

    const files = (req.files ?? {}) as MulterFiles;
    for (const [field, prop] of Object.entries(fileFields)) {
      const filename = files[field]?.[0]?.filename;
      if (filename) payload[prop] = filename;
    }

    const resolvedSchema = typeof schema === "function" ? schema(req, res) : schema;
    const result = resolvedSchema.safeParse(payload);
    if (!result.success) {
      throw appErrorFactory({
        errorCode: ErrorCode.INVALID_BODY,
        details: z.flattenError(result.error),
      });
    }

    res.locals.input = result.data;
    next();
  };
