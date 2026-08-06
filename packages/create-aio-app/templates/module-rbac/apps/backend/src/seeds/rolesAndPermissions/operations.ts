import { prisma } from "@config/database";

export const OPERATIONS = ["create", "read", "readAll", "update", "delete"] as const;

export const seedOperations = async (): Promise<void> => {
  for (const name of OPERATIONS) {
    await prisma.operation.upsert({ where: { name }, update: {}, create: { name } });
  }
};
