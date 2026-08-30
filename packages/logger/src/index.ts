import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(
      ({ timestamp, level, message }) => `${String(timestamp)} ${level}: ${String(message)}`,
    ),
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ["error", "warn", "info", "debug", "verbose", "silly"],
    }),
  ],
});

export function setVerbose(verbose: boolean | undefined): void {
  if (verbose) logger.level = "debug";
}
