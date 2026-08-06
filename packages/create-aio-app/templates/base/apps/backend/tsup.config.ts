import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2023",
  outDir: "dist",
  clean: true,
  tsconfig: "tsconfig.json",
});
