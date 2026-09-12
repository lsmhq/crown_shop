const fs = require('fs');
const path = require('path');
const P = require('./path');

let session = new Date().getTime();

function fmtNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  );
}

function ensureLogDir() {
  if (!fs.existsSync(P.logsDir)) fs.mkdirSync(P.logsDir, { recursive: true });
}

function log(msg, level) {
  const lv = (level || 'info').toUpperCase();
  const line = '[' + fmtNow() + '] [' + lv + '] ' + msg;
  try {
    ensureLogDir();
    fs.appendFileSync(path.join(P.logsDir, 'app.log'), line + '\r\n');
  } catch (e) { /* ignore */ }
  if (!P.sea) {
    try { console.log(line); } catch (e) { /* ignore */ }
  }
}

module.exports = { log, fmtNow, session };