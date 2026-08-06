---
name: monorepo-workspace-change
description: Use when adding a dependency, changing a package.json, modifying a tsconfig, adding a new shared package, or otherwise touching npm workspace configuration anywhere in this repo.
---

# Monorepo Workspace Change Skill

Workflow for npm workspace, dependency, and TypeScript config changes.

## Workflow

1. Identify the target workspace before making any change — `apps/backend`, `packages/contracts`,
   `packages/api-client`, or the repo root.
2. Install with the `-w`/`--workspace` flag, never `cd` into the workspace first:
   ```bash
   npm install <pkg> --workspace=apps/backend
   npm install <pkg> --workspace=packages/contracts
   ```
3. Root `package.json` scripts stay pure orchestration (`npm run x --workspace=...`) — logic
   belongs in the workspace's own script, not the root.
4. Every workspace's `tsconfig.json` extends the root `tsconfig.base.json` — add a stricter or
   looser option in the workspace's own file if it genuinely needs to differ, never relax
   `tsconfig.base.json` itself for one workspace's convenience.
5. A new `packages/*` workspace follows the source-only convention already there:
   `"main"`/`"types"`/`"exports"` all pointing at `./src/index.ts`, no `build` script, no `dist`.
   Don't add a build step "to be safe" — see `docs`/`CLAUDE.md` on why that breaks the
   zero-build-lag guarantee the rest of the monorepo relies on.
6. If the new package is consumed by another workspace, add it to that workspace's own
   `dependencies` (`"@<scope>/newpackage": "*"`) — a workspace symlink alone isn't enough; it has
   to be declared or the build/typecheck won't resolve it in every context (e.g. a plain `tsc`
   invocation outside the dev server).
7. Run `npm run typecheck` from the repo root after any dependency or tsconfig change — a version
   bump that silently changes a type is the most common way this kind of change breaks something
   two workspaces away from the one that was actually touched.
8. Summarize: workspace(s) touched, dependency/config changed, and the typecheck result.

## Guardrails

- Do not manually edit `package-lock.json` — there's no scenario in this repo where that's
  necessary; if `npm install` alone doesn't produce the right lockfile state, something else is
  wrong and editing the lockfile just hides it.
- Do not add a dependency to the root `package.json` that only one workspace actually needs — it
  belongs in that workspace's own `dependencies`/`devDependencies`.
- Do not create a new `packages/*` workspace for code that's only used in one place — inline it
  where it's used until a second consumer actually exists.
- Do not add a `build`/`prepublish` step to `packages/contracts` or `packages/api-client` — both
  are meant to be consumed as raw TypeScript source; see `CLAUDE.md`.
