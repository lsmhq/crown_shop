const p = (n) => String(n).padStart(2, '0');

function fmtDate(d) {
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function fmtDateTime(d) {
  return fmtDate(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function fmtDateCN(d) {
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function toISO(d) {
  return d instanceof Date && !isNaN(d) ? d.toISOString() : new Date(d).toISOString();
}

function parseISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function dayKey(d) {
  return fmtDate(d);
}

function monthKey(d) {
  return d.getFullYear() + '-' + p(d.getMonth() + 1);
}

function weekKey(d) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  return fmtDate(dt) + '~周' + '起';
}

// 解析时间段输入：'7d' | '30d' | 'month' | 'yyyy-mm-dd'
function parseRange(from, to) {
  const now = new Date();
  let start, end;
  if (from && to) {
    start = parseISO(from + 'T00:00:00');
    end = parseISO(to + 'T23:59:59.999');
  } else {
    end = now;
    const mode = from || '7d';
    if (mode === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      const days = parseInt(mode, 10) || 7;
      start = new Date(now);
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
    }
  }
  return { start, end };
}

function money(n) {
  const v = Number(n) || 0;
  return (Math.round(v * 100) / 100).toFixed(2);
}

function padInput(n) {
  return String(n || '').trim();
}

module.exports = {
  fmtDate,
  fmtDateTime,
  fmtDateCN,
  toISO,
  parseISO,
  dayKey,
  monthKey,
  weekKey,
  parseRange,
  money,
};