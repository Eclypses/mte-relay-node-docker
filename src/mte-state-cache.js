const NodeCache = require("node-cache");

// cache with 10m ttl
const cache = new NodeCache({
  stdTTL: 600, // 10m (in seconds)
});

module.exports = {
  cache,
};
