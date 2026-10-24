import { createApp } from "./app";
import { config } from "./config";
import { pool } from "./db/pool";
import { logger } from "./logger";

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "CocaCars admin API is listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down API");
  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "HTTP server shutdown failed");
      process.exitCode = 1;
    }
    await pool.end();
    process.exit();
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
