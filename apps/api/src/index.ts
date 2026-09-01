import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createApiServices } from "./composition.js";
import { loadConfig } from "./config/env.js";
import { MongoConnectionManager } from "./database/connection.js";

async function main() {
  const config = loadConfig();
  const mongo = new MongoConnectionManager(config.mongo);
  await mongo.connect();

  const app = createApp({ config, services: createApiServices(config), readiness: mongo });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.info("api_started", { port: config.port, environment: config.env });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("api_shutdown_started", { signal });
    const deadline = setTimeout(() => {
      console.error("api_shutdown_deadline_exceeded");
      process.exit(1);
    }, config.shutdownGraceMs);
    deadline.unref();
    server.closeIdleConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongo.disconnect();
    clearTimeout(deadline);
    console.info("api_shutdown_complete");
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("api_startup_failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown startup failure",
  });
  process.exitCode = 1;
});
