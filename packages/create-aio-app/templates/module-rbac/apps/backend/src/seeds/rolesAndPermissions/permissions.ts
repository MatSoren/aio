import { prisma } from "@config/database";

// One Permission row per (resource, operation) pair — the full cartesian product. Roles then
// grant a subset of these rows rather than resources/operations being touched per-role.
export const seedPermissions = async (): Promise<void> => {
  const [resources, operations] = await Promise.all([prisma.resource.findMany(), prisma.operation.findMany()]);

  for (const resource of resources) {
    for (const operation of operations) {
      await prisma.permission.upsert({
        where: { resourceId_operationId: { resourceId: resource.id, operationId: operation.id } },
        update: {},
        create: { resourceId: resource.id, operationId: operation.id },
      });
    }
  }
};
