/** Typed alias for the files object produced by multer's `.fields()` middleware. */
export type MulterFiles = Record<string, Express.Multer.File[] | undefined>;
