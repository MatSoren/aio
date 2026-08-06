import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";
import { appEnv } from "@config/envs";

const adapter = new PrismaPg({
  connectionString: appEnv.db.url,
  ssl: appEnv.db.ssl ? { rejectUnauthorized: false } : undefined,
});

// Singleton via ES module caching — every importer gets the same instance. `tsx watch` restarts
// the whole process on file changes rather than hot-reloading modules, so there's no need for the
// `globalThis`-cached-instance guard a bundler's HMR would require.
export const prisma = new PrismaClient({
  adapter,
  // Global safety net: nothing that reads `prisma.user.*` gets `password` back by accident. A
  // query that genuinely needs the hash (login, password change) re-requests it explicitly with
  // `select: { password: true }`.
  omit: { user: { password: true } },
});
