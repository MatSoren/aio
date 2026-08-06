import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// readline/promises' `question()` never settles if the input stream hits EOF before an answer is
// typed (e.g. stdin is /dev/null, or piped from a non-interactive process) — the process then
// just exits once the event loop has nothing else to do, silently abandoning the CLI mid-prompt.
// Guarding on `isTTY` turns that into an explicit, loud fallback to the default instead.
const isInteractive = () => Boolean(stdin.isTTY);

export async function promptSelect(question, options, defaultIndex = 0) {
  console.log(question);
  options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt.label}${opt.hint ? `  — ${opt.hint}` : ""}`));

  if (!isInteractive()) {
    console.log(`(no interactive terminal — using default: ${options[defaultIndex].label})`);
    return options[defaultIndex].value;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`Elegí [1-${options.length}] (default ${defaultIndex + 1}): `);
    const trimmed = answer.trim();
    if (trimmed === "") return options[defaultIndex].value;
    const index = Number.parseInt(trimmed, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < options.length) {
      return options[index].value;
    }
    console.log("Opción inválida, uso el default.");
    return options[defaultIndex].value;
  } finally {
    rl.close();
  }
}

export async function promptText(question, defaultValue) {
  if (!isInteractive()) {
    console.log(`${question}: (no interactive terminal — using default: ${defaultValue})`);
    return defaultValue;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const suffix = defaultValue ? ` (default: ${defaultValue})` : "";
    const answer = await rl.question(`${question}${suffix}: `);
    const trimmed = answer.trim();
    return trimmed === "" ? defaultValue : trimmed;
  } finally {
    rl.close();
  }
}

export async function promptYesNo(question, defaultValue = true) {
  if (!isInteractive()) {
    console.log(`${question}: (no interactive terminal — using default: ${defaultValue ? "yes" : "no"})`);
    return defaultValue;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const hint = defaultValue ? "Y/n" : "y/N";
    const answer = await rl.question(`${question} [${hint}]: `);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "") return defaultValue;
    return trimmed === "y" || trimmed === "yes" || trimmed === "s" || trimmed === "si";
  } finally {
    rl.close();
  }
}
