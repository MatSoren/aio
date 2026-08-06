import path from "node:path";
import fs from "node:fs";
import type { Request, Response } from "express";
import { ErrorCode } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";
import { uploadsDir } from "@middlewares/upload";

/** Serves an uploaded file by its stored filename. Mounted publicly by default (see
 * routes/index.routes.ts) — move it behind auth there if your files shouldn't be public.
 * `path.basename` strips any `../` a client could smuggle into `:filename` before it ever
 * touches the filesystem, so this is safe to keep public even though it takes a path segment
 * straight from the request. */
export const serveMedia = (req: Request<{ filename: string }>, res: Response): void => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    throw appErrorFactory({ errorCode: ErrorCode.MEDIA_NOT_FOUND });
  }

  res.sendFile(filePath);
};
