"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("./config");
exports.logger = (0, pino_1.default)({
    level: config_1.config.LOG_LEVEL,
    redact: {
        paths: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.body.password",
            "password",
            "password_hash",
            "csrf_token",
        ],
        censor: "[REDACTED]",
    },
    serializers: {
        err: pino_1.default.stdSerializers.err,
        req: (request) => ({
            method: request.method,
            url: new URL(request.url, "http://localhost").pathname,
            id: request.id,
        }),
    },
});
