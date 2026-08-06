import fs from "node:fs";
import path from "node:path";

/**
 * Applies a template's `_wiring.json` to already-copied files in the generated project.
 *
 * Shape: `{ "<relative/path/to/file>": { "@aio:markerName": ["line one", "line two"] } }`.
 * Each target file must contain a standalone comment line `// @aio:markerName` (or `#
 * @aio:markerName` for YAML) — inserted lines are spliced in directly below it, and the
 * marker line itself is left in place so later modules can insert at the same spot.
 */
export function applyWiring(destRoot, wiringFilePath) {
  if (!fs.existsSync(wiringFilePath)) return;
  const wiring = JSON.parse(fs.readFileSync(wiringFilePath, "utf8"));

  for (const [relPath, markers] of Object.entries(wiring)) {
    const filePath = path.join(destRoot, relPath);
    if (!fs.existsSync(filePath)) {
      console.warn(`[wiring] ${relPath} does not exist, skipping (from ${wiringFilePath})`);
      continue;
    }
    let content = fs.readFileSync(filePath, "utf8");

    for (const [marker, lines] of Object.entries(markers)) {
      if (!lines || lines.length === 0) continue;
      const lineIndex = findMarkerLine(content, marker);
      if (lineIndex === -1) {
        console.warn(`[wiring] marker ${marker} not found in ${relPath}, skipping`);
        continue;
      }
      const insertion = "\n" + lines.join("\n");
      content = content.slice(0, lineIndex) + insertion + content.slice(lineIndex);
    }
    fs.writeFileSync(filePath, content);
  }
}

/** Returns the string index right after the newline that ends the marker's own line.
 * Accepts `// marker`, `# marker` (YAML/env), and `<!-- marker -->` (Markdown). */
function findMarkerLine(content, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^.*(?:\\/\\/|#|<!--)\\s*${escaped}\\s*(?:-->)?\\s*$`, "m");
  const match = re.exec(content);
  if (!match) return -1;
  const lineEnd = content.indexOf("\n", match.index);
  return lineEnd === -1 ? content.length : lineEnd;
}
