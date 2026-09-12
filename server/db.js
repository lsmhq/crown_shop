const fs = require('fs');
const path = require('path');
const P = require('./path');
const util = require('./util');
const { log } = require('./log');

let state = null;

function defaultData() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    settings: {
      shopName: '我的小店',
      codePrefix: 'SP',
      nextSeq: 1,
      orderSeq: 1,
      autoBackupDays: 1,
      autoUpdate: false,
      pageTransition: 'fade',
      lastBackupAt: '',
    },
    suppliers: [],
    customers: [],
    products: [],
    orders: [],
  };
}

function ensureDirs() {
  fs.mkdirSync(P.dataDir, { recursive: true });
  fs.mkdirSync(P.backupsDir, { recursive: true });
}

function normalize() {
  const defaults = defaultData();
  const s = state;
  if (!s.settings) s.settings = defaults.settings;
  else {
    if (typeof s.settings.nextSeq !== 'number') s.settings.nextSeq = defaults.settings.nextSeq;
    if (typeof s.settings.orderSeq !== 'number') s.settings.orderSeq = defaults.settings.orderSeq;
    if (typeof s.settings.codePrefix !== 'string') s.settings.codePrefix = 'SP';
    if (!s.settings.shopName) s.settings.shopName = '我的小店';
    if (typeof s.settings.autoUpdate !== 'boolean') s.settings.autoUpdate = false;
    if (typeof s.settings.pageTransition !== 'string') s.settings.pageTransition = 'fade';
  }
  if (!Array.isArray(s.suppliers)) s.suppliers = [];
  if (!Array.isArray(s.customers)) s.customers = [];
  if (!Array.isArray(s.products)) s.products = [];
  if (!Array.isArray(s.orders)) s.orders = [];
}

function save() {
  ensureDirs();
  state.updatedAt = new Date().toISOString();
  const tmp = P.dbPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, P.dbPath);
}

function load() {
  if (state) return state;
  ensureDirs();
  if (fs.existsSync(P.dbPath)) {
    try {
      const raw = fs.readFileSync(P.dbPath, 'utf8');
      state = JSON.parse(raw);
      normalize();
    } catch (e) {
      log('数据文件损坏，已移动损坏文件并重建: ' + e.message, 'warn');
      try {
        fs.copyFileSync(P.dbPath, path.join(P.backupsDir, 'db-corrupt-' + Date.now() + '.json'));
      } catch (e2) { /* ignore */ }
      state = defaultData();
      save();
    }
  } else {
    state = defaultData();
    save();
  }
  return state;
}

function get() {
  return load();
}

function commit() {
  save();
}

function genId(prefix) {
  return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nextProductCode() {
  const s = load().settings;
  const seq = s.nextSeq;
  s.nextSeq += 1;
  return s.codePrefix + String(seq).padStart(4, '0');
}

function nextOrderNo() {
  const d = new Date();
  const s = load().settings;
  const seq = s.orderSeq;
  s.orderSeq += 1;
  return 'DD' + String(d.getFullYear()).slice(2) + util.fmtDate(d).slice(5).replace('-', '') + seq;
}

function backup(label) {
  load();
  const name = 'db-' + util.fmtDateTime(new Date()).replace(/[: ]/g, '-') + (label ? '_' + label : '') + '.json';
  fs.copyFileSync(P.dbPath, path.join(P.backupsDir, name));
  log('已创建备份: ' + name);
  return name;
}

function autoBackupCheck() {
  const s = load().settings;
  const days = Number(s.autoBackupDays) || 1;
  const last = util.parseISO(s.lastBackupAt);
  const ok = last && (Date.now() - last.getTime()) < days * 24 * 3600 * 1000;
  if (!ok) {
    try {
      const name = backup('auto');
      s.lastBackupAt = new Date().toISOString();
      save();
      log('自动备份完成: ' + name);
    } catch (e) {
      log('自动备份失败: ' + e.message, 'warn');
    }
  }
}

function listBackups() {
  const dir = P.backupsDir;
  const out = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (/\.json$/i.test(f)) {
        const fp = path.join(dir, f);
        try {
          const st = fs.statSync(fp);
          out.push({ file: f, size: st.size, mtime: st.mtime.toISOString() });
        } catch (e) { /* ignore */ }
      }
    }
  }
  out.sort((a, b) => (a.file < b.file ? 1 : -1));
  return out;
}

function restore(file) {
  const src = path.join(P.backupsDir, path.basename(file));
  if (!fs.existsSync(src)) throw new Error('备份文件不存在: ' + file);
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (!data || typeof data !== 'object') throw new Error('备份文件内容无效');
  fs.copyFileSync(P.dbPath, path.join(P.backupsDir, 'before-restore-' + Date.now() + '.json'));
  state = data;
  normalize();
  save();
  log('已从备份恢复: ' + file);
}

module.exports = {
  load,
  get,
  commit,
  save,
  genId,
  nextProductCode,
  nextOrderNo,
  backup,
  autoBackupCheck,
  listBackups,
  restore,
  ensureDirs,
};