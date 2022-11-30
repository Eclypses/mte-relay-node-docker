/**
 * Generate a random number
 */
function makeNonce() {
  return Math.floor(Math.random() * 1e15).toString();
}

module.exports = {
  makeNonce,
};
