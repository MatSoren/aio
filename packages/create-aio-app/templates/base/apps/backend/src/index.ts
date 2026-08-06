import { initApp } from "./app";
import { prisma } from "@config/database";
// @aio:index-import

// @aio:bootstrap
const { server } = await initApp();

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received, shutting down...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  // @aio:shutdown
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
