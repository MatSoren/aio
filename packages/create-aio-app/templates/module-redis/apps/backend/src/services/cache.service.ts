import { redis } from "@config/redis";
import { appEnv } from "@config/envs";

type PrimitiveCacheValue = string | number | boolean;
type CacheKeySegmentValue = PrimitiveCacheValue | null | undefined;
type CacheKeyParamValue = PrimitiveCacheValue | PrimitiveCacheValue[] | null | undefined;
type CacheKeyParams = Record<string, CacheKeyParamValue>;

type CacheKeyOptions = {
  segments?: CacheKeySegmentValue[] | undefined;
  params?: CacheKeyParams | undefined;
};

type SetJsonOptions = { ttlSeconds?: number };
type GetJsonOptions = { includeCachedAt?: boolean };

type CacheEntry<T> = {
  value: T;
  cachedAt: string;
};

type ScanPatternOptions = { count?: number };

// Scoped per environment so a shared Redis instance (e.g. one box running dev + staging) can't
// cross-contaminate — bumping a version in staging never touches dev's keys.
const CACHE_KEY_PREFIX = `cache:${appEnv.app.nodeEnv}:v1`;
const CACHE_KEY_META_SEGMENT = "meta";
const CACHE_KEY_VERSION_SEGMENT = "version";
const CACHE_KEY_VERSION_MARKER = "v";
const DEFAULT_CACHE_VERSION = 0;
const DEFAULT_SCAN_COUNT = 100;
// Spreads TTL expiry over a window instead of a single instant, so a burst of keys set together
// (e.g. warming the cache after a deploy) don't all expire — and get recomputed — at once.
const TTL_JITTER_RATIO = 0.1;

const isCacheEntry = <T>(value: unknown): value is CacheEntry<T> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return Object.hasOwn(entry, "value") && typeof entry.cachedAt === "string";
};

const normalizeCacheScalar = (value: CacheKeySegmentValue): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeCacheParamValue = (value: CacheKeyParamValue): string | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
      .sort();
    return normalized.length > 0 ? normalized.join(",") : null;
  }
  return normalizeCacheScalar(value);
};

const buildNormalizedSegments = (segments: CacheKeySegmentValue[] = []): string[] =>
  segments.flatMap((segment) => {
    const normalized = normalizeCacheScalar(segment);
    return normalized === null ? [] : [normalized];
  });

const buildOrderedParamSegments = (params: CacheKeyParams = {}): string[] =>
  Object.entries(params)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .flatMap(([key, value]) => {
      const normalizedKey = normalizeCacheScalar(key);
      const normalizedValue = normalizeCacheParamValue(value);
      return normalizedKey === null || normalizedValue === null ? [] : [normalizedKey, normalizedValue];
    });

const withJitter = (ttlSeconds: number): number => {
  const jitter = Math.round(ttlSeconds * TTL_JITTER_RATIO * Math.random());
  return ttlSeconds + jitter;
};

class CacheService {
  public buildKey(resource: string, options: CacheKeyOptions = {}): string {
    const normalizedResource = normalizeCacheScalar(resource);
    if (!normalizedResource) {
      throw new Error("cacheService: resource is required and can't be blank");
    }
    const segments = buildNormalizedSegments(options.segments);
    const params = buildOrderedParamSegments(options.params);
    return [CACHE_KEY_PREFIX, normalizedResource, ...segments, ...params].join(":");
  }

  public buildVersionKey(resource: string, options: CacheKeyOptions = {}): string {
    const normalizedResource = normalizeCacheScalar(resource);
    if (!normalizedResource) {
      throw new Error("cacheService: resource is required and can't be blank");
    }
    const segments = buildNormalizedSegments(options.segments);
    const params = buildOrderedParamSegments(options.params);
    return [
      CACHE_KEY_PREFIX,
      CACHE_KEY_META_SEGMENT,
      CACHE_KEY_VERSION_SEGMENT,
      normalizedResource,
      ...segments,
      ...params,
    ].join(":");
  }

  public buildPrefixPattern(resource: string, options: CacheKeyOptions = {}): string {
    return `${this.buildKey(resource, options)}:*`;
  }

