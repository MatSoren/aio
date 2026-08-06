import fs from "node:fs";
import path from "node:path";

/**
 * Applies a template's `_patch.json` to the already-copied destination tree.
 *
 * Shape:
 * ```json
 * {
 *   "workspaces": {
 *     "apps/backend": { "dependencies": {}, "devDependencies": {}, "scripts": {} }
 *   },
 *   "env": {
 *     "apps/backend/.env.example": { "REDIS_URL": "redis://localhost:6379" }
 *   }
 * }
 * ```
 * `workspaces` merges into each target's `package.json` (patch wins on key conflicts).
 * `env` appends `KEY=value` lines to the target file, skipping keys already present.
 */
export function applyPatch(destRoot, patchFilePath) {
  if (!fs.existsSync(patchFilePath)) return;
  const patch = JSON.parse(fs.readFileSync(patchFilePath, "utf8"));

  for (const [relDir, changes] of Object.entries(patch.workspaces ?? {})) {
    const pkgPath = path.join(destRoot, relDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    for (const field of ["dependencies", "devDependencies", "scripts"]) {
      if (!changes[field]) continue;
      pkg[field] = { ...(pkg[field] ?? {}), ...changes[field] };
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  for (const [relFile, vars] of Object.entries(patch.env ?? {})) {
    const filePath = path.join(destRoot, relFile);
    let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    const existingKeys = new Set(
      content
        .split("\n")
        .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
        .filter(Boolean),
    );
    const newLines = Object.entries(vars)
      .filter(([key]) => !existingKeys.has(key))
      .map(([key, value]) => `${key}=${value}`);
    if (newLines.length === 0) continue;
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += newLines.join("\n") + "\n";
    fs.writeFileSync(filePath, content);
  }
}
