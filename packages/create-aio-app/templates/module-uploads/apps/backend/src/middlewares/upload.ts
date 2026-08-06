import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ErrorCode } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";
import { appEnv } from "@config/envs";

const UPLOADS_DIR = path.resolve(appEnv.uploads.dir);

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

export const uploadsDir = UPLOADS_DIR;

/** Wraps a multer middleware so any parsing failure (malformed/empty multipart body, missing
 * boundary, an unexpected or oversized file, ...) surfaces as a 400 `INVALID_BODY` instead of an
 * unhandled 500 — every error multer raises while parsing a request is, by definition, a bad
 * request, never a server fault. */
export const safeUpload =
  (upload: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err) {
        next(
          appErrorFactory({
            errorCode: ErrorCode.INVALID_BODY,
            details: { message: (err as Error).message },
          }),
        );
        return;
      }
      next();
    });
  };

/** Example single-field upload — add more `multer({ storage }).fields([...])` exports here per
 * resource, following this pattern (see docs/architecture.md § Uploads). */
export const singleFileUpload = (fieldName: string): RequestHandler =>
  safeUpload(multer({ storage }).single(fieldName));
