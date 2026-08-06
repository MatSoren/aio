# CLAUDE.md

Guía de arquitectura para trabajar en este repo. Generado por `create-aio-app`; todo lo de acá es
código propio del proyecto (no hay dependencia runtime del generador) — editalo con confianza.

## Estructura del monorepo

npm workspaces:

```
{{projectName}}/
├── apps/
│   └── backend/          Express 5 API (TypeScript, Prisma, PostgreSQL)
└── packages/
    ├── contracts/        Tipos, schemas zod y códigos de error compartidos
    └── api-client/        Cliente HTTP tipado, consumible desde cualquier front
```

Regla dura: **usar siempre `-w`/`--workspace`, nunca `cd` a mano** para instalar o correr comandos
de un workspace puntual (`npm install <pkg> --workspace=apps/backend`).

## Comandos

```bash
npm run dev:api            # backend en watch mode (tsx)
npm run build:api          # tsc --noEmit + bundle a dist/
npm run typecheck          # tsc --noEmit en todos los workspaces — el gate principal, no hay test runner por defecto
npm run migrate            # prisma migrate dev
npm run generate           # regenerar el cliente de Prisma
npm run update-db          # migrate + generate, correr después de tocar el schema
npm run studio             # Prisma Studio
npm run seed               # apps/backend/src/seeds/index.ts
```

Instalar un paquete en un workspace puntual:

```bash
npm install <pkg> --workspace=apps/backend
npm install <pkg> --workspace=packages/contracts
```

## Arquitectura del backend

Capas: `routes → middlewares → controllers → services → Prisma`. Todo bajo `/api/v1/*`
(`src/routes/index.routes.ts` → `v1.routes.ts` → un router por dominio). Cada nivel es un
`Router()` con `export default`, un archivo por dominio.

### Bootstrap

`src/index.ts` llama `initApp()` en `src/app.ts`, que arma el `express()`, monta los middlewares
globales, monta `/api`, y devuelve `{ app, server }` (necesario para tests con supertest y para el
shutdown ordenado por `SIGTERM`/`SIGINT` — `server.close()` + `prisma.$disconnect()`).

Orden de middlewares globales: `cors` (allowlist desde env) → `express.json()`
<!-- @aio:claude-bootstrap-order -->
→ router `/api` → **`errorHandler`** (siempre al final, después de las rutas) → 404 handler.

> El `errorHandler` tiene que estar montado para que el sistema de errores funcione — un error
> lanzado sin `errorHandler` montado cae en el handler default de Express (HTML, no `ApiResponse`).

### `res.locals` como canal tipado del pipeline

Los middlewares **no** escriben en `req.body`: escriben en `res.locals`, y el controller lee de ahí
con el tipo garantizado por el middleware anterior. Esto es lo que permite que un controller nunca
tenga que re-validar ni re-parsear nada.

`src/types/ResponseLocals.ts`:

```ts
export interface ResponseLocals<T = null> {
  input: T;
  queryParams?: Record<string, unknown>;
  page?: { skip: number; take: number };
}
```

`src/types/ControllerEndpoint.ts` define el contrato de handler:

```ts
export type Endpoint<TResponse = null, TInput = null> = (
  req: Request,
  res: Response<ApiResponse<TResponse>, ResponseLocals<TInput>>,
) => void | Promise<void>;
```

Uso en un controller:

```ts
const create: Endpoint<PublicWidget, CreateWidgetBody> = async (_req, res) => {
  const input = res.locals.input; // tipado como CreateWidgetBody, ya validado
  const widget = await prisma.widget.create({ data: input });
  res.json({ success: true, data: widget });
};
```

<!-- @aio:claude-auth -->

### Middlewares de request

| Middleware | Qué hace | Dónde |
|---|---|---|
| `validateBody(schema)` | `zod.safeParse(req.body)` → `res.locals.input`, o 400 `INVALID_BODY` | `src/middlewares/validateBody.ts` |
| `validateQuery(schema)` | Igual que arriba pero sobre `req.query` → `res.locals.queryParams` | `src/middlewares/queryValidator.ts` |
| `parsePagination` | `skip`/`take` de query → `res.locals.page`, con defaults | `src/middlewares/paginationValidator.ts` |
| `validateFormData(schema, opts)` | Body `multipart/form-data`: JSON en el campo `data` + archivos en `fileFields` → `res.locals.input` | `src/middlewares/formDataValidator.ts` |
| `errorHandler` | Último middleware montado; serializa cualquier error a `ApiResponse` | `src/middlewares/errorHandler.ts` |

