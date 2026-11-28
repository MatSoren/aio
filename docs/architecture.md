# Architecture reference

This is the source of truth for the platform architecture that `create-aio-app` generates. It's
written generically — no references to any specific product — so it can be read on its own
(deciding how to bootstrap a new backend, explaining a trade-off, replicating a piece of this by
hand in an existing repo) or used as the knowledge base for a skill that operates the generator.

If you change what the generator produces, change this doc first, then `templates/`. The
generated project also gets its own `CLAUDE.md`, written concretely for the flags that were
actually chosen — this document is the generic version behind it.

## Philosophy

**Scaffold, don't frame.** The generator copies real, editable source files into the new project
and exits — nothing in the generated project imports from a shared runtime package. A bugfix
found in project #12 doesn't get silently different behavior in project #3 by way of a dependency
bump; every project owns its copy and can diverge on purpose. The cost is that a fix discovered
later has to be manually back-ported to `templates/` if it's generally applicable — an accepted
trade-off for zero coupling and zero versioning between the generator and everything it generates.

**Two layers, one job each.** `packages/contracts` is data shape and validation, shared by the
backend and every client. `apps/backend` is behavior. Nothing in contracts imports Express,
Prisma, or any transport concern; nothing in the backend defines a `z.object` that a client should
also be validating against. When you're unsure where a piece of code belongs, this is the test:
would a totally different backend (same domain, different framework) still need this exact code?
If yes, it's a contract. If no, it's backend.

**Fail loud at boot, degrade quietly at runtime.** Environment variables are validated once at
import time with a schema — a missing secret stops the process before it serves a single request,
rather than crashing on the first login attempt in production. Optional infrastructure (the Redis
cache module) does the opposite once the process is up: every operation checks the connection is
live and falls back to a no-op instead of taking the whole app down over a cache miss.

## Monorepo layout

```
<project>/
├── apps/
│   └── backend/          Express 5 API — TypeScript, Prisma, PostgreSQL
└── packages/
    ├── contracts/        Zod schemas, inferred types, error codes — shared by backend + clients
    └── api-client/       Typed HTTP client built on those contracts
```

npm workspaces (`workspaces: ["apps/*", "packages/*"]`), no other tooling (no Nx, no Turborepo,
no lockfile-splitting). Root `package.json` scripts are pure orchestration
(`npm run dev --workspace=apps/backend`) — no logic lives at the root. Installing into a specific
workspace always uses `-w`/`--workspace`, never `cd`.

**`packages/*` are consumed as raw TypeScript, never built.** Each one's `package.json` points
`main`/`types`/`exports` straight at `src/index.ts`, with no `build` script and no `dist/`. A
change in `contracts` is visible to the backend and any client on the next file save — no build
step to remember, no stale compiled output to accidentally ship. The cost of this is entirely
absorbed by the consumer's own dev-time transpiler (`tsx` for the backend, Vite/Metro/whatever for
a client) — none of which is anything the generator has to configure, since they already resolve
workspace symlinks and re-transpile on change by default. The one thing this requires discipline
on: don't add a `build` step to a `packages/*` workspace later "just for CI" — the moment
`exports` points at `dist/` instead of `src/`, every consumer needs a rebuild before it sees a
contract change, and that lag is the single most common source of "why isn't my type showing up"
confusion in a monorepo.

## The backend request pipeline

```
routes → middlewares → controllers → services → Prisma
```

Versioned under `/api/v1/*`. Routers are nested one level per URL segment
(`routes/index.routes.ts` → `routes/v1/v1.routes.ts` → one router per domain), each file a
`Router()` with `export default`, mounted with `router.use("/segment", subRouter)`.

### `res.locals` is the typed bus between middleware and controller

Validation middleware never writes to `req.body`. It writes to `res.locals`, typed positionally
through the handler's `Response<TBody, TLocals>` generic — no global augmentation of
`Express.Request`. This is the single most load-bearing convention in the whole backend:

```ts
export interface ResponseLocals<T = null> {
  input: T;                                  // set by validateBody / validateQuery
  queryParams?: Record<string, unknown>;
  page?: { skip: number; take: number };     // set by parsePagination
}

export interface AuthResponseLocals<T = null> extends ResponseLocals<T> {
  user: PublicUser;                          // set by the auth middleware
}
```

and the controller contract that reads from it:

```ts
export type Endpoint<TResponse = null, TInput = null> = (
  req: Request,
  res: Response<ApiResponse<TResponse>, ResponseLocals<TInput>>,
) => void | Promise<void>;
```

