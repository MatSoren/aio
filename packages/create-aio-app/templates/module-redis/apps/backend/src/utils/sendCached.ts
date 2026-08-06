import type { Response } from "express";
import { cacheService } from "@services/cache.service";
import type { ResponseLocals } from "../types/ResponseLocals";

/**
 * Sends `payload` as the JSON response and, if `readCache` matched this request (a GET with a
 * resolved key — see middlewares/cache.ts), writes that same payload to the cache in the same
 * call. Use this instead of `res.json(payload)` on any route mounted behind `readCache`: the
 * two-step "cache it, then respond" is easy to half-do (cache one thing, respond a slightly
 * different one, or forget the write entirely) — this makes it one call that can't drift.
 */
export const sendCached = async <T>(res: Response<T, ResponseLocals>, payload: T): Promise<void> => {
  const cache = res.locals.cache;
  if (cache) {
    await cacheService.setJson(cache.key, payload, { ttlSeconds: cache.ttlSeconds });
  }
  res.json(payload);
};
