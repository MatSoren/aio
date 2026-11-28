#!/usr/bin/env bash
# End-to-end smoke test for the create-aio-app generator.
#
# For each flag combination in COMBOS: generates a project, installs it, typechecks every
# workspace, then boots it against real (throwaway, Dockerized) Postgres + Redis and hits it with
# curl to prove the error envelope actually works — the one thing that's easy to get structurally
# right in templates/ and still ship broken (see the framework's own CLAUDE.md on why).
#
# Usage: npm run smoke   (from the repo root)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/packages/create-aio-app/src/index.js"
WORK_DIR="$ROOT_DIR/.smoke"
PG_PORT=54329
REDIS_PORT=63799
PG_CONTAINER="aio-smoke-pg"
REDIS_CONTAINER="aio-smoke-redis"

# name:auth:redis:rbac:docker
COMBOS=(
  "bearer-app:bearer:0:0:1"
  "cookie-redis-rbac-app:cookie:1:1:1"
  "both-app:both:0:0:0"
)

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

cleanup() {
  docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

npm_install() {
  local dir="$1"
  # Some environments (sandboxed CI, this one included) block install scripts by default via a
  # global npm allow-scripts policy — bcrypt's native binding and Prisma's engine download both
  # need one. Retry with it explicitly allowed only if the plain install actually got blocked;
  # on a normal machine this second call never runs.
  if ! (cd "$dir" && npm install 2>&1 | tee /tmp/aio-smoke-install.log) ; then
    fail "npm install failed in $dir"
  fi
  if grep -q "install-scripts" /tmp/aio-smoke-install.log; then
    (cd "$dir" && npm rebuild --dangerously-allow-all-scripts) || fail "npm rebuild failed in $dir"
  fi
}

wait_for_http() {
  local url="$1"
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null "$url"; then return 0; fi
    sleep 0.5
  done
  fail "server never came up at $url"
}

# Asserts a curl response's HTTP status code. Body is left in $BODY for further checks.
assert_status() {
  local expected="$1"; shift
  BODY="$(curl -s -w '\n%{http_code}' "$@")"
  local status="${BODY##*$'\n'}"
  BODY="${BODY%$'\n'*}"
  [ "$status" = "$expected" ] || fail "expected HTTP $expected, got $status — body: $BODY"
}

for combo in "${COMBOS[@]}"; do
  IFS=':' read -r name auth redis rbac docker <<< "$combo"
  proj="$WORK_DIR/$name"

  log "$name (auth=$auth redis=$redis rbac=$rbac docker=$docker)"

  args=(--auth="$auth" --skip-git --skip-install)
  [ "$redis" = "1" ] && args+=(--redis)
  [ "$rbac" = "1" ] && args+=(--rbac)
  [ "$docker" = "0" ] && args+=(--no-docker)

  node "$CLI" "$name" "${args[@]}" --dir="$proj" >/dev/null
  ok "generated"

  # Structural checks that don't need a DB: no leftover template artifacts.
  if grep -rl '{{' "$proj" --include='*.ts' --include='*.json' --include='*.md' --include='*.yml' >/dev/null 2>&1; then
    fail "unrendered {{token}} left in $name"
  fi
  if find "$proj" -name '_*' -not -path '*/node_modules/*' | grep -q .; then
    fail "un-renamed _file left in $name"
  fi
  if [ "$docker" = "1" ] && [ ! -f "$proj/compose.yml" ]; then fail "docker=1 but no compose.yml"; fi
  if [ "$docker" = "0" ] && [ -f "$proj/compose.yml" ]; then fail "docker=0 but compose.yml exists"; fi
  ok "structural checks"

  npm_install "$proj"
  ok "npm install"

  (cd "$proj" && npx prisma generate --schema=apps/backend/prisma) >/dev/null 2>&1 \
    || fail "prisma generate failed"
  ok "prisma generate"

  (cd "$proj" && npm run typecheck) || fail "typecheck failed"
  ok "typecheck (all workspaces)"

  # --- runtime: real Postgres (+ Redis if this combo has it) ---
  docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$PG_CONTAINER" -p "$PG_PORT:5432" \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=smoke \
    postgres:16 >/dev/null
  if [ "$redis" = "1" ]; then
    docker run -d --name "$REDIS_CONTAINER" -p "$REDIS_PORT:6379" redis:7-alpine >/dev/null
  fi
  for _ in $(seq 1 30); do
    docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done

  cat > "$proj/apps/backend/.env" <<EOF
NODE_ENV=development
PORT=3299
DATABASE_URL=postgresql://postgres:postgres@localhost:$PG_PORT/smoke
DATABASE_SSL=false
CORS_ALLOWED_ORIGINS=http://localhost:5173
JWT_ACCESS_SECRET=smoke-test-access-secret-0000000000
JWT_REFRESH_SECRET=smoke-test-refresh-secret-0000000000
JWT_ACCESS_EXPIRATION=900
JWT_REFRESH_EXPIRATION=2592000
REDIS_URL=redis://localhost:$REDIS_PORT
UPLOADS_DIR=uploads
EOF

  (cd "$proj/apps/backend" && npx prisma migrate dev --name init --schema=prisma) >/dev/null \
    || fail "migrate failed"
  ok "migrated"

  (cd "$proj/apps/backend" && npx tsx src/seeds/index.ts) >/dev/null || fail "seed failed"
  ok "seeded"

  (cd "$proj/apps/backend" && npx tsx src/index.ts) >/tmp/aio-smoke-server.log 2>&1 &
  SERVER_PID=$!
  wait_for_http "http://localhost:3299/api/v1/health"

  assert_status 200 "http://localhost:3299/api/v1/health"
  echo "$BODY" | grep -q '"success":true' || fail "health did not return success:true"

  assert_status 201 -X POST "http://localhost:3299/api/v1/auth/register" \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke@example.com","password":"supersecret123"}'
  echo "$BODY" | grep -q '"success":true' || fail "register did not return success:true"

  # Email normalization: same account with different casing/whitespace. The cookie jar keeps this
  # login's refresh cookie for the rotation check below (cookie transport).
  OLD_JAR="$WORK_DIR/$name.old.jar"
  assert_status 200 -X POST "http://localhost:3299/api/v1/auth/login" -c "$OLD_JAR" \
    -H 'Content-Type: application/json' \
    -d '{"email":"  Smoke@Example.COM ","password":"supersecret123"}'
  echo "$BODY" | grep -q '"success":true' || fail "login with a differently-cased email failed"

  # Refresh rotation: the first refresh with the old token succeeds, a replay of it is rejected.
  if [ "$auth" = "cookie" ]; then
    refresh_old=(-b "$OLD_JAR")
  else
    old_rt="$(echo "$BODY" | sed -n 's/.*"refreshToken":"\([^"]*\)".*/\1/p')"
    [ -n "$old_rt" ] || fail "login body has no refreshToken"
    refresh_old=(-H 'Content-Type: application/json' -d "{\"refreshToken\":\"$old_rt\"}")
  fi
  assert_status 200 -X POST "http://localhost:3299/api/v1/auth/refresh" "${refresh_old[@]}"
  assert_status 401 -X POST "http://localhost:3299/api/v1/auth/refresh" "${refresh_old[@]}"
  echo "$BODY" | grep -q '"code":"INVALID_REFRESH_TOKEN"' || fail "replayed refresh token was not rejected"
  ok "auth verified: case-insensitive login, rotated refresh token rejected on replay"

  assert_status 400 -X POST "http://localhost:3299/api/v1/auth/login" \
    -H 'Content-Type: application/json' -d '{"email":"not-an-email"}'
  echo "$BODY" | grep -q '"code":"INVALID_BODY"' || fail "malformed login did not return INVALID_BODY"

  assert_status 404 "http://localhost:3299/api/v1/nope"
  echo "$BODY" | grep -q '"success":false' || fail "unknown route did not return the ApiResponse envelope"
  ok "error envelope verified: 200 / 201 / 400 INVALID_BODY / 404 all through ApiResponse"

  kill "$SERVER_PID" 2>/dev/null || true
  unset SERVER_PID

  if [ "$redis" = "1" ]; then
    (cd "$proj/apps/backend" && npx tsx -e "
      import { redis, connectRedis } from './src/config/redis';
      import { cacheService } from './src/services/cache.service';
      (async () => {
        await connectRedis();
        if (!redis.isReady) throw new Error('redis not ready');
        const key = cacheService.buildKey('smoke', { segments: ['list'] });
        await cacheService.setJson(key, { ok: true }, { ttlSeconds: 30 });
        const got = await cacheService.getJson<{ ok: boolean }>(key);
        if (!got?.ok) throw new Error('cache round-trip failed');
        const v0 = await cacheService.getVersion('smoke');
        const v1 = await cacheService.bumpVersion('smoke');
        if (v1 !== v0 + 1) throw new Error('version bump did not increment');
        try {
          cacheService.buildKey('');
          throw new Error('buildKey(\"\") should have thrown');
        } catch (e) {
          if (!(e instanceof Error) || !e.message.includes('required')) throw e;
        }
        await redis.quit();
        console.log('cache smoke ok');
      })();
    ") || fail "redis cache smoke failed"
    ok "redis cache verified: round-trip, version bump, empty-resource guard"
  fi

  docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  ok "$name passed"
done

rm -rf "$WORK_DIR"
log "All combinations passed."
