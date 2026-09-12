const path = require('path');

let sea = false;
try {
  sea = require('node:sea').isSea();
} catch (e) {
  sea = false;
}

const exeDir = path.dirname(process.execPath);
const devRoot = path.resolve(__dirname, '..');

const appRoot = sea ? exeDir : devRoot;
const dataDir = path.join(appRoot, 'data');
const backupsDir = path.join(dataDir, 'backups');
const logsDir = path.join(appRoot, 'logs');
const publicDir = path.join(appRoot, 'public');

module.exports = {
  sea,
  appRoot,
  dataDir,
  backupsDir,
  logsDir,
  publicDir,
  dbPath: path.join(dataDir, 'db.json'),
};