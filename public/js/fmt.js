const FMT = {
  money(n) {
    const v = Number(n) || 0;
    return v.toFixed(2);
  },
  pad(n) { return String(n).padStart(2, '0'); },
  fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.getFullYear() + '-' + this.pad(dt.getMonth() + 1) + '-' + this.pad(dt.getDate());
  },
  fmtDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return this.fmtDate(dt) + ' ' + this.pad(dt.getHours()) + ':' + this.pad(dt.getMinutes());
  },
  today() { return this.fmtDate(new Date()); },
  productStatus(s) {
    return { instock: { text: '在库', cls: 'badge-green' }, sold: { text: '已售出', cls: 'badge-red' }, returned: { text: '已退货', cls: 'badge-gray' } }[s] || { text: s, cls: 'badge-gray' };
  },
  orderStatus(s) {
    return { normal: { text: '正常', cls: 'badge-green' }, partial: { text: '部分退货', cls: 'badge-amber' }, returned: { text: '已退货', cls: 'badge-gray' } }[s] || { text: s, cls: 'badge-gray' };
  },
  rangeShort(mode) {
    const map = { '7d': '近7天', '30d': '近30天', month: '本月' };
    return map[mode] || mode;
  },
};
window.FMT = FMT;