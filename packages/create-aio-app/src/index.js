#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { copyTemplateDir, renderTokens } from "./lib/fsops.js";
import { applyWiring } from "./lib/wiring.js";
import { applyPatch } from "./lib/patch.js";
import { promptSelect, promptText, promptYesNo } from "./lib/prompt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

const AUTH_OPTIONS = [
  { value: "bearer", label: "Bearer (Authorization header)", hint: "web + mobile + sockets con el mismo código" },
  { value: "cookie", label: "Cookies httpOnly", hint: "solo web, protege mejor contra XSS" },
  { value: "both", label: "Ambos", hint: "acepta el que llegue primero" },
];

function parseArgs(argv) {
  const flags = { redis: false, rbac: false, docker: true, yes: false, skipInstall: false, skipGit: false };
  const positional = [];
  for (const arg of argv) {
    if (arg === "--redis") flags.redis = true;
    else if (arg === "--rbac") flags.rbac = true;
    else if (arg === "--no-docker") flags.docker = false;
    else if (arg === "--yes" || arg === "-y") flags.yes = true;
    else if (arg === "--skip-install") flags.skipInstall = true;
    else if (arg === "--skip-git") flags.skipGit = true;
    else if (arg.startsWith("--auth=")) flags.auth = arg.slice("--auth=".length);
    else if (arg.startsWith("--db-name=")) flags.dbName = arg.slice("--db-name=".length);
    else if (arg.startsWith("--scope=")) flags.scope = arg.slice("--scope=".length);
    else if (arg.startsWith("--dir=")) flags.dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--")) {
      console.warn(`Flag desconocida ignorada: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  flags.projectName = positional[0];
  return flags;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveOptions(flags) {
  const projectName =
    flags.projectName ?? (flags.yes ? "my-app" : await promptText("Nombre del proyecto", "my-app"));

  const auth =
    flags.auth ??
    (flags.yes ? "bearer" : await promptSelect("¿Cómo viaja el token de autenticación?", AUTH_OPTIONS, 0));
  if (!AUTH_OPTIONS.some((o) => o.value === auth)) {
    throw new Error(`--auth debe ser uno de: ${AUTH_OPTIONS.map((o) => o.value).join(", ")}`);
  }

  const redis =
    flags.redis || (flags.yes ? false : await promptYesNo("¿Agregar cache versionado con Redis?", false));
  const rbac =
    flags.rbac || (flags.yes ? false : await promptYesNo("¿Agregar RBAC (roles/permisos)?", false));
  const docker = flags.docker; // ya viene resuelto de --no-docker, sin prompt (on por defecto)

  const dbName = flags.dbName ?? slugify(projectName).replace(/-/g, "_");
  const scope = flags.scope ?? "packages";

  return { projectName, auth, redis, rbac, docker, dbName, scope };
}

// Order matters: module-docker must land before module-redis, because redis's _wiring.json
// patches compose.yml (which only exists once docker's overlay has been copied). Any future
// module that wires into a file another module creates needs the creator listed first here too.
function overlaysFor(options) {
  const overlays = [
    path.join(TEMPLATES_DIR, "base"),
    path.join(TEMPLATES_DIR, "module-uploads"),
    path.join(TEMPLATES_DIR, `auth-${options.auth}`),
  ];
  if (options.docker) overlays.push(path.join(TEMPLATES_DIR, "module-docker"));
  if (options.redis) overlays.push(path.join(TEMPLATES_DIR, "module-redis"));
  if (options.rbac) overlays.push(path.join(TEMPLATES_DIR, "module-rbac"));
  return overlays;
}

function scaffold(destRoot, options) {
  fs.mkdirSync(destRoot, { recursive: true });

  for (const overlayDir of overlaysFor(options)) {
    copyTemplateDir(overlayDir, destRoot);
    applyPatch(destRoot, path.join(overlayDir, "_patch.json"));
    applyWiring(destRoot, path.join(overlayDir, "_wiring.json"));
  }

  const tokens = {
    projectName: options.projectName,
    scope: options.scope,
    dbName: options.dbName,
  };
  renderTokens(destRoot, tokens);
}

function runBestEffort(cmd, args, cwd, label) {
  try {
    execFileSync(cmd, args, { cwd, stdio: "inherit" });
    return true;
  } catch (error) {
    console.warn(`\n⚠ ${label} falló (podés correrlo a mano después): ${error.message}`);
    return false;
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const options = await resolveOptions(flags);
  const destRoot = path.resolve(process.cwd(), flags.dir ?? options.projectName);

  if (fs.existsSync(destRoot) && fs.readdirSync(destRoot).length > 0) {
    console.error(`✗ ${destRoot} ya existe y no está vacío.`);
    process.exit(1);
  }

  console.log(`\nGenerando ${options.projectName} en ${destRoot}`);
  console.log(`  auth=${options.auth}  redis=${options.redis}  rbac=${options.rbac}  docker=${options.docker}\n`);

  scaffold(destRoot, options);

  if (!flags.skipGit) runBestEffort("git", ["init", "-q"], destRoot, "git init");
  if (!flags.skipInstall) {
    const installed = runBestEffort("npm", ["install"], destRoot, "npm install");
    if (installed) {
      runBestEffort(
        "npm",
        ["run", "generate", "--workspace=apps/backend"],
        destRoot,
        "prisma generate",
      );
    }
  }

  console.log(`\n✓ Listo. Próximos pasos:\n`);
  console.log(`  cd ${path.relative(process.cwd(), destRoot) || "."}`);
  if (flags.skipInstall) console.log(`  npm install`);
  console.log(`  cp apps/backend/.env.example apps/backend/.env   # completar secrets`);
  if (options.docker) console.log(`  docker compose up -d`);
  console.log(`  npm run migrate --workspace=apps/backend`);
  console.log(`  npm run dev:api\n`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
