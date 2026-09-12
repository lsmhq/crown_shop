const P = require('./path');
const { log } = require('./log');
const db = require('./db');
const app = require('./app');

const port = process.env.PORT ? Number(process.env.PORT) : 8765;

log('启动 "我的小店" 管理系统');
log('数据目录: ' + P.dataDir);

try {
  db.load();
  app.start(port);
} catch (e) {
  log('启动失败: ' + (e && e.stack ? e.stack : e), 'error');
  process.exit(1);
}