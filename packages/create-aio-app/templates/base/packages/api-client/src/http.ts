import type { ApiResponse, PaginationMeta } from "@{{scope}}/contracts";
import { ApiClientError } from "./errors";

// Every piece of runtime the client needs (fetch, FormData, a way to turn a picked file into a
// multipart part) is an injected structural interface, not a direct import — the same client
// runs in a browser, in React Native/Expo, or in Node (tests, scripts) without a single `if
// (Platform.OS === ...)` inside it. Each environment supplies its own `fetch`/`FormData` (or lets
// the global ones be picked up) and its own file reader.

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json: () => Promise<unknown>;
}

export interface FormDataLike {
  append: (name: string, value: unknown, filename?: string) => void;
}

export interface FetchRequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormDataLike | undefined;
  /** Only relevant for cookie-based auth: `"include"` sends cookies on cross-origin requests too
   * (the default, same-origin-only, silently drops them). Ignored otherwise. */
  credentials?: "include" | "same-origin" | "omit";
}

export type FetchLike = (input: string, init?: FetchRequestInitLike) => Promise<FetchResponseLike>;

export interface MultipartFileInput {
  uri: string;
  name: string;
  type: string;
  /** Pre-built value to append as-is (e.g. a browser `File`/`Blob`) — when present, skips
   * `MultipartFileReader` entirely. */
  value?: unknown;
}

export interface MultipartFileReader {
  readAsFormDataValue: (file: MultipartFileInput) => Promise<unknown>;
}

export interface ApiClientConfig {
  baseUrl: string;
  fetch?: FetchLike;
  multipartFileReader?: MultipartFileReader;
  defaultHeaders?: Record<string, string>;
  /** Passed through to every request's `credentials`. Cookie-auth clients need `"include"` for
   * cross-origin requests (see FetchRequestInitLike). */
  credentials?: "include" | "same-origin" | "omit";
}

export interface ApiRequestOptions<TRequest> {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: TRequest | undefined;
  accessToken?: string | undefined;
  bodyType?: "json" | "multipart";
}

export const joinUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
};

const getGlobalFetch = (): FetchLike => {
  if (typeof fetch === "function") return fetch as unknown as FetchLike;
  throw new Error("No fetch implementation available — pass `fetch` in ApiClientConfig.");
};

const getGlobalFormData = (): { new (): FormDataLike } => {
  if (typeof FormData === "function") return FormData as unknown as { new (): FormDataLike };
  throw new Error("No FormData implementation available on this runtime.");
};

/** Builds a `multipart/form-data` body matching the backend's `validateFormData` convention: the
 * JSON payload goes in a single `data` field (as a string), and each file goes in its own field.
 * The two sides of the wire stay in sync by construction rather than by documentation. */
export const createMultipartBody = async (
  data: Record<string, unknown>,
  files: Record<string, MultipartFileInput | undefined>,
  fileReader?: MultipartFileReader,
): Promise<FormDataLike> => {
  const FormDataCtor = getGlobalFormData();
  const formData = new FormDataCtor();

  formData.append("data", JSON.stringify(data));

  for (const [field, file] of Object.entries(files)) {
    if (!file) continue;
    const value =
      file.value !== undefined
        ? file.value
        : fileReader
          ? await fileReader.readAsFormDataValue(file)
          : file;
    formData.append(field, value, file.name);
  }

  return formData;
};

const STALE_CONNECTION_RETRY_DELAY_MS = 300;

/**
 * Mobile clients pool/reuse connections that can go dead while the app sits idle between requests
 * (OS-level socket teardown, carrier NAT idle kills, proxy keep-alive mismatches). The failure
 * surfaces as an immediate transport-level error on the very first write, before any request
 * bytes reach the server — so a single retry on a fresh connection is safe to do unconditionally
 * here rather than per-endpoint. Harmless on platforms that don't have this problem: it only ever
 * fires when the first attempt actually threw.
 */
