import { createServer, type Server } from "node:http";
import express, { type Express } from "express";
import cors from "cors";
import { appEnv } from "@config/envs";
import apiRoutes from "./routes/index.routes";
import { errorHandler } from "@middlewares/errorHandler";
import { notFoundHandler } from "@middlewares/notFoundHandler";
// @aio:app-import

export interface App {
  app: Express;
  server: Server;
}

/** Builds the Express app, wraps it in an HTTP server, and starts listening. Returns both `app`
 * (useful for tests, e.g. supertest against it directly without binding a port) and `server` (so
 * `index.ts` can wire graceful shutdown on it — `app.listen()` alone hands back nothing to close
 * on SIGTERM). */
export const initApp = (): Promise<App> => {
  const app = express();

  app.use(
    cors({
      // Empty allowlist reflects any origin — see the comment on CORS_ALLOWED_ORIGINS in envs.ts.
      origin: appEnv.cors.allowedOrigins.length > 0 ? appEnv.cors.allowedOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json());
  // @aio:middleware-early

  app.use("/api", apiRoutes);

  app.use(notFoundHandler);
  // errorHandler must be the LAST middleware mounted: anything thrown above (including inside
  // notFoundHandler) is caught here and serialized into the ApiResponse envelope. Express 5
  // forwards a rejected promise from any async handler here automatically — no asyncHandler
  // wrapper needed, as long as this stays mounted after every route.
  app.use(errorHandler);

  const server = createServer(app);

  return new Promise((resolve) => {
    server.listen(appEnv.app.port, () => {
      console.log(`Server listening on port ${appEnv.app.port} (${appEnv.app.nodeEnv})`);
      resolve({ app, server });
    });
  });
};
