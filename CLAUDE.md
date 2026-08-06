# CLAUDE.md — repo del framework `create-aio-app`

Este repo **no es una app** — es un generador. Produce monorepos npm workspaces (Express 5 +
Prisma + Postgres) desde cero, vía `npx packages/create-aio-app <nombre-proyecto> [flags]`.

## Qué hay acá

```
all-in-one/
├── docs/architecture.md        Fuente de verdad de la arquitectura genérica (léela antes de tocar templates/)
├── skills/init-npm-monorepo/   Skill de Claude Code, symlinkeada a ~/.claude/skills/
├── scripts/smoke.sh            Matriz de flags: genera + typecheck + levanta + curl de humo
└── packages/create-aio-app/
    ├── src/index.js            El CLI. Sin dependencias — solo node builtins.
    └── templates/
        ├── base/                Se copia siempre
        ├── auth-{bearer,cookie,both}/   Se superpone según --auth
        ├── module-redis/        Se superpone si --redis
        └── module-rbac/         Se superpone si --rbac
```

## Cómo se genera un proyecto

1. `base/` se copia entero.
2. Se superpone `auth-<elegido>/` (sobreescribe/agrega archivos).
3. Se superponen los `module-*` elegidos, en orden.
4. Render de tokens (`{{projectName}}`, etc.) sobre todo archivo de texto.
5. Cada template puede traer `_patch.json` ({deps, devDeps, env, scripts}) — se mergea sobre
   `package.json`/`.env.example` del destino en vez de sobreescribirlos.
6. Wiring por marcadores: `app.ts`/`envs.ts` del base tienen comentarios `// @aio:xxx` donde los
   módulos insertan sus líneas (ver `docs/architecture.md` § Wiring).

## Reglas al tocar `templates/`

- **Nada de referencias a proyectos, clientes o productos concretos** en ningún archivo del repo
  (templates, docs, skills, commits) — el generador debe quedar genérico y el repo es publicable.
- Todo archivo de `templates/` que en el proyecto generado deba llamarse con un nombre reservado por
  npm (`package.json`, `.gitignore`, `.env`) se guarda con un guion bajo delante (`_package.json`,
  `_gitignore`) — el CLI los renombra al copiar.
- Cambios de arquitectura van primero a `docs/architecture.md`, después a `templates/`. La skill lee
  ese doc; si diverge del código generado, la skill miente.
- Después de cualquier cambio en `templates/`, correr `npm run smoke` antes de dar el cambio por
  terminado — es el único gate real (typecheck + servidor arriba + curls).
