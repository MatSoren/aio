import type { NextFunction, Request, Response } from "express";
import { ErrorCode } from "@{{scope}}/contracts";
import { appErrorFactory } from "@utils/AppError";
import { prisma } from "@config/database";
import type { AuthResponseLocals } from "../types/ResponseLocals";

export type Action = "create" | "read" | "readAll" | "update" | "delete";

/**
 * Middleware factory using a double closure — `getDomainPermissions("widgets")` locks in the
 * resource and returns a function; calling that with an action returns the ready-to-use
 * middleware. Meant to be partially applied once per route file:
 *
 * ```ts
 * const hasPermission = getDomainPermissions("widgets");
 *
 * router.get("/",           hasPermission("readAll"), listWidgets);
 * router.get("/:widgetId",  hasPermission("read"),    getWidget);
 * router.post("/",          hasPermission("create"),  createWidget);
 * router.put("/:widgetId",  hasPermission("update"),  updateWidget);
 * router.delete("/:widgetId", hasPermission("delete"), deleteWidget);
 * ```
 *
 * Checks the `(resource, operation)` grant directly against the DB on every call rather than
 * caching roles on the token — a role change takes effect on the very next request instead of
 * waiting out the access token's lifetime. Fine for a scaffold's default; cache it (e.g. attach
 * resolved permissions to `res.locals` from `jwtAuth`, or in Redis if the `--redis` module is
 * enabled) if this ever shows up in a profile.
 */
export const getDomainPermissions =
  (resource: string) =>
  (action: Action) =>
  async (_req: Request, res: Response<unknown, AuthResponseLocals>, next: NextFunction): Promise<void> => {
    const grants = await prisma.userRole.findMany({
      where: { userId: res.locals.user.id },
      select: {
        role: {
          select: {
            permissions: {
              select: {
                permission: {
                  select: {
                    resource: { select: { name: true } },
                    operation: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const isGranted = grants.some(({ role }) =>
      role.permissions.some(
        ({ permission }) => permission.resource.name === resource && permission.operation.name === action,
      ),
    );

    if (!isGranted) {
      throw appErrorFactory({ errorCode: ErrorCode.FORBIDDEN });
    }

    next();
  };
