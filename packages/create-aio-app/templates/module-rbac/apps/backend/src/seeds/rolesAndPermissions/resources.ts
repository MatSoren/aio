import { prisma } from "@config/database";

// Add your app's real resources here as they show up (one entry per noun you'll gate access to).
export const RESOURCES = ["users"] as const;

export const seedResources = async (): Promise<void> => {
  for (const name of RESOURCES) {
    await prisma.resource.upsert({ where: { name }, update: {}, create: { name } });
  }
};