A controller written against `Endpoint<PublicWidget, CreateWidgetBody>` gets `res.locals.input`
typed as an already-validated `CreateWidgetBody` — there is nothing left to check, and nothing to
re-parse. The pattern generalizes: any middleware that produces a value the controller needs adds
one field to `ResponseLocals` (or a subtype like `AuthResponseLocals`) and writes it there, rather
than inventing a new way to pass data down the chain.

### Middleware factories, not middleware

Anything configurable is a function that *returns* a middleware, so route files read
declaratively:

```ts
router.post("/widgets", jwtAuth, validateBody(CreateWidgetSchema), createWidget);
router.get("/widgets", parsePagination, validateQuery(WidgetQuerySchema), listWidgets);
```

`validateBody(schema)`, `validateQuery(schema)`, and (with the RBAC module) `getDomainPermissions
(resource)(action)` all follow this shape. The RBAC one curries twice on purpose — partially
applying the resource once per route file (`const hasPermission = getDomainPermissions("widgets")`)
keeps every route declaration down to just the action.

### No `asyncHandler`

Express 5 forwards a rejected promise from any `async` handler to the error middleware
automatically — synchronous `throw` has always worked this way, Express 5 just extended it to
async. So controllers and middleware just `throw`, never `next(err)`, and there's no wrapper
function to remember to apply. This *only* holds if the error-handling middleware is actually
mounted after every route — see below, because this is exactly the kind of one-line omission that
makes error handling look like it works in every manual test and then silently doesn't.

## Error handling: two layers, enforced by the compiler

Every thrown error goes through one factory:

```ts
throw appErrorFactory({ errorCode: ErrorCode.ENTITY_NOT_FOUND });
throw appErrorFactory({ errorCode: ErrorCode.ENTITY_NOT_FOUND, statusCode: 404, details: { id } });
```

never `new AppError(...)` directly. The reason for splitting error definitions across the two
packages, rather than just defining `{ code, status, message }` once in the backend:

- **`packages/contracts/src/error/`** — one file per category (auth, validation, resource, ...),
  each a `const` object of string literals plus a derived union type. The category files merge
  into a single `ErrorCode`, which — via declaration merging between a `const` and a `type` of the
  same name — works as both a value (`ErrorCode.ENTITY_NOT_FOUND`) and a type (`errorCode:
  ErrorCode`). **Codes only. No HTTP status, no message.** A client (web, mobile, another service)
  imports just this half and switches on codes to show its own localized copy, with zero coupling
  to how the backend phrases an error in English at 3am.
- **`apps/backend/src/utils/errors/`** — the other half, one file per category again, each mapping
  every code in that category to `{ status, message }`. The merge point uses
  `as const satisfies Record<ErrorCode, ErrorDefinition>` — this is not a lint rule, it's a
  compile error. Add a code to contracts without a matching definition here (or vice versa) and
  `tsc` fails the build. This is the strongest guarantee in the whole system, and it's free: no
  test to write, no reviewer to catch it, the type checker refuses to let the two halves drift.

