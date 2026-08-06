import { prisma } from "@config/database";

const ROLES = ["Admin", "Member"] as const;

const seedRoleShells = async (): Promise<void> => {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
};

/** Admin gets every permission that exists — adjust once your app has resources beyond the
 * built-in `users` one, if "every permission" isn't actually what Admin should mean. */
const grantAllToAdmin = async (): Promise<void> => {
  const admin = await prisma.role.findUniqueOrThrow({ where: { name: "Admin" } });
  const permissions = await prisma.permission.findMany();
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: permission.id } },
      update: {},
      create: { roleId: admin.id, permissionId: permission.id },
    });
  }
};

/** Member gets read-only access — a starting point, not a prescription. Adjust or remove once
 * your app defines its own roles. */
const grantReadToMember = async (): Promise<void> => {
  const member = await prisma.role.findUniqueOrThrow({ where: { name: "Member" } });
  const permissions = await prisma.permission.findMany({
    where: { operation: { name: { in: ["read", "readAll"] } } },
  });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: member.id, permissionId: permission.id } },
      update: {},
      create: { roleId: member.id, permissionId: permission.id },
    });
  }
};

export const seedRoles = async (): Promise<void> => {
  await seedRoleShells();
  await grantAllToAdmin();
  await grantReadToMember();
};
