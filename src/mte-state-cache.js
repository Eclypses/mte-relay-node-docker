const NodeCache = require("node-cache");

// cache with 30m ttl
const cache = new NodeCache({
  stdTTL: 60 * 30, // 30 minutes
});

module.exports = {
  cache,
};
