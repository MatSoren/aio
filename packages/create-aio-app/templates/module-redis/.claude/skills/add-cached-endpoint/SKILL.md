---
name: add-cached-endpoint
description: Use when adding Redis caching to a GET endpoint, or when adding/changing a write endpoint that needs to invalidate an already-cached read — any work touching readCache, sendCached, or cacheService.
---

# Add Cached Endpoint Skill

Workflow for wiring a `GET` endpoint to the versioned Redis cache, and for invalidating it
correctly from the write side. Read `CLAUDE.md` § Redis cache first — this skill assumes that
context (fail-open degradation, version-counter invalidation).

## Workflow

1. **Pick a resource name** — a short string identifying what's being cached (e.g. `"widgets"`),
   consistent across the read and write sides for this entity.
2. **Read side**: mount `readCache({ ttlSeconds, buildKey })` before the controller in the route
   file. `buildKey` returns `cacheService.buildVersionedKey(resource, versionOptions, keyOptions)`
   — `versionOptions.segments` is the *invalidation scope* (what a write bumps), `keyOptions`
   additionally includes params like `skip`/`take`/filters that vary the key without varying the
   invalidation scope. Return `null` from `buildKey` for any request variant you've decided not to
   cache (e.g. an uncommon `include` combination) — `readCache` bypasses cleanly.
3. In the controller, call `sendCached(res, response)` instead of `res.json(response)` — this is
   what actually writes the cache entry `readCache` set up on a miss. **This is the step most
   likely to be forgotten**: a controller behind `readCache` that still calls `res.json` directly
   will always miss, silently, because nothing ever populates the key.
4. **Write side**: in whichever controller mutates this resource, call
   `cacheService.bumpVersion(resource, { segments: [...] })` with *exactly* the same `segments`
   used as `versionOptions` on the read side — not the full key, just the invalidation scope. One
   bump invalidates every paginated/filtered variant under that scope at once.
5. If a mutation affects more than one cached scope (e.g. updating an item invalidates both its
   own detail cache and the list it appears in), bump each scope explicitly — there's no automatic
   cascade.
6. Run `npm run typecheck --workspace=apps/backend`, then exercise it manually if Redis is
   running locally: first `GET` should come back without `X-Cache`, the second with `X-Cache: HIT`,
   and after the write endpoint runs, the next `GET` should miss again.
7. Summarize: the resource name chosen, the route(s) cached, the TTL, and which write endpoint(s)
   now invalidate it.

## Guardrails

- Do not call `cacheService.setJson`/`getJson` directly from a controller for a plain HTTP
  response cache — that's what `readCache`/`sendCached` are for; reach for the raw service methods
  only for something that isn't a request/response cache (a computed value cached across requests
  for reasons other than serving it back verbatim).
- Do not reuse `deleteByPattern`/SCAN for routine invalidation — it exists as an emergency-only
  escape hatch. Routine invalidation is always `bumpVersion`.
- Do not build a cache key by hand (string concatenation) — always
  `cacheService.buildKey`/`buildVersionedKey`, so key normalization (param ordering, blank-value
  handling) stays consistent across every cached resource.
- Do not assume Redis is always available in code that isn't the cache service itself — the whole
  point of `readCache`/`cacheService` is that the rest of the app never has to check; don't add a
  second "is Redis up" check somewhere else.
