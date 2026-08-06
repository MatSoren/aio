import type { NextFunction, Request, Response } from "express";
import { cacheService } from "@services/cache.service";
import type { ResponseLocals } from "../types/ResponseLocals";

type BuildCacheKey = (
  req: Request,
  res: Response<unknown, ResponseLocals>,
) => string | null | Promise<string | null>;

type CacheMiddlewareOptions = {
  ttlSeconds: number;
  /** Return `null` to bypass caching for this particular request (e.g. a query-param
   * combination you've decided not to cache) — the request just falls through to the
   * controller as if this middleware weren't there. */
  buildKey: BuildCacheKey;
};

/**
 * GET-only response cache. On a hit, responds immediately with the cached payload — the
 * controller never runs. On a miss, stashes `{ key, ttlSeconds }` in `res.locals.cache` and calls
 * `next()`; the controller (via `sendCached`, see utils/sendCached.ts) writes the response there
 * when it's done, so the exact envelope that would have been served IS what gets cached.
 */
export const readCache = <TCachedResponse = unknown>({ ttlSeconds, buildKey }: CacheMiddlewareOptions) => {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    console.error("readCache: ttlSeconds must be a positive integer, defaulting to 300");
    ttlSeconds = 300;
  }

  return async (req: Request, res: Response<unknown, ResponseLocals>, next: NextFunction): Promise<void> => {
    if (req.method !== "GET") {
      next();
      return;
    }

    const key = await buildKey(req, res);
    if (!key) {
      next();
      return;
    }

    res.locals.cache = { key, ttlSeconds };

    // Browser always revalidates; an edge/CDN in front of the API (if any) can still cache for
    // ttlSeconds — the two layers serve different purposes and don't need to agree.
    res.setHeader("Cache-Control", "no-cache");

    const cached = await cacheService.getJson<TCachedResponse>(key, { includeCachedAt: true });
    if (cached === null) {
      next();
      return;
    }

    res.setHeader("X-Cache", "HIT");
    if (cached.cachedAt) res.setHeader("X-Cached-At", cached.cachedAt);
    res.status(200).json(cached.value);
  };
};
