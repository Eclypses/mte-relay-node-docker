const fs = require("fs");
const path = require("path");
const { logger } = require("./logger");

/**
 * Run this code as soon as the server starts, to make sure
 * the program has everything it needs (config files, log directories, etc)
 */
function startupChecks() {
  // check for config.yml
  const configPath = path.join(__dirname, "../mte-relay-config.yaml");
  if (!fs.existsSync(configPath)) {
    const message = `Config is missing. Expected at this path: ${configPath}`;
    logger.error(message);
    process.exit(1);
  }

  // check for logs directory
  const logsDir = path.join(__dirname, "../logs");
  if (!fs.existsSync(logsDir)) {
    const message = `Logs directory is missing. Expected at this path: ${logsDir}`;
    logger.error(message);
    process.exit(1);
  }
}

module.exports = {
  startupChecks,
};
