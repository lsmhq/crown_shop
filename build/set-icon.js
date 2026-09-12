const rcedit = require("rcedit");
const path = require("path");

const exe = path.resolve(process.argv[2]);
const icon = path.resolve(process.argv[3]);
rcedit(exe, { icon })
  .then(() => { console.log("ICON_SET " + exe); })
  .catch((e) => { console.error("ICON_FAIL " + e.message); process.exit(1); });