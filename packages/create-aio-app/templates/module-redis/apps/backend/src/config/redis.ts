import { createClient } from "redis";
import { appEnv } from "@config/envs";

// Singleton client — created eagerly (connecting lazily via `connectRedis` below) so every
// importer shares the same connection instead of opening one per module.
export const redis = createClient({ url: appEnv.redis.url });

redis.on("error", (error) => {
  console.error("[redis] client error:", error);
});

/** Best-effort connect at boot (see index.ts). Never throws: if Redis is down, `cacheService`
 * degrades to a pass-through (every method there checks `redis.isReady` first) instead of an
 * optional cache layer taking the whole app down with it. */
export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch (error) {
    console.error("[redis] failed to connect — continuing without cache:", error);
  }
};
