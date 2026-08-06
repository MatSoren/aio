export type ApiClientErrorKind = "api" | "network" | "parse";

export interface ApiClientErrorOptions {
  kind: ApiClientErrorKind;
  message: string;
  status?: number | undefined;
  code?: string | undefined;
  details?: unknown;
  cause?: unknown;
}

/** Thrown for every failure mode `performRequest` can hit, tagged with `kind` so a UI can tell
 * them apart without parsing messages: `"network"` — the request never reached a server (offline,
 * DNS, timeout); `"api"` — it did, and the server said no (`success: false`, or a non-2xx status);
 * `"parse"` — a 2xx response that doesn't match the `ApiResponse` envelope at all (wrong base URL,
 * a proxy returning HTML, ...). */
export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly details: unknown;
  override readonly cause: unknown;

  constructor(options: ApiClientErrorOptions) {
    super(options.message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;
  }
}
