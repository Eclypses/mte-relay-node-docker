/**
 * A custom error object that takes in a message and a status code to return to the client.
 * @param {string?} message A message to return to the client.
 * @param {number?} status A status code, 401, 403, 200, 500, etc...
 */
function ApplicationError(message, status) {
  this.name = "ApplicationError";
  this.message = message || "An unknown error occurred.";
  this.status = status || 500;
  this.stack = new Error().stack;
}
ApplicationError.prototype = new Error();

module.exports = ApplicationError;
