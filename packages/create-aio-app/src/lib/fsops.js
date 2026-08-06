import fs from "node:fs";
import path from "node:path";

// Filenames that can't live literally inside `templates/` without side effects
// (a real `package.json` there would read as a second package.json to editors/npm
// tooling walking the tree; a real `.gitignore` there would silently start excluding
// files from *this* repo's git, not the generated project's). Prefixed with `_` in the
// template source, renamed on copy.
const RENAME_MAP = {
  _gitignore: ".gitignore",
  "_package.json": "package.json",
  "_env.example": ".env.example",
  _env: ".env",
  "_eslintrc.cjs": ".eslintrc.cjs",
  _dockerignore: ".dockerignore",
  _npmrc: ".npmrc",
};

export function renameTemplateBasename(basename) {
  if (RENAME_MAP[basename]) return RENAME_MAP[basename];
  if (basename.startsWith("_")) return basename.slice(1);
  return basename;
}

/** Recursively copies `srcDir` into `destDir`, applying {@link renameTemplateBasename}
 * to every path segment and skipping template-only control files (`_patch.json`,
 * `_wiring.json`). Overlay semantics: existing files at the destination are overwritten. */
export function copyTemplateDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === "_patch.json" || entry.name === "_wiring.json") continue;
    const destName = renameTemplateBasename(entry.name);
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, destName);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplateDir(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"]);

/** Walks the generated project and replaces `{{token}}` placeholders in every text file. */
export function renderTokens(rootDir, tokens) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (BINARY_EXTENSIONS.has(path.extname(entry.name))) continue;
      const original = fs.readFileSync(p, "utf8");
      const rendered = original.replace(/\{\{(\w+)\}\}/g, (match, key) =>
        Object.hasOwn(tokens, key) ? String(tokens[key]) : match,
      );
      if (rendered !== original) fs.writeFileSync(p, rendered);
    }
  }
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
