"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const pool_1 = require("./db/pool");
const logger_1 = require("./logger");
const local_api_1 = require("./local-api");
const demo_data_1 = require("./db/demo-data");
let server;
async function shutdown(signal) {
    logger_1.logger.info({ signal }, "Shutting down API");
    if (!server) {
        await pool_1.pool.end();
        return;
    }
    server.close(async (error) => {
        if (error) {
            logger_1.logger.error({ err: error }, "HTTP server shutdown failed");
            process.exitCode = 1;
        }
        await pool_1.pool.end();
        process.exit();
    });
}
async function start() {
    let localMode = config_1.config.STORAGE_MODE === "json";
    if (localMode) {
        logger_1.logger.warn("Using bundled JSON storage; MySQL is disabled by STORAGE_MODE.");
    }
    else {
        try {
            await pool_1.pool.query("SELECT 1");
            logger_1.logger.info({
                host: config_1.config.MYSQL_HOST,
                port: config_1.config.MYSQL_PORT,
                database: config_1.config.MYSQL_DATABASE,
            }, "MySQL database connection established");
        }
        catch (error) {
            if (config_1.config.STORAGE_MODE === "mysql")
                throw error;
            localMode = true;
            logger_1.logger.warn({
                err: error,
                host: config_1.config.MYSQL_HOST,
                port: config_1.config.MYSQL_PORT,
                database: config_1.config.MYSQL_DATABASE,
            }, "MySQL connection failed; switching to local JSON storage");
        }
    }
    if (localMode) {
        await (0, local_api_1.initializeLocalApi)();
        await (0, demo_data_1.seedLocalDemoData)();
        logger_1.logger.info("Loaded bundled synthetic records into local JSON storage");
    }
    else if (config_1.config.SEED_DEMO_DATA === "true") {
        const [admins] = await pool_1.pool.execute("SELECT id FROM admins WHERE active = TRUE ORDER BY id LIMIT 1");
        if (!admins[0]) {
            throw new Error("SEED_DEMO_DATA is enabled, but no active MySQL administrator exists.");
        }
        await (0, demo_data_1.seedMysqlDemoData)(admins[0].id);
        logger_1.logger.info("Seeded synthetic demo records in MySQL");
    }
    const app = (0, app_1.createApp)(undefined, localMode);
    server = app.listen(config_1.config.PORT, () => {
        logger_1.logger.info({ port: config_1.config.PORT, storage: localMode ? "json" : "mysql" }, "CocaCars admin API is listening");
    });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
void start().catch((error) => {
    logger_1.logger.fatal({ err: error }, "API startup failed");
    process.exitCode = 1;
});
