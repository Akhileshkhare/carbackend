import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: config.LOG_LEVEL,
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
    err: pino.stdSerializers.err,
    req: (request) => ({
      method: request.method,
      url: new URL(request.url, "http://localhost").pathname,
      id: request.id,
    }),
  },
});
