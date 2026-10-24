"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const pool_1 = require("./db/pool");
const logger_1 = require("./logger");
const app = (0, app_1.createApp)();
const server = app.listen(config_1.config.PORT, () => {
    logger_1.logger.info({ port: config_1.config.PORT }, "CocaCars admin API is listening");
});
async function shutdown(signal) {
    logger_1.logger.info({ signal }, "Shutting down API");
    server.close(async (error) => {
        if (error) {
            logger_1.logger.error({ err: error }, "HTTP server shutdown failed");
            process.exitCode = 1;
        }
        await pool_1.pool.end();
        process.exit();
    });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
