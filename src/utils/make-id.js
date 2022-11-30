module.exports = {
  makeId: function () {
    return Math.round(Math.random() * 1e14) + "." + Date.now();
  },
};
