import { prisma } from "@config/database";
// @aio:seed-import

export async function seedAll(): Promise<void> {
  console.log("Seeding database...");
  // @aio:seed-call
  console.log("Database seeded successfully!");
}

// ESM equivalent of `require.main === module` — only auto-runs when this file is executed
// directly (`npm run seed`), not when some other script imports `seedAll`.
if (process.argv[1]?.endsWith("/seeds/index.ts") || process.argv[1]?.endsWith("/seeds/index.js")) {
  seedAll()
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
