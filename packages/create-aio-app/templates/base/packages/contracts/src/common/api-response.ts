import type { ErrorCode } from "../error";

export interface ApiError {
  message: string;
  code: ErrorCode;
  details?: unknown;
}

/** The envelope every backend response uses. A discriminated union on `success` — unlike
 * `{ success: boolean; data?: T; error?: ApiError }`, this makes `error` unreachable when
 * `success` is `true` and vice versa, both for the backend writing it and for any client
 * narrowing on `success` before reading `data`/`error`. */
export type ApiResponse<T = null> =
  | { success: true; data: T }
  | { success: false; error: ApiError; stack?: string };

export interface PaginationMeta {
  skip: number;
  take: number;
  total: number;
  hasMore: boolean;
}

/** `page` is a sibling of `data`, not nested inside it — list endpoints extend the plain
 * envelope rather than replacing it. */
export type PaginatedApiResponse<T> =
  | { success: true; data: T[]; page: PaginationMeta }
  | { success: false; error: ApiError; stack?: string };
