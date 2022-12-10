/**
 * - Get list of all files in the log
 * - for each log
 *  - for each line
 *    - parse for unique client ID
 *    - add to set of unique IDs
 */

const fs = require("fs");
const readline = require("readline");
const path = require("path");
const { LICENSE_COMPANY } = require("./settings");
const { logger } = require("./logger");

// path to reports directory
const reportsDirPath = path.join(__dirname, "../logs/reports");
const logsDirPath = path.join(__dirname, "../logs/access-logs");

// an array of months; 1 = January
const months = [
  undefined,
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function parseLogFilesCountUinqueIds(month) {
  try {
    // create a map to store our values in
    const idsMap = new Map();

    // get a list of all the logs files
    const files = await fs.promises.readdir(logsDirPath);

    const monthRegex = new RegExp(`^\\d{4}${month}.*\\.log$`, "i");

    // loop over each file
    let i = 0;
    const iMax = files.length;
    for (; i < iMax; ++i) {
      const _file = files[i];
      // if this file is not from the request month, ignore it
      const match = _file.match(monthRegex);
      if (!match) {
        continue;
      }

      // read this log file line by line
      await (() =>
        new Promise((resolve, reject) => {
          try {
            const inputStream = fs.createReadStream(
              path.join(logsDirPath, _file)
            );
            const lineReader = readline.createInterface({
              input: inputStream,
              terminal: false,
            });
            // for each line, parse the ID
            // add it to the ID map, or increment the existing value by 1
            lineReader.on("line", (line) => {
              const id = line.split(",")[0];
              if (idsMap.has(id)) {
                idsMap.set(id, idsMap.get(id) + 1);
              } else {
                idsMap.set(id, 1);
              }
            });
            lineReader.on("close", resolve);
          } catch (err) {
            reject(err.message);
          }
        }))();
    }
    const totalUniqueIds = Array.from(idsMap.keys()).length;
    const totalTransactions = Array.from(idsMap.values()).reduce(
      (acc, val) => acc + val,
      0
    );
    const reportingMonth = months[Number(month)];
    const date = new Date();
    const filePath = path.join(
      reportsDirPath,
      `${LICENSE_COMPANY}-${reportingMonth}-mte-report-${Date.now()}.txt`
        .toLowerCase()
        .replace(/\s-\s|\s/g, "-")
    );
    fs.promises.writeFile(
      filePath,
      `MTE Usage Report

Company:\t\t\t\t\t\t\t\t\t\t${LICENSE_COMPANY}
Reporting Month:\t\t\t\t\t\t${reportingMonth}
Created:\t\t\t\t\t\t\t\t\t\t${date.toGMTString()}

Total Unique Device IDs:\t\t${totalUniqueIds}
Total MTE Events:\t\t\t\t\t\t${totalTransactions}`
    );

    return filePath;
  } catch (error) {
    logger.error(error.message, error);
  }
}

module.exports = {
  parseLogFilesCountUinqueIds,
};
