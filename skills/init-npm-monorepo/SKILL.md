---
name: init-npm-monorepo
description: Use when the user asks to bootstrap, scaffold, or initialize a new backend project, API, or npm-workspaces monorepo from scratch — Express + Prisma + Postgres, with shared contracts and a typed HTTP client. Also use when they want to replicate this same architecture (error system, res.locals pipeline, contracts package) inside an existing repo by hand.
---

# Init npm Monorepo Skill

Bootstraps a new project on the `create-aio-app` architecture: npm workspaces, a source-only
`contracts` package, an Express 5 + Prisma + PostgreSQL backend with a two-layer error system, and
a typed HTTP client — or explains/replicates the same architecture by hand when a generator run
isn't the right fit (e.g. adding it into an existing repo).

Read `docs/architecture.md` in the framework repo (see below) before making any judgment call this
skill doesn't cover explicitly — it's the source of truth for *why* the architecture looks the way
it does, which matters when a project's requirements don't fit the defaults cleanly.

## Locating the generator

The framework repo (below: `<repo>`) is wherever this repo was cloned on the machine. The generator is
`packages/create-aio-app` inside it (`src/index.js`, no install needed — it has zero
dependencies, run it directly with `node`). If that path doesn't exist in this environment, stop
and ask where the framework repo was moved to rather than guessing or hand-writing the
architecture from memory — the generator is the source of truth, not this skill's description of
it.

## Workflow

1. **Determine the target**: a brand-new directory (normal case — run the generator) or an
   existing repo that wants pieces of this architecture added (skip to step 6).
2. **Resolve the decisions the generator needs**, from the request if already stated, otherwise
   ask (see Decisions below — don't guess silently, these are real architectural trade-offs):
   project name/path, auth transport, whether to include the Redis cache module, whether to
   include the RBAC module. Docker defaults on; only ask about disabling it if there's a signal
   the user manages their own infra differently.
3. **Run the generator non-interactively** with explicit flags for every decision — never let it
   fall through to its own interactive prompts, since there's no TTY to answer them and it'll just
   fall back to defaults silently:
   ```bash
   node <repo>/packages/create-aio-app/src/index.js <project-name> \
     --auth=<bearer|cookie|both> [--redis] [--rbac] [--no-docker] --yes
   ```
   `--yes` skips any prompt the flags above didn't cover, applying the generator's defaults
   without blocking on stdin.
4. **Let it finish its own install + prisma generate** (it does this automatically unless
   `--skip-install` was passed — don't pass that flag here, this is the one context where the full
   automated flow is exactly what's wanted).
5. **Verify**: `npm run typecheck` from the generated project's root. This is the real gate — it
   catches template/wiring bugs, not just user error. If it fails, that's a bug in the generator's
   templates, not something to patch inside the freshly generated project; fix it in
   `packages/create-aio-app/templates/` in the framework repo and regenerate, so the next project
   doesn't inherit the same bug.
6. **For an existing repo** (or once the fresh project exists): read `docs/architecture.md`'s
   relevant sections and replicate the pattern, keeping the target repo's existing conventions
   where they don't conflict (naming, lint config, etc.) — don't import files from
   `packages/create-aio-app/templates/` directly into an unrelated repo; they contain `{{token}}`
   placeholders and `// @aio:` wiring markers that are meaningless outside the generator.
7. **Report**: what was generated (or replicated), the flags/decisions made, and the concrete next
   steps the user still needs to do by hand — filling in `.env` secrets, running
   `docker compose up -d`, running the first migration. The generator prints these; relay them,
   don't re-derive a different set.

## Decisions (ask if not already stated)

- **Auth transport** — Bearer (web + mobile + scripts, token in a header), Cookie (browser-only,
  httpOnly, not readable by JS), or Both. See `docs/architecture.md` § Authentication for the
  actual trade-off table; don't default this silently, it's not a "just pick one" choice — a
  mobile client genuinely cannot use cookie-only auth, and a security-sensitive browser-only
  product may specifically want cookie-only.
- **Redis cache module** — only if the project has (or clearly will soon have) read-heavy
  endpoints worth caching. Skip it for a project that's mostly writes or is still finding its
  shape; it's easy to add later and adds a required piece of infra (Redis itself) to local dev.
- **RBAC module** — only if the project actually has more than one class of user with different
  permissions. A single-user-type app (every authenticated user can do the same things) doesn't
  need it — adding the tables and the always-passing permission checks for a distinction that
  doesn't exist yet is pure ceremony.

## Guardrails

- Do not hand-write the files the generator would produce — run it. Hand-writing invites exactly
  the kind of small drift (a forgotten `errorHandler` mount, a typo'd env var name) this framework
  exists to prevent.
- Do not invent CLI flags. If unsure what the generator supports, read
  `packages/create-aio-app/src/index.js` rather than guessing at a flag name.
- Do not silently default the auth transport or either optional module without at least one
  explicit signal from the request — ask (see Decisions).
- Do not edit anything under `packages/create-aio-app/templates/` while working *on a generated
  project* — that's the generator's source, editing it there has zero effect on the project
  already generated. Fixes to the architecture go there only when the intent is to change what
  *future* projects get.
- Do not copy a `templates/` file directly into an unrelated existing repo — it still has
  `{{projectName}}`-style tokens and `// @aio:` markers in it, neither of which mean anything
  outside the generator's own copy/patch/wire pipeline.
