# Backend API image. Build context = repo root (`docker build -f Dockerfile .`).
#
# ponytail: runs via tsx (same runtime as `npm run dev`) instead of the tsup bundle. esbuild (what
# tsup uses) only bundles node_modules deps, and a symlinked npm-workspace package like
# @{{scope}}/contracts still lives in node_modules, so tsup leaves it external — `node dist/index.js`
# alone can't resolve that raw .ts import with no loader in front of it. Fix tsup to bundle
# workspace deps if a leaner production image ever matters.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY packages ./packages

# --include=dev is required: most deploy platforms (Coolify, Railway, ...) inject
# NODE_ENV=production at build time, which makes `npm ci` skip devDependencies — but the app runs
# via tsx, itself a devDependency (see CMD below). Without dev deps the container has no runtime
# and crashes at startup.
RUN npm ci --include=dev --workspace=apps/backend --include-workspace-root

WORKDIR /app/apps/backend
RUN npx prisma generate

EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
