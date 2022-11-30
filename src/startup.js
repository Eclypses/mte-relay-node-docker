const fs = require("fs");
const path = require("path");

/**
 * Run this code as soon as the server starts, to make sure
 * the program has everything it needs (config files, log directories, etc)
 */
function startupChecks() {
  // check for config.yml
  const configPath = path.join(__dirname, "../mte-relay-config.yaml");
  if (!fs.existsSync(configPath)) {
    throw Error(`Config is missing. Expected at this path: ${configPath}`);
  }

  // check for logs directory
  const logsDir = path.join(__dirname, "../logs/access-logs");
  if (!fs.existsSync(logsDir)) {
    throw Error(`Logs directory is missing. Expected at this path: ${logsDir}`);
  }

  // check for reports  directory
  const reportsDir = path.join(__dirname, "../logs/reports");
  if (!fs.existsSync(reportsDir)) {
    throw Error(
      `Logs directory is missing. Expected at this path: ${reportsDir}`
    );
  }
}

module.exports = {
  startupChecks,
};
