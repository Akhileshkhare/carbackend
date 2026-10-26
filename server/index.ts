import { createApp } from "./app";
import { config } from "./config";
import { pool } from "./db/pool";
import { logger } from "./logger";
import { initializeLocalApi } from "./local-api";
import { seedLocalDemoData, seedMysqlDemoData } from "./db/demo-data";
import type { RowDataPacket } from "mysql2";

let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down API");
  if (!server) {
    await pool.end();
    return;
  }
  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "HTTP server shutdown failed");
      process.exitCode = 1;
    }
    await pool.end();
    process.exit();
  });
}

async function start(): Promise<void> {
  let localMode = false;
  try {
    await pool.query("SELECT 1");
    logger.info(
      {
        host: config.MYSQL_HOST,
        port: config.MYSQL_PORT,
        database: config.MYSQL_DATABASE,
      },
      "MySQL database connection established",
    );
  } catch (error) {
    localMode = true;
    logger.warn(
      {
        err: error,
        host: config.MYSQL_HOST,
        port: config.MYSQL_PORT,
        database: config.MYSQL_DATABASE,
      },
      "MySQL connection failed; switching to local JSON storage",
    );
  }
  if (localMode) {
    await initializeLocalApi();
    if (config.SEED_DEMO_DATA === "true") {
      await seedLocalDemoData();
      logger.info("Seeded synthetic demo records in local JSON storage");
    }
  } else if (config.SEED_DEMO_DATA === "true") {
    const [admins] = await pool.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM admins WHERE active = TRUE ORDER BY id LIMIT 1",
    );
    if (!admins[0]) {
      throw new Error(
        "SEED_DEMO_DATA is enabled, but no active MySQL administrator exists.",
      );
    }
    await seedMysqlDemoData(admins[0].id);
    logger.info("Seeded synthetic demo records in MySQL");
  }
  const app = createApp(undefined, localMode);
  server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, storage: localMode ? "json" : "mysql" },
      "CocaCars admin API is listening",
    );
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
void start().catch((error: unknown) => {
  logger.fatal({ err: error }, "API startup failed");
  process.exitCode = 1;
});
