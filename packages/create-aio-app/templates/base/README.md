# {{projectName}}

npm workspaces monorepo generado con `create-aio-app` (Express 5 + Prisma + Postgres).

Ver **`CLAUDE.md`** para la arquitectura completa: estructura de carpetas, pipeline de request,
sistema de errores, contracts, y las convenciones para agregar endpoints.

## Arranque rápido

```bash
cp apps/backend/.env.example apps/backend/.env   # completar secrets
docker compose up -d                             # si el proyecto incluye Docker
npm install
npm run migrate --workspace=apps/backend
npm run dev:api
```

`GET /api/v1/health` debería responder `{"success":true,"data":{"status":"ok"}}`.