const fetchWithStaleConnectionRetry = async (
  fetcher: FetchLike,
  url: string,
  init: FetchRequestInitLike,
): Promise<FetchResponseLike> => {
  try {
    return await fetcher(url, init);
  } catch {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, STALE_CONNECTION_RETRY_DELAY_MS);
    });
    return fetcher(url, init);
  }
};

const isApiResponseShaped = (payload: unknown): payload is { success: boolean } =>
  typeof payload === "object" && payload !== null && typeof (payload as { success?: unknown }).success === "boolean";

const parseApiResponse = <TResponse>(payload: unknown, status: number): ApiResponse<TResponse> => {
  if (!isApiResponseShaped(payload)) {
    throw new ApiClientError({
      kind: "parse",
      status,
      message: "Response did not match the expected ApiResponse envelope.",
    });
  }
  return payload as ApiResponse<TResponse>;
};

interface RequestResult<TResponse> {
  data: TResponse;
  page: PaginationMeta | undefined;
}

const performRequest = async <TResponse, TRequest>(
  fetcher: FetchLike,
  config: ApiClientConfig,
  options: ApiRequestOptions<TRequest>,
): Promise<RequestResult<TResponse>> => {
  const url = joinUrl(config.baseUrl, options.path);
  const isMultipart = options.bodyType === "multipart";

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...config.defaultHeaders,
    ...(isMultipart ? {} : options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
  };

  const body = isMultipart
    ? (options.body as FormDataLike | undefined)
    : options.body !== undefined
      ? JSON.stringify(options.body)
      : undefined;

  let response: FetchResponseLike;
  try {
    response = await fetchWithStaleConnectionRetry(fetcher, url, {
      method: options.method,
      headers,
      body,
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  } catch (cause) {
    throw new ApiClientError({ kind: "network", message: "Network request failed.", cause });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiClientError({
      kind: "parse",
      status: response.status,
      message: "Response body was not valid JSON.",
      cause,
    });
  }

  const apiResponse = parseApiResponse<TResponse>(payload, response.status);

  if (!response.ok || !apiResponse.success) {
    const errorPayload = apiResponse.success ? undefined : apiResponse.error;
    throw new ApiClientError({
      kind: "api",
      status: response.status,
      message: errorPayload?.message ?? "API request failed.",
      code: errorPayload?.code,
      details: errorPayload?.details,
    });
  }

  // `page` is a sibling of `data` in the envelope for paginated list endpoints (see
  // PaginatedApiResponse in @{{scope}}/contracts); non-paginated endpoints just omit it.
  const page = (payload as { page?: PaginationMeta }).page;

  return { data: apiResponse.data, page };
};

/** Plain requester — returns just `data`, discarding `page` (use `createPaginatedApiRequester`
 * for list endpoints that need it). */
export const createApiRequester = (config: ApiClientConfig) => {
  const fetcher = config.fetch ?? getGlobalFetch();
  return async <TResponse, TRequest = undefined>(
    options: ApiRequestOptions<TRequest>,
  ): Promise<TResponse> => {
    const { data } = await performRequest<TResponse, TRequest>(fetcher, config, options);
    return data;
  };
};

/** Like `createApiRequester`, but also surfaces the envelope's `page` metadata for list
 * endpoints — the plain requester intentionally discards it. */
export const createPaginatedApiRequester = (config: ApiClientConfig) => {
  const fetcher = config.fetch ?? getGlobalFetch();
  return async <TResponse, TRequest = undefined>(
    options: ApiRequestOptions<TRequest>,
  ): Promise<{ data: TResponse; page: PaginationMeta }> => {
    const { data, page } = await performRequest<TResponse, TRequest>(fetcher, config, options);
    if (!page) {
      throw new ApiClientError({
        kind: "parse",
        message: `Expected a paginated response with \`page\`, got none (${options.path}).`,
      });
    }
    return { data, page };
  };
};
