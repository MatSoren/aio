---
name: add-endpoint
description: Use when adding a new API endpoint, route, or controller action to the backend — creating, listing, updating, or deleting a resource, or any new request/response pair under apps/backend.
---

# Add Endpoint Skill

Workflow for adding one new endpoint, following the contract-first pipeline documented in
`CLAUDE.md`.

## Workflow

1. Read `CLAUDE.md` § Architecture, especially "`res.locals` as the typed bus" and "Middleware
   factories, not middleware" — the pattern below assumes that context.
2. **Contract first.** In `packages/contracts/src/<domain>/`, define (or extend) the Zod schema(s)
   this endpoint needs, following the convention already in the file for that domain:
   `<Entity>Schema` (create/write, `.strict()`), `<Entity>PatchSchema` (`= <Entity>Schema.partial()`,
   for PATCH), `Public<Entity>Schema` (read/response — filters internal fields), `<Entity>QuerySchema`
   (`= PaginationQuerySchema.extend({...})` for list endpoints). Derive every type with `z.infer`,
   never write one by hand.
3. If the endpoint needs a new Prisma model or field, add it under
   `apps/backend/prisma/models/` (or `prisma/relations/` for a join table), then run
   `npm run update-db --workspace=apps/backend`.
4. Write the controller in `apps/backend/src/controllers/`, typed with `Endpoint<TResponse,
   TInput>` (or `AuthEndpoint<...>` if it needs `res.locals.user`) from `../types/ControllerEndpoint`.
   Read only from `res.locals` — never `req.body`/`req.query` directly. Throw
   `appErrorFactory({ errorCode })` for any failure case; never `res.status(...).json({...})` an
   error by hand.
5. Wire the route in `apps/backend/src/routes/v1/<domain>.routes.ts` (create the file if the
   domain doesn't have one yet, and mount it from `v1.routes.ts`). Middleware order:
   `[jwtAuth if authenticated] → [getDomainPermissions(...)(...)  if RBAC is enabled and this
   route should be gated] → [validateBody/validateQuery(schema)] → controller`.
6. If this is a list endpoint, use `parsePagination` + `buildPaginationMeta`
   (`apps/backend/src/utils/pagination.ts`) rather than reimplementing skip/take math.
7. If a new error case doesn't map to an existing `ErrorCode`, apply the `add-error-code` skill
   before finishing this one — don't invent a status/message pair inline in the controller.
8. Run `npm run typecheck --workspace=apps/backend` (and `--workspace=packages/contracts` if you
   touched contracts).
9. Summarize: the endpoint added, the contract file(s) touched, whether a migration was needed,
   and any new error code introduced.

## Guardrails

- Do not validate or re-validate inside the controller — that's what the middleware chain is for.
  A controller that calls `schema.safeParse` itself means a `validateBody`/`validateQuery` call is
  missing from the route.
- Do not define a request/response type directly in the backend when it should be a shared
  contract — if a client (or a test) will ever need this shape, it belongs in `packages/contracts`.
- Do not throw a raw `Error` or call `res.status(500)` by hand — always
  `appErrorFactory({ errorCode })`, even for a case that "should never happen."
- Do not skip `getDomainPermissions` on a route just because RBAC feels like overkill for it —
  either every mutating route in a domain goes through it (if RBAC is enabled at all) or the
  domain is deliberately public; don't leave it inconsistent within one route file.