`AppError` extends `Error` normally (`super(message)` first, then the rest) so `instanceof`
works and the stack trace starts at the actual throw site. The error-handling middleware, mounted
last, resolves any thrown value in order: `AppError` as-is → a recognized ORM error, mapped to the
closest `AppError` (Prisma's unique-constraint violation → `ENTITY_DUPLICATED`, etc.) → anything
else, duck-typed for a `statusCode`/`status` property (covers third-party libraries) and folded
into a generic 500. Every response — success or failure — uses the same envelope:

```ts
type ApiResponse<T = null> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: ErrorCode; details?: unknown }; stack?: string };
```

A discriminated union, not `{ success: boolean; data?: T; error?: ApiError }` — the compiler
refuses code that reads `.data` without having checked `.success` first, on either side of the
wire. `stack` only appears outside production.

**The failure mode this whole design defends against**: a project where the error-handling
middleware exists, is fully implemented, has tests conceptually covering it — and is simply never
`app.use()`'d. Every thrown `AppError` then falls through to the framework's default error
handling instead, and every error response an end user or client ever sees is wrong, silently,
until someone notices in production. The fix is procedural, not architectural: the generated
bootstrap mounts it as the literal last line before `server.listen`, and nothing else is allowed
to run after it.

## Database — Prisma, multi-file schema

`config/database.ts` exports a Prisma Client singleton (plain module-level `const` — the dev
server restarts its whole process on file change, so there's no hot-reload scenario that would
double-initialize it). It's constructed with a driver adapter rather than the legacy binary
engine, and with a global `omit` for anything that should never accidentally end up in a JSON
response (a password hash, most commonly) — a query that genuinely needs that field re-requests it
explicitly with `select`, which is a deliberate, visible opt-in rather than the default.

The Prisma schema is split across files: the config points at a *folder*, and Prisma concatenates
every `.prisma` file under it. The single `schema.prisma` at the root of that folder holds only
`generator` and `datasource` — every `model` lives in its own file, one entity per file, with join
tables that carry no independent identity of their own grouped under a `relations/` (or similarly
named) subfolder. This is purely an organization convention; the merged schema is identical either
way, but a 40-model app with one 2,000-line `schema.prisma` versus forty ~15-line files is a
different reviewing and merging experience entirely.

## Authentication

Three interchangeable transports for the same underlying flow — pick one when bootstrapping a
project, not something you mix ad hoc later:

| | Bearer | Cookie | Both |
|---|---|---|---|
| Token location | `Authorization` header | httpOnly cookie | either |
| Works for | web, mobile, scripts, sockets | browser only | everything |
| XSS exposure | token readable by JS if it leaks into it | not readable by JS at all | cookie path not readable; body tokens are |
| CSRF exposure | none (no ambient credential) | needs `SameSite`/CSRF defenses | same as cookie, for the cookie path |
| Refresh token carried | request body | its own cookie, path-scoped to the refresh route | body if bearer, cookie otherwise |

Pick **Bearer** for anything with a non-browser client (mobile app, another service, a CLI).
**Cookie** for a browser-only product where you want the token literally unreachable from page
JavaScript. **Both** when the same API serves a web app and a mobile app and you don't want to run
two auth systems.

What's shared regardless of transport: passwords are hashed with bcrypt; refresh tokens with
SHA-256 (`node:crypto`), compared with `timingSafeEqual`. They're deliberately different: bcrypt
only reads the first 72 bytes of its input, and those bytes of a JWT (header + `{"sub":"<uuid>"…`)
are identical for every token issued to the same user — a bcrypt hash of the current refresh token
would also accept every older, already-rotated one. A JWT is high-entropy, so a fast hash over the
whole token is the right tool there. A refresh token is never stored raw, only its hash, so a
stolen database dump can't be replayed into new sessions — it can, at most, confirm a token *was*
issued, which is already public information the token holder has anyway. Emails are normalized
(trimmed + lowercased) by the shared `EmailSchema` in contracts before the format check, so
`Juan@Mail.com` and `juan@mail.com` are the same account on register and login. `jsonwebtoken`'s own
`TokenExpiredError`/`JsonWebTokenError` get translated into the two different error codes a client
actually needs to distinguish (`TOKEN_EXPIRED` — the *expected* case, refresh and retry silently —
versus `INVALID_TOKEN` — something is actually wrong, force a re-login). Login and registration
failures return the same generic "invalid credentials" for a wrong password and for a nonexistent
account; a route that answers differently for the two is an account-enumeration oracle for anyone
who scripts against it.

## Optional modules

Everything below is additive: the base scaffold works completely without any of it, and turning
one on never requires touching another module's files — the generator wires each one in through a
small set of comment-marker insertion points in the base files (`// @aio:xxx`) rather than the
modules editing each other's source.

### Uploads (on by default)

`multipart/form-data` handling with two pieces: a multer wrapper that turns *any* parse failure
(oversized file, malformed boundary, wrong field) into a normal validation error instead of an
unhandled crash, and a form-data validator that mirrors the JSON `validateBody` — it expects the
non-file fields as a JSON string in one `data` field alongside the file fields, which is the exact
convention the typed client's multipart builder produces, so the two sides can't drift out of
sync with each other by construction.

### Docker (on by default)

Local dev infra only — Postgres (and Redis, if that module is on) in `compose.yml`, with the app
itself running on the host via the normal dev command rather than in the compose stack, so nothing
about the fast-reload dev loop changes. A separate `Dockerfile` builds a standalone production
image of the backend, with a build context of the whole repo root (it needs to see
`packages/contracts` to install the workspace correctly) — installing only the one workspace's
dependency subgraph rather than everything in the monorepo.

### Redis cache

A response cache with two deliberate properties: it degrades instead of failing, and it invalidates
by **version counter** instead of key deletion.

*Degradation*: every public method on the cache service checks the connection is actually ready
before touching it, and is wrapped so any Redis-level error is caught and logged rather than
thrown. A cache miss and a cache *outage* look identical to the rest of the app — a request that
would've been a hit just does the real work instead. The one place this isn't true is the boot
sequence, which attempts a connection but never blocks startup on it succeeding; an app with a
completely unreachable Redis still comes up and serves (uncached) traffic.

*Invalidation*: instead of deleting the specific keys a write affects (which requires knowing
every key variant currently cached for a resource — pagination, filters, includes — or falling
back to a `SCAN`, which is expensive and racy under load), each cacheable resource has a version
counter. The data key embeds the current version as a segment; bumping the counter (`INCR`, O(1),
atomic, safe under concurrent writers) makes every previously-built key for that resource simply
stop being asked for again. They expire on their own TTL and are never explicitly deleted — a
pattern-based `SCAN`+`DELETE` still exists as an emergency-only escape hatch, not the normal path.

Reading goes through a middleware (`readCache`) that short-circuits to the cached response on a
hit and otherwise stashes the resolved cache key on `res.locals` for the controller; writing goes
through one call (`sendCached`) that both sends the response and writes it to that key, replacing
what would otherwise be a "write to cache, then remember to also respond" two-step that's easy to
half-do.

### RBAC

`User → UserRole → Role → RolePermission → Permission → (Resource × Operation)`. A permission is a
`(resource, operation)` pair (`"widgets:create"`, in effect); a role grants a set of permissions; a
user holds a set of roles. Seeding builds the full cross-product of every declared resource and
the fixed operation set (`create`/`read`/`readAll`/`update`/`delete`), then grants roles a subset
of that matrix — this module ships two starting roles (one with everything, one read-only) as an
example, not a prescription.

Enforcement is a doubly-curried middleware factory (`getDomainPermissions(resource)(action)`),
meant to be partially applied once per route file so each route only has to name the action.
Deliberately **not** included: any code that assigns a role to a user. Whether every signup gets a
default role, whether elevated roles are invite-only, whether that decision even lives in this
service at all — that's product policy, not infrastructure, and baking a guess into the generator
would be wrong far more often than it'd be right.

## The typed HTTP client

`packages/api-client` is built around one idea: every piece of runtime it needs — `fetch`,
`FormData`, a way to turn a picked file into a multipart part — is an *injected structural
interface*, never a direct import. The same client code runs unmodified in a browser, in a React
Native app, or in Node (tests, scripts) because nothing in it assumes which of those it's running
in; each environment supplies (or lets the client fall back to) its own globals.

A request function is built once (`createApiRequester(config)`) and every domain-specific client
(`createAuthClient(config)`, and whatever else a project adds) is a thin object of methods that
each call it with a path, method, and typed body — the types for all of it come from
`packages/contracts`, never redefined. Failures are normalized into one error type tagged with
*why* it failed (`"network"` — never reached a server; `"api"` — the server said no; `"parse"` — a
response that doesn't match the expected envelope at all), so a UI can show "you're offline"
differently from "that email is already registered" without parsing message strings to tell them
apart.

## The generator itself

`create-aio-app` has no dependencies — only Node builtins — so running it via `npx` is instant and
there's nothing in its own supply chain to audit. It works in four passes:

1. **Copy** the base template, then each selected module's template, into the target directory —
   later modules can overwrite files earlier ones placed (used for genuinely mutually-exclusive
   choices, like which auth transport) or add new ones (used for anything additive).
2. **Patch** — a module can ship a small JSON file describing dependencies/scripts to merge into
   an existing `package.json`, and env vars to append to an `.env.example`, without overwriting
   either file wholesale.
3. **Wire** — a module can ship a JSON file mapping a handful of lines to insert at named comment
   markers (`// @aio:xxx`) that live in the base template's files. This is how a module extends
   shared bootstrap files (the env schema, the Express app, the seed runner) without owning them
   or needing to know what any other module inserted there.
4. **Render** tokens (`{{projectName}}`, etc.) across the whole generated tree, last — so text
   inserted during the wiring pass in step 3 is just as eligible for token substitution as text
   that shipped in a template file from step 1.

The generator's own templates never reference a real product by name — they describe how to
resolve a *kind* of problem (versioned error codes, a typed pagination envelope, a cache
invalidation strategy) generically enough to be correct for a project that doesn't exist yet.
