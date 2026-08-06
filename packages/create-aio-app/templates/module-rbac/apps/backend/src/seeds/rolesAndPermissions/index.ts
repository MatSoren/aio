import { seedResources } from "./resources";
import { seedOperations } from "./operations";
import { seedPermissions } from "./permissions";
import { seedRoles } from "./roles";

// Order matters: resources/operations must exist before the permission matrix is built from
// them, and permissions must exist before roles can be granted a subset of them.
export const seedRolesAndPermissions = async (): Promise<void> => {
  await Promise.all([seedResources(), seedOperations()]);
  await seedPermissions();
  await seedRoles();
};
