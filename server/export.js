const XLSX = require('xlsx');
const db = require('./db');
const util = require('./util');
const stats = require('./stats');
const rate = require('./rate');

const STATUS_MAP = { instock: '在库', sold: '已售出', returned: '已退货' };
const ORDER_STATUS_MAP = { normal: '正常', partial: '部分退货', returned: '已退货' };

function headerRow(arr) {
  return arr;
}

function exportProductsBuffer(opts) {
  const d = db.get();
  let list = d.products.slice();
  if (opts) {
    if (opts.status && opts.status !== 'all') list = list.filter((p) => p.status === opts.status);
    if (opts.supplierId) list = list.filter((p) => p.supplierId === opts.supplierId);
    if (opts.keyword) {
      const kw = String(opts.keyword).toLowerCase();
      list = list.filter((p) =>
        p.code.toLowerCase().includes(kw) ||
        (p.supplierName || '').toLowerCase().includes(kw)
      );
    }
  }
  const rows = [
    headerRow(['皇冠码', '成本(¥)', '售价($)', '货源', '状态', '购买人', '入库时间', '售出时间', '备注']),
  ];
  for (const p of list) {
    rows.push([
      p.code,
      p.cost,
      p.price,
      p.supplierName || '',
      STATUS_MAP[p.status] || p.status,
      p.customerName || '',
      p.purchaseAt ? util.fmtDateTime(new Date(p.purchaseAt)) : '',
      p.soldAt ? util.fmtDateTime(new Date(p.soldAt)) : '',
      p.note || '',
    ]);
  }
  return sheetBuffer('商品列表', rows, { widthCols: [30, 10, 10, 16, 10, 12, 18, 18, 20] });
}

function exportOrdersBuffer(from, to) {
  const d = db.get();
  let list = d.orders.slice();
  if (from || to) {
    const start = from ? from.getTime() : -Infinity;
    const end = to ? to.getTime() : Infinity;
    list = list.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start && t <= end;
    });
  }
  const rows = [
    headerRow(['订单号', '买家', '时间', '商品明细', '总额', '利润', '状态', '备注']),
  ];
  for (const o of list) {
    const detail = (o.items || []).map((it) => it.code).join('\n');
    rows.push([
      o.no,
      o.customerName || '',
      util.fmtDateTime(o.createdAt ? new Date(o.createdAt) : new Date()),
      detail,
      o.total,
      o.profit,
      ORDER_STATUS_MAP[o.status] || o.status,
      o.note || '',
    ]);
  }
  return sheetBuffer('订单列表', rows, { widthCols: [16, 14, 18, 40, 10, 10, 12, 20] });
}

function exportSupplierProfitBuffer(from, to) {
  const supStats = stats.supplierStats(from, to);
  const d = db.get();
  const sold = stats.soldProducts(from, to);

  const wb = XLSX.utils.book_new();
  const genText = util.fmtDateCN(from) + ' 至 ' + util.fmtDateCN(to);

  const head = [['货源利润分成报表（' + genText + '）']];
  wb.SheetNames.push('汇总');
  const sumRows = [];
  const sumAOA = [
    ...head,
    [],
    ['货源', '售出件数', '销售量占比', '成本合计', '销售额', '利润', '利润率', '销售额占比'],
    ...supStats.rows.map((r) => [
      r.name,
      r.qty,
      r.ratio + '%',
      r.cost,
      r.amount,
      r.profit,
      (r.qty ? Math.round((Number(r.profit) / Number(r.cost || 0 || r.amount)) * 1000) / 10 : 0) + '%',
      r.amountRatio + '%',
    ]),
    [],
    ['总计', supStats.totalQty, '100%', '',
      util.money(supStats.rows.reduce((s, r) => s + Number(r.amount), 0)),
      util.money(supStats.rows.reduce((s, r) => s + Number(r.profit), 0)), '', '100%'],
  ];
  const sumWs = XLSX.utils.aoa_to_sheet(sumAOA);
  wb.Sheets['汇总'] = sumWs;

  // 每个货源一个明细 sheet
  for (const r of supStats.rows) {
    const items = sold.filter((p) => (p.supplierName || '未指定货源') === r.name);
    const aoa = [];
    aoa.push([r.name + ' - 售出明细（' + genText + '）']);
    aoa.push([]);
    aoa.push(headerRow(['皇冠码', '成本($)', '售价($)', '单件利润($)', '售出时间', '买家', '备注']));
    for (const p of items) {
      const costUsd = rate.costToUsd(p.cost, p.saleRate);
      aoa.push([
        p.code,
        util.money(costUsd),
        p.price,
        util.money((Number(p.price) || 0) - costUsd),
        p.soldAt ? util.fmtDateTime(new Date(p.soldAt)) : '',
        p.customerName || '',
        p.note || '',
      ]);
    }
    aoa.push([]);
    aoa.push(['小计', '', '', '', '', '', '']);
    aoa.push(['销售件数', r.qty, '', '成本合计($)', r.cost, '', '销售额($)', r.amount, '利润 ' + r.profit]);
    const wsName = String(r.name).slice(0, 31) || '货源';
    wb.SheetNames.push(wsName);
    wb.Sheets[wsName] = XLSX.utils.aoa_to_sheet(aoa);
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

function exportTemplateBuffer() {
  const wb = XLSX.utils.book_new();
  const headAOA = [
    ['根据表头复制一列一列填写，红色列（皇冠码/成本）必填，售价选填（可售出时定价）。'],
    ['皇冠码', '成本(元)', '售价(元)', '货源', '入库时间', '备注'],
    ['（每个皇冠码占一行）', 10, 15, '货源A', '2026-01-01', '第一次进货'],
    ['381LD-812Z6-784DC-422D3', 35, 59, '货源B', '2026-01-02', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(headAOA);
  ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  wb.SheetNames.push('商品导入模板');
  wb.Sheets['商品导入模板'] = ws;

  const help = [
    ['支持三种导入方式：'],
    ['1. Excel(.xlsx/.xls) 文件上传，模板如上表；'],
    ['2. TXT 文本：每行一条，列与模板表头一致；'],
    ['3. 直接在文本框粘贴：可从Excel复制单元格粘贴（自动识别制表符/逗号/分号分隔）。'],
    [''],
    ['皇冠码必填且不能重复，皇冠码即商品的唯一标识（如 381LD-812Z6-784DC-422D3）。'],
    [''],
    ['可识别表头别名：'],
    ['编码/编号/商品编码/SKU，成本/成本价/进价，售价/销售价/单价，'],
    ['货源/供应商/进货来源，入库时间/进货时间，备注/说明。'],
    [''],
    ['没有表头的纯文本按固定顺序解析：皇冠码,成本,售价,货源,备注'],
  ];
  wb.SheetNames.push('说明');
  wb.Sheets['说明'] = XLSX.utils.aoa_to_sheet(help);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function sheetBuffer(name, aoa, opts) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (opts && opts.widthCols) {
    ws['!cols'] = opts.widthCols.map((w) => ({ wch: w }));
  }
  wb.SheetNames.push(name);
  wb.Sheets[name] = ws;
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  exportProductsBuffer,
  exportOrdersBuffer,
  exportSupplierProfitBuffer,
  exportTemplateBuffer,
};