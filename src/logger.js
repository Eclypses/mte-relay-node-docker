const winston = require("winston");
const path = require("path");
require("winston-daily-rotate-file");
const { DEBUG } = require("./settings");

/**
 * A logger that tracks all requests and logs to a special MTE log file
 */
const mteLogger = winston.createLogger({
  format: winston.format.printf((info) => info.message),
  transports: [
    new winston.transports.DailyRotateFile({
      maxFiles: "93d", // 3 months + 1 day of logs
      zippedArchive: true,
      datePattern: "YYYY-MM-DD-HH",
      filename: "mte-relay-%DATE%.log",
      dirname: path.join(__dirname, "../logs/mte-logs"),
    }),
  ],
});

// a custom formatter to try to print stack traces
const formatter = winston.format.printf((info) => {
  let str = `${info.level}: ${info.message}`;
  if (info.stack) {
    str += `\n${info.stack}`;
  }
  return str;
});

/**
 * A generic logger for all other messages
 */
const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), formatter),
    }),
    new winston.transports.DailyRotateFile({
      level: DEBUG ? "debug" : "info",
      maxFiles: "7d",
      filename: "%DATE%.log",
      datePattern: "YYYY-MM-DD-HH",
      dirname: path.join(__dirname, "../logs/logs"),

      format: winston.format.combine(formatter),
    }),
  ],
});

module.exports = { logger, mteLogger };
