/**
 * Use Javascript to create a v4 uuid.
 * https://stackoverflow.com/a/2117523/4927236
 */
function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

module.exports = {
  uuidv4,
};
