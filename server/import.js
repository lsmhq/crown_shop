const XLSX = require('xlsx');
const db = require('./db');
const util = require('./util');
const { log } = require('./log');

const HEADER_ALIASES = {
  code: ['编号', '商品编号', '编码', '皇冠码', 'sku', '货源编号', 'code', '商品编码'],
  cost: ['成本', '成本价', '进价', '进货价', '进价成本', '采购价', 'cost'],
  price: ['售价', '销售价', '价格', '单价', '卖价', '零售价', 'price'],
  supplierName: ['货源', '供应商', '进货来源', '供货商', '采购来源', '来源', '供方', 'supplier'],
  purchaseAt: ['入库时间', '进货时间', '到货时间', '入库日期', '进货日期', '到货日期', '时间', 'date'],
  note: ['备注', '说明', '备注信息', '备注说明', 'note', 'remark'],
};
const DEFAULT_ORDER = ['code', 'cost', 'price', 'supplierName', 'note'];

function detectHeader(rows) {
  if (!rows.length) return null;
  const cells = rows[0].map((c) => String(c).trim().toLowerCase());
  const mapping = {};
  let found = 0;
  for (const field of Object.keys(HEADER_ALIASES)) {
    const idx = cells.findIndex((c) => HEADER_ALIASES[field].includes(c));
    if (idx >= 0) {
      mapping[field] = idx;
      found++;
    }
  }
  return found >= 1 ? mapping : null;
}

function detectSep(line) {
  if (line.includes('\t')) return '\t';
  const seps = [',', ';', '|', '，', '、'];
  let best = null;
  let bestCount = 0;
  for (const s of seps) {
    const n = line.split(s).length - 1;
    if (n > bestCount) {
      bestCount = n;
      best = s;
    }
  }
  if (best && bestCount >= 1) return best;
  // 多空白
  if (/\s{2,}/.test(line.trim())) return /\s{2,}/;
  return ',';
}

function splitLine(line, sep) {
  if (typeof sep === 'object' || (sep && sep.test)) {
    return line.trim().split(sep);
  }
  return line.split(sep).map((x) => x.trim());
}

function parseMoney(s) {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return s;
  const str = String(s).replace(/[¥￥元\s]/g, '').replace(/,/g, '');
  if (str === '') return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

function parseDateInput(s) {
  if (s === null || s === undefined) return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  const str = String(s).trim();
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d)) return d;
  const m = str.match(/^(\d{4})[年.\-\/](\d{1,2})[月.\-\/](\d{1,2})(?:日|\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) || 0, Number(m[5]) || 0, Number(m[6]) || 0);
    return isNaN(date) ? null : date;
  }
  return null;
}

function toText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return util.fmtDateTime(v);
  return String(v).trim();
}

function codeExists(code) {
  if (!code) return false;
  return db.get().products.some((p) => p.code === code);
}

// 解析统一入口
// opts.defaultAt: ISO 字符串，行内未填写/无法识别入库时间时作为缺省入库时间
function parseRows(raw, opts) {
  const o = opts || {};
  const defaultAt = o.defaultAt ? String(o.defaultAt).trim() : '';
  let validDefault = '';
  if (defaultAt) {
    const dd = parseDateInput(defaultAt);
    if (dd && !isNaN(dd)) validDefault = dd.toISOString();
  }
  const rows = raw.map((line) => line.map(toText));
  const header = detectHeader(rows);
  let list = rows;
  if (header) list = rows.slice(1);

  const out = [];
  const errors = [];

  list.forEach((cells, i) => {
    const rowNo = i + (header ? 2 : 1);
    const get = (field) => {
      const idx = header ? header[field] : DEFAULT_ORDER.indexOf(field);
      if (idx === undefined || idx === -1) return '';
      return cells[idx] !== undefined ? cells[idx] : '';
    };
    const code = String(get('code')).trim();
    if (!code) {
      errors.push({ row: rowNo, msg: '缺少皇冠码' });
      return;
    }
    if (codeExists(code)) {
      errors.push({ row: rowNo, msg: '皇冠码 ' + code + ' 已存在' });
      return;
    }
    const cost = parseMoney(get('cost'));
    if (cost === null) {
      errors.push({ row: rowNo, msg: '成本格式不正确: "' + get('cost') + '"' });
      return;
    }
    // 售价可留空，售出时再定价
    const price = parseMoney(get('price'));
    let purchaseAt = '';
    const warnings = [];
    const atRaw = String(get('purchaseAt')).trim();
    if (atRaw) {
      const d = parseDateInput(atRaw);
      if (d) purchaseAt = d.toISOString();
      else warnings.push('入库时间无法识别，已使用缺省时间');
    }
    out.push({
      row: rowNo,
      code,
      cost,
      price,
      supplierName: String(get('supplierName')).trim() || '未指定货源',
      purchaseAt: purchaseAt || validDefault || new Date().toISOString(),
      note: String(get('note')).trim(),
      warnings,
    });
  });

  // 检查文件内重复皇冠码
  const seen = new Map();
  for (const r of out) {
    if (seen.has(r.code)) {
      errors.push({ row: r.row, msg: '皇冠码 ' + r.code + ' 与第 ' + seen.get(r.code) + ' 行重复' });
      out.splice(out.indexOf(r), 1);
    } else {
      seen.set(r.code, r.row);
    }
  }

  return { rows: out, errors };
}

function parseText(text, opts) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((l) => splitLine(l, detectSep(l)));
  return parseRows(rows, opts);
}

function parseXlsx(base64, opts) {
  const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  return parseRows(rows, opts);
}

function parseInput({ type, content, base64, defaultAt }) {
  if (type === 'xlsx') {
    if (!base64) return { rows: [], errors: [{ row: 0, msg: '缺少文件内容' }] };
    return parseXlsx(base64, { defaultAt });
  }
  if (!content || !String(content).trim()) {
    return { rows: [], errors: [{ row: 0, msg: '请输入要导入的内容' }] };
  }
  return parseText(content, { defaultAt });
}

function commitRows(rows) {
  const imported = [];
  const conflicts = [];
  const warnings = [];
  let count = 0;
  for (const r of rows) {
    if (codeExists(r.code)) {
      conflicts.push({ row: r.row, msg: '皇冠码 ' + r.code + ' 已存在，未导入' });
      continue;
    }
    imported.push({
      id: db.genId('p'),
      code: r.code,
      cost: r.cost,
      price: r.price,
      supplierId: '',
      supplierName: r.supplierName || '未指定货源',
      status: 'instock',
      customerId: '',
      customerName: '',
      purchaseAt: r.purchaseAt,
      soldAt: '',
      orderId: '',
      note: r.note,
      createdAt: new Date().toISOString(),
      fromImport: true,
    });
    count++;
  }
  db.get().products.push(...imported);
  const d = db.get();
  const supNames = new Set(d.suppliers.map((s) => s.name));
  for (const p of imported) {
    const sn = String(p.supplierName || '').trim();
    if (sn && sn !== '未指定货源' && !supNames.has(sn)) {
      d.suppliers.push({ id: db.genId('t'), name: sn, createdAt: new Date().toISOString() });
      supNames.add(sn);
    }
  }
  db.save();
  log('导入商品 ' + imported.length + ' 件');
  return { imported: imported.length, conflicts, warnings };
}

module.exports = { parseInput, commitRows, parseText, parseRows, parseDateInput, parseMoney };