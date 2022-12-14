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

// path to reports directory
const logsDirPath = path.join(__dirname, "../logs/mte-logs");

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

/**
 * Parse log files for a given month and report on the number of unique MTE IDs
 * @param {Number} month - the month to report on; 1 = January, 12 = December
 * @returns {String} - the path to the report file
 */
async function writeMteReport(requestedMonth) {
  // validate requestedMonth
  if (requestedMonth < 1 || requestedMonth > 12) {
    throw new Error(
      `Invalid month requested: ${requestedMonth}. Must be between 1 and 12.`
    );
  }

  // create a map to store our values in
  const idsMap = new Map();

  // read all log files
  const files = await fs.promises.readdir(logsDirPath);

  // regex to match month in filename
  const monthRegex = new RegExp(
    `\\d{4}-${requestedMonth}-\\d{2}-\\d{2}\\.log$`
  );

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

    // read this log line by line
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

  // calculate the total number of unique IDs and total number of transactions
  const totalUniqueIds = Array.from(idsMap.keys()).length;
  const totalTransactions = Array.from(idsMap.values()).reduce(
    (acc, val) => acc + val,
    0
  );

  // file data
  const date = new Date();
  const reportingMonth = months[requestedMonth];
  const fileName =
    `${LICENSE_COMPANY}-mte-report-${reportingMonth}-${date.getTime()}.txt`
      .toLowerCase()
      .replace(/\s-\s|\s/g, "-");
  const filePath = path.join(logsDirPath, fileName);

  // write the report file
  await fs.promises.writeFile(
    filePath,
    `MTE Usage Report 

Company: ${LICENSE_COMPANY}
Reporting Month: ${reportingMonth}
Created: ${date.toGMTString()}

Total Unique Device IDs: ${totalUniqueIds}
Total MTE Requests: ${totalTransactions}`
  );

  return {
    filePath,
    fileName,
  };
}

module.exports = {
  writeMteReport,
};