Los schemas de `validateBody`/`validateQuery` **siempre vienen de `packages/contracts`**, nunca se
definen localmente en el backend — así el mismo schema tipa el request en el cliente HTTP.

### Sistema de errores (dos capas)

Nunca se lanza `new AppError(...)` directo — siempre `appErrorFactory({ errorCode })`:

```ts
throw appErrorFactory({ errorCode: ErrorCode.ENTITY_NOT_FOUND });
throw appErrorFactory({ errorCode: ErrorCode.ENTITY_NOT_FOUND, statusCode: 404, details: { id } }); // override
```

La razón de las dos capas: **contracts no sabe de HTTP**, así un front puede importar `ErrorCode`
sin arrastrar mensajes ni status codes pensados para el backend.

- **`packages/contracts/src/error/`** — un archivo por categoría, cada uno `as const` + tipo union
  derivado. `error/index.ts` mergea todas las categorías en el `ErrorCode` final (que es **valor y
  tipo a la vez**, gracias a declaration merging: `ErrorCode.ENTITY_NOT_FOUND` y `errorCode: ErrorCode`
  compilan los dos). Solo códigos — sin mensaje, sin status.
- **`apps/backend/src/utils/errors/`** — un archivo por categoría con `{ status, message }` para cada
  código de esa categoría. `errors/index.ts` mergea todo con
  `as const satisfies Record<ErrorCode, ErrorDefinition>` — **agregar un código en contracts sin su
  definición acá rompe el build** (y viceversa: definir un status para un código que no existe en
  contracts también). Es el gate real de este patrón, más fuerte que cualquier test.

Para agregar un error nuevo: código en la categoría que corresponda dentro de `packages/contracts/src/error/`,
`{status, message}` en la categoría equivalente de `apps/backend/src/utils/errors/`. Ninguna de las
dos mitades es opcional.

`errorHandler` (`src/middlewares/errorHandler.ts`) resuelve cualquier error lanzado, en orden:
1. `AppError` → se usa tal cual.
2. Error de Prisma (`isPrismaError` + `mapPrismaCodes.ts`, ~15 códigos `P20xx` → `AppError`).
3. Cualquier otro error → status inferido por duck-typing (`statusCode`/`status`/`output.statusCode`,
   cubre errores de librerías de terceros) + `ErrorCode.INTERNAL_SERVER_ERROR`.

Responde siempre el mismo envelope (`packages/contracts/src/common/api-response.ts`):

```ts
export type ApiResponse<T = null> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: ErrorCode; details?: unknown }; stack?: string };
```

`stack` solo viaja en development. Express 5 captura automáticamente cualquier throw dentro de un
handler `async` — por eso no hace falta envolver los controllers en un `asyncHandler`, siempre y
cuando `errorHandler` esté montado.

### Base de datos — Prisma

`src/config/database.ts` exporta un **singleton** de `PrismaClient` (module-caching de ESM alcanza:
`tsx watch` reinicia el proceso entero en cada cambio, así que no hace falta el guard de
`globalThis` que sí necesitarías bajo HMR de un bundler). Usa el driver adapter `@prisma/adapter-pg`
(sin engine binario) y un `omit` global para nunca filtrar campos sensibles por accidente:

```ts
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: appEnv.db.url }),
  omit: { user: { password: true } },
});
```

Un controller que sí necesita el campo omitido lo re-pide explícitamente con `select`.

**Schema multi-archivo**: `prisma.config.ts` apunta `schema: "prisma"` a una *carpeta*, no a un
archivo — Prisma concatena todos los `.prisma` que encuentra recursivamente ahí debajo. Por eso
`prisma/schema.prisma` solo tiene `generator` + `datasource`; cada modelo vive en su propio archivo
bajo `prisma/models/`, y las tablas de join / con múltiples FKs bajo `prisma/relations/`. El
generator es `prisma-client` (no `prisma-client-js`) con output a `generated/`, importado desde el
alias `@generated/*` — esa carpeta está en `.gitignore`, se regenera con `npm run generate`.

### Variables de entorno

`src/config/envs.ts` valida todo con un schema zod al importar el módulo — **fail-fast**: si falta
una variable requerida, el proceso no arranca (nunca llega a `app.listen`). El objeto exportado está
agrupado por dominio:

```ts
export const appEnv = {
  app: { port, nodeEnv },
  db: { url },
  cors: { allowedOrigins },
  auth: { accessSecret, refreshSecret, accessExpiration, refreshExpiration },
  // + un grupo más por cada módulo opcional habilitado (redis, uploads, ...) — ver envs.ts
};
```

