import type { PublicUser } from "@{{scope}}/contracts";

export interface ResponseLocals<T = null> {
  input: T;
  queryParams?: Record<string, unknown>;
  page?: { skip: number; take: number };
  // @aio:response-locals-fields
}

/** Set by the auth middleware once a token has been verified. */
export interface AuthResponseLocals<T = null> extends ResponseLocals<T> {
  user: PublicUser;
}
