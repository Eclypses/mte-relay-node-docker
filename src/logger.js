const morgan = require("morgan");
var rfs = require("rotating-file-stream");
const path = require("path");
const { COOKIE_NAME } = require("./settings");

// create a rotating write stream
var accessLogStream = rfs.createStream("access.log", {
  interval: "1d", // rotate daily
  path: path.join(__dirname, "../logs/access-logs"),
});

morgan.token("mteId", function (req, res) {
  const id = req.signedCookies
    ? req.signedCookies?.[COOKIE_NAME] || "unknown"
    : "unknown";
  return id;
});

function createLog(tokens, req, res) {
  return [
    tokens.mteId(req, res),
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.date(req, res, "iso"),
  ].join(",");
}

module.exports = {
  logger: morgan(createLog, { stream: accessLogStream }),
};
