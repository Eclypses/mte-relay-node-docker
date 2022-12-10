const yaml = require("yaml");
const fs = require("fs");
const path = require("path");

// parse yaml file
const yamlPath = path.join(__dirname, "../mte-relay-config.yaml");
const file = fs.readFileSync(yamlPath, { encoding: "utf-8" });
const parsedYaml = yaml.parse(file);

// validate yaml file has everything needed
(() => {
  [
    "port",
    "host",
    "licenseCompany",
    "licenseKey",
    "corsOrigins",
    "corsMethods",
    "idCookieName",
    "idCookieSecret",
    "reportAccessToken",
  ].forEach((key) => {
    if (!parsedYaml[key]) {
      console.error(
        `Required key "${key}" is missing from file "${yamlPath}"\nExiting program.`
      );
      process.exit(1);
    }
  });
})();

// export values for program to use
module.exports = {
  MTE_ID: `${Math.round(Math.random() * 1e14)}.${Date.now()}`,
  MTE_ID_HEADER: `x-mte-id`,
  MTE_ENCODED_CONTENT_TYPE_HEADER_NAME: "x-mte-cth",
  PORT: parsedYaml.port,
  HOST: parsedYaml.host,
  LICENSE_COMPANY: parsedYaml.licenseCompany,
  LICENSE_key: parsedYaml.licenseKey,
  COOKIE_NAME: parsedYaml.idCookieName,
  COOKIE_SECRET: parsedYaml.idCookieSecret,
  CORS_ORIGINS: parsedYaml.corsOrigins,
  CORS_METHODS: parsedYaml.corsMethods,
  ACCESS_TOKEN: parsedYaml.reportAccessToken,
  REDIS_URL: parsedYaml.redisConnectionString,
  DEBUG: parsedYaml.debug || false,
};