  public async getVersion(resource: string, options: CacheKeyOptions = {}): Promise<number> {
    if (!redis.isReady) return DEFAULT_CACHE_VERSION;
    const versionKey = this.buildVersionKey(resource, options);
    try {
      const raw = await redis.get(versionKey);
      if (raw === null) return DEFAULT_CACHE_VERSION;
      const parsed = Number.parseInt(raw, 10);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_CACHE_VERSION;
    } catch (error) {
      console.error(`[cache] error getting version for ${versionKey}:`, error);
      return DEFAULT_CACHE_VERSION;
    }
  }

  /** Builds a key that embeds the resource's current version as a segment — bumping the version
   * (see `bumpVersion`) makes every previously-built versioned key instantly stale without
   * touching them: they simply stop being the key anyone asks for again, and expire on their own
   * TTL. This is the whole invalidation strategy — no SCAN/DEL on the hot path. */
  public async buildVersionedKey(
    resource: string,
    versionOptions: CacheKeyOptions = {},
    keyOptions: CacheKeyOptions = {},
  ): Promise<string> {
    const version = await this.getVersion(resource, versionOptions);
    return this.buildKey(resource, {
      segments: [...(keyOptions.segments ?? []), CACHE_KEY_VERSION_MARKER, version],
      params: keyOptions.params,
    });
  }

  public async getJson<T>(key: string, options: { includeCachedAt: true }): Promise<{ value: T; cachedAt: string | null } | null>;
  public async getJson<T>(key: string, options?: GetJsonOptions): Promise<T | null>;
  public async getJson<T>(
    key: string,
    options: GetJsonOptions = {},
  ): Promise<T | { value: T; cachedAt: string | null } | null> {
    if (!redis.isReady) return null;
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as T | CacheEntry<T>;
      if (isCacheEntry<T>(parsed)) {
        return options.includeCachedAt ? { value: parsed.value, cachedAt: parsed.cachedAt } : parsed.value;
      }
      // Tolerates a value written before this envelope existed, or by anything else that just
      // does a plain `SET key jsonValue` — still served as a hit, just without a `cachedAt`.
      return options.includeCachedAt ? { value: parsed, cachedAt: null } : parsed;
    } catch (error) {
      console.error(`[cache] error getting key ${key}:`, error);
      return null;
    }
  }

  public async setJson<T>(key: string, value: T, options: SetJsonOptions = {}): Promise<void> {
    if (!redis.isReady) return;
    try {
      const serialized = JSON.stringify({ value, cachedAt: new Date().toISOString() } satisfies CacheEntry<T>);
      if (typeof options.ttlSeconds === "number") {
        await redis.set(key, serialized, { EX: withJitter(options.ttlSeconds) });
        return;
      }
      await redis.set(key, serialized);
    } catch (error) {
      console.error(`[cache] error setting key ${key}:`, error);
    }
  }

  public async delete(key: string): Promise<number> {
    if (!redis.isReady) return 0;
    try {
      return await redis.unlink(key);
    } catch (error) {
      console.error(`[cache] error deleting key ${key}:`, error);
      return 0;
    }
  }

  public async deleteMany(keys: string[]): Promise<number> {
    if (!redis.isReady || keys.length === 0) return 0;
    try {
      return await redis.unlink(keys);
    } catch (error) {
      console.error("[cache] error deleting keys:", { keys, error });
      return 0;
    }
  }

  /** Emergency-only escape hatch (SCAN + UNLINK) — the real invalidation path is
   * `bumpVersion`. Reach for this only when you genuinely need old keys gone immediately
   * (compliance, a corrupted cache) rather than left to expire on their own TTL. */
  public async deleteByPattern(pattern: string, options: ScanPatternOptions = {}): Promise<number> {
    if (!redis.isReady) return 0;
    const keys: string[] = [];
    try {
      for await (const batch of redis.scanIterator({ MATCH: pattern, COUNT: options.count ?? DEFAULT_SCAN_COUNT })) {
        for (const key of batch as string[]) keys.push(key);
      }
      if (keys.length === 0) return 0;
      return await redis.unlink(keys);
    } catch (error) {
      console.error(`[cache] error deleting pattern ${pattern}:`, error);
      return 0;
    }
  }

  public async bumpVersion(resource: string, options: CacheKeyOptions = {}): Promise<number> {
    if (!redis.isReady) return DEFAULT_CACHE_VERSION;
    const versionKey = this.buildVersionKey(resource, options);
    try {
      return await redis.incr(versionKey);
    } catch (error) {
      console.error(`[cache] error bumping version for ${versionKey}:`, error);
      return DEFAULT_CACHE_VERSION;
    }
  }
}

export const cacheService = new CacheService();
