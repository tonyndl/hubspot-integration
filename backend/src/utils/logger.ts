import pino from "pino";
import { config } from "../config/index.js";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport:
    config.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: {
    paths: [
      "access_token",
      "refresh_token",
      "accessToken",
      "refreshToken",
      "token",
      "secret",
      "password",
      "authorization",
      "req.headers.authorization",
      "body.email",
      "*.email",
    ],
    censor: "[REDACTED]",
  },
});

export type Logger = typeof logger;