Regla: **usar siempre `appEnv.x.y`, nunca `process.env` directo** en ningún otro archivo del backend.
`.env.example` documenta cada variable requerida; copiarlo a `.env` es el primer paso de setup.

### TypeScript path aliases (`apps/backend/tsconfig.json`)

```
@config/*        → ./src/config/*
@controllers/*    → ./src/controllers/*
@middlewares/*    → ./src/middlewares/*
@services/*       → ./src/services/*
@utils/*          → ./src/utils/*
@generated/*      → ./generated/*
```

No hay `@schemas/*`: los schemas zod viven en `packages/contracts`, no en el backend — un endpoint
nuevo importa su schema de ahí en vez de definirlo localmente.

## `packages/contracts`

Se consume como **TypeScript crudo**, sin build: `package.json` tiene `main`/`types`/`exports`
apuntando a `src/index.ts`. Un cambio ahí se ve inmediatamente en el backend (vía `tsx watch`, que
resuelve el symlink de npm workspaces) sin correr nada — **no conviertas este paquete en uno que
compila a `dist/`**: es la diferencia entre "cambio un contrato y sigo trabajando" y "cambio un
contrato, me acuerdo de buildear, y todavía tengo el cliente HTTP viejo en memoria".

Convención por entidad (un archivo por dominio, con barrel `index.ts`):

| Schema | Rol |
|---|---|
| `<Entity>Schema` | create / write, `.strict()` |
| `<Entity>PatchSchema` | `= <Entity>Schema.partial()`, para PATCH |
| `Public<Entity>Schema` | lo que se devuelve en las respuestas — filtra campos internos |
| `<Entity>QuerySchema` | `= PaginationQuerySchema.extend({...})` |

Los tipos **siempre se derivan con `z.infer<typeof Schema>`**, nunca se escriben a mano — así el
tipo y la validación en runtime no pueden divergir.

`src/common/serialized.ts` exporta `SerializeDates<T>`: convierte recursivamente todo `Date` en
`string` — es el puente entre el dominio del backend (`Date`) y el transporte JSON (ISO string). Un
`PublicXResponse` que serializa un modelo Prisma con campos `Date` se tipa
`SerializeDates<PublicX>`.

## `packages/api-client`

Cliente HTTP tipado, pensado para funcionar igual en un browser (Vite/React), en Node (tests,
scripts) o en un runtime que no tiene `fetch` global — el runtime está **inyectado por interfaz**
(`FetchLike`), no importado directo, así que no hay que tocar el cliente para portarlo a un entorno
nuevo.

```ts
import { createApiRequester } from "@{{scope}}/api-client";
import type { LoginRequest, LoginResponse } from "@{{scope}}/contracts";

const request = createApiRequester({ baseUrl: "http://localhost:3000" });

const login = (body: LoginRequest) =>
  request<LoginResponse, LoginRequest>({ path: "/api/v1/auth/login", method: "POST", body });
```

Un request fallido lanza `ApiClientError` con `kind: "api" | "network" | "parse"` — la UI puede
distinguir "el backend rechazó la request" de "no hay conexión" de "la respuesta no matcheaba el
contrato esperado", sin parsear mensajes de error a mano.

## Convención para agregar un endpoint

1. Definir el contrato en `packages/contracts/src/<dominio>/`: `<Entity>Schema` (+ `Patch`/`Public`/
   `Query` según aplique) y los tipos derivados por `z.infer`.
2. Si el modelo es nuevo, agregarlo en `apps/backend/prisma/models/` y correr `npm run update-db`.
3. Controller en `apps/backend/src/controllers/`, tipado con `Endpoint<TResponse, TInput>`, leyendo
   solo de `res.locals`.
4. Ruta en `apps/backend/src/routes/v1/`: `[auth?] → [validateBody/validateQuery(schema)] → controller`.
5. Si el error necesita un código nuevo: agregarlo en contracts *y* su definición en backend (§ Sistema
   de errores) — las dos mitades, o no compila.
6. `npm run typecheck`.

## Testing

No hay test runner instalado por defecto. La convención (cuando haga falta un test) es un módulo
puro sin I/O + un `*.test.ts` colocado al lado que usa `node:assert` y se corre con
`npx tsx archivo.test.ts` — sin framework, sin fixtures. Sirve para lógica de dominio (mapeo de
filtros, máquinas de estado, cálculos) que no depende de Prisma ni de Express.

<!-- @aio:claude-modules -->
