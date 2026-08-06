// Minimal structured logger: one JSON line per event, greppable/parseable in any log aggregator
// without pulling in a logging framework.
// ponytail: thin console wrapper; swap for pino (or similar) if you need log shipping, sampling,
// or child loggers.
type Level = "info" | "warn" | "error";
type Meta = Record<string, unknown>;

const emit = (level: Level, scope: string, msg: string, meta?: Meta): void => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...(meta ?? {}) });
  console[level === "info" ? "log" : level](line);
};

export const logger = (scope: string) => ({
  info: (msg: string, meta?: Meta) => emit("info", scope, msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", scope, msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", scope, msg, meta),
});
