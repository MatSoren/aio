---
name: add-error-code
description: Use when adding a new error case that needs its own ErrorCode — a new failure mode a controller or middleware throws that doesn't already have a matching code, or when an existing appErrorFactory call needs a status/message that isn't defined yet.
---

# Add Error Code Skill

Workflow for adding an `ErrorCode`, following the two-layer split documented in `CLAUDE.md` §
"Error handling: two layers, enforced by the compiler".

## Workflow

1. Check first whether an existing code already fits — `packages/contracts/src/error/*.ts`. Reuse
   over adding: a generic `ENTITY_NOT_FOUND` used consistently is more useful to a client than a
   dozen resource-specific "not found" codes that all mean the same thing.
2. If none fits, add the new code to the category file it belongs in
   (`authErrorCodes.ts`/`authorizationErrorCodes.ts`/`validationErrorCodes.ts`/
   `resourceErrorCodes.ts`/`serverErrorCodes.ts`) — or a new category file if none fit, following
   the existing shape exactly:
   ```ts
   export const XErrorCodes = {
     EXISTING_CODE: "EXISTING_CODE",
     NEW_CODE: "NEW_CODE",
   } as const;
   export type XErrorCode = (typeof XErrorCodes)[keyof typeof XErrorCodes];
   ```
   A brand-new category file also needs importing and spreading into `error/index.ts`'s
   `ErrorCode` merge, and `export * from` in the same file.
3. Add the matching `{ status, message }` in the equivalent category file under
   `apps/backend/src/utils/errors/` — same category name, same key.
4. Run `npm run typecheck --workspace=apps/backend`. If you added the code to contracts but not
   the backend definition (or vice versa), the `satisfies Record<ErrorCode, ErrorDefinition>`
   check in `apps/backend/src/utils/errors/index.ts` fails the build — that's the check working,
   not a bug to work around.
5. Use it: `throw appErrorFactory({ errorCode: ErrorCode.NEW_CODE })`, overriding `statusCode`/
   `message`/`details` per-call only when the default doesn't fit that specific throw site.
6. Summarize: the code added, which category, and the status/message chosen.

## Guardrails

- Do not add a code to only one side (contracts or backend) — the whole point of the split is that
  the compiler catches a lopsided add; don't defeat that by disabling the check or working around
  the error instead of fixing it.
- Do not put an HTTP status or a message string in `packages/contracts` — that package only ever
  holds the bare code. A client translates the code into its own copy; it should never see a
  backend-authored English sentence.
- Do not reuse the same string for two semantically different codes in different categories (e.g.
  a `USER_NOT_FOUND` in both an auth category and a resource category) — the merge into `ErrorCode`
  is a plain object spread, so a collision silently drops one definition rather than erroring.
- Do not invent a new category for one-off code — only split out a new file when a real cluster of
  related codes exists; a single stray code goes in whichever existing category it's closest to.
