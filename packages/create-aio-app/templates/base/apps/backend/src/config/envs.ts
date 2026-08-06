import "dotenv/config";
import { z } from "zod";

// Fail-fast: parsed once at import time. A missing/malformed required variable stops the process
// before it ever calls `app.listen` — no request is ever served against an undefined secret.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url(),
  // z.coerce.boolean() is a trap here: Boolean("false") is `true` (any non-empty string coerces
  // truthy), so an explicit true/false enum + transform is the correct way to parse an env flag.
  DATABASE_SSL: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),

  CORS_ALLOWED_ORIGINS: z.string().default(""),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRATION: z.coerce.number().int().positive().default(900), // 15 minutes
  JWT_REFRESH_EXPIRATION: z.coerce.number().int().positive().default(2_592_000), // 30 days
  // @aio:env-schema
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("✗ Invalid environment variables:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

const env = parsed.data;

/** Grouped by domain and validated once at boot — use `appEnv.x.y` everywhere else in the
 * backend, never `process.env` directly (that's the only way to keep this the single source of
 * truth for configuration). */
export const appEnv = {
  app: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  },
  db: {
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
  },
  cors: {
    // Empty list means "reflect any origin" — see its use in app.ts. Fine for local dev; set this
    // explicitly for any environment that isn't.
    allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  auth: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiration: env.JWT_ACCESS_EXPIRATION,
    refreshExpiration: env.JWT_REFRESH_EXPIRATION,
  },
  // @aio:env-groups
};
