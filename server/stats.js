const db = require('./db');
const util = require('./util');
const rate = require('./rate');

const SPEC_LABELS = ['2.5k', '5k', '13.75k', '30k', '60k', '80k'];

// 单件售出商品的利润（美元）= 售价 - 成本(人民币)÷当时汇率
function saleProfit(p) {
  return (Number(p.price) || 0) - rate.costToUsd(p.cost, p.saleRate);
}

// 已售出(未退货)的商品集合，按售出时间过滤
function soldProducts(from, to) {
  const prods = db.get().products.filter((p) => p.status === 'sold');
  const start = from ? from.getTime() : -Infinity;
  const end = to ? to.getTime() : Infinity;
  return prods.filter((p) => {
    const t = util.parseISO(p.soldAt);
    return t && t.getTime() >= start && t.getTime() <= end;
  });
}

function overview() {
  const d = db.get();
  const prods = d.products;
  let totalProfit = 0;
  let revenue = 0;
  for (const p of prods) {
    if (p.status === 'sold') {
      revenue += Number(p.price) || 0;
      totalProfit += saleProfit(p);
    }
  }
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todaySold = soldProducts(todayStart, now);
  let todayRevenue = 0;
  let todayProfit = 0;
  for (const p of todaySold) {
    todayRevenue += Number(p.price) || 0;
    todayProfit += saleProfit(p);
  }
  return {
    totalProducts: prods.length,
    instockCount: prods.filter((p) => p.status === 'instock').length,
    soldCount: prods.filter((p) => p.status === 'sold').length,
    returnedCount: prods.filter((p) => p.status === 'returned').length,
    totalRevenue: util.money(revenue),
    totalProfit: util.money(totalProfit),
    ordersCount: d.orders.length,
    todayRevenue: util.money(todayRevenue),
    todayProfit: util.money(todayProfit),
    todaySoldCount: todaySold.length,
  };
}

function groupKey(d, groupBy) {
  if (groupBy === 'month') return util.monthKey(d);
  if (groupBy === 'week') return util.weekKey(d);
  return util.dayKey(d);
}

function fillTimeline(map, start, end, groupBy) {
  const cur = new Date(start.getTime());
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end.getTime());
  last.setHours(0, 0, 0, 0);
  const keys = [];
  let guard = 0;
  while (cur <= last && guard < 4000) {
    guard++;
    const key = groupKey(cur, groupBy);
    if (!keys.length || keys[keys.length - 1] !== key) keys.push(key);
    if (groupBy === 'day') cur.setDate(cur.getDate() + 1);
    else if (groupBy === 'week') cur.setDate(cur.getDate() + 7);
    else {
      // month: 下一月1号
      cur.setMonth(cur.getMonth() + 1, 1);
      cur.setHours(0, 0, 0, 0);
    }
  }
  for (const k of keys) {
    if (!map[k]) map[k] = { qty: 0, amount: 0, profit: 0, cost: 0 };
  }
  return keys;
}

function timeline(from, to, groupBy) {
  const gb = groupBy === 'month' || groupBy === 'week' ? groupBy : 'day';
  const sales = {};
  const purchases = {};
  const salesKeys = fillTimeline(sales, from, to, gb);
  fillTimeline(purchases, from, to, gb);

  for (const p of soldProducts(from, to)) {
    const k = groupKey(util.parseISO(p.soldAt), gb);
    sales[k].qty += 1;
    sales[k].amount += Number(p.price) || 0;
    sales[k].profit += saleProfit(p);
  }
  const all = db.get().products;
  const pStart = from.getTime();
  const pEnd = to.getTime();
  for (const p of all) {
    const t = util.parseISO(p.purchaseAt);
    if (t && t.getTime() >= pStart && t.getTime() <= pEnd) {
      const k = groupKey(t, gb);
      purchases[k].qty += 1;
      // 进货成本按当前汇率折算成美元，与销售额同单位展示
      purchases[k].cost += rate.costToUsd(p.cost, rate.current());
    }
  }
  return {
    keys: salesKeys,
    sales: salesKeys.map((k) => ({
      key: k,
      qty: sales[k].qty,
      amount: util.money(sales[k].amount),
      profit: util.money(sales[k].profit),
    })),
    purchases: salesKeys.map((k) => ({
      key: k,
      qty: purchases[k].qty,
      cost: util.money(purchases[k].cost),
    })),
  };
}

function supplierStats(from, to) {
  const d = db.get();
  const sold = soldProducts(from, to);
  const bySupplier = {};
  for (const p of sold) {
    const name = p.supplierName || '未指定货源';
    if (!bySupplier[name]) bySupplier[name] = { name, qty: 0, amount: 0, cost: 0, profit: 0 };
    const row = bySupplier[name];
    row.qty += 1;
    row.amount += Number(p.price) || 0;
    row.cost += rate.costToUsd(p.cost, p.saleRate);
    row.profit += saleProfit(p);
  }
  const totalQty = sold.length;
  const totalAmount = sold.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const rows = Object.values(bySupplier).map((r) => ({
    name: r.name,
    qty: r.qty,
    amount: util.money(r.amount),
    cost: util.money(r.cost),
    profit: util.money(r.profit),
    ratio: totalQty ? Math.round((r.qty / totalQty) * 1000) / 10 : 0,
    amountRatio: totalAmount ? Math.round((r.amount / totalAmount) * 1000) / 10 : 0,
  }));
  rows.sort((a, b) => Number(b.profit) - Number(a.profit));
  return { rows, totalQty, totalAmount: util.money(totalAmount) };
}

function specStats(from, to, coverageDays) {
  const cov = Number(coverageDays) > 0 ? Number(coverageDays) : 14;
  const prods = db.get().products;
  const sold = soldProducts(from, to);
  const fromMs = from.getTime();
  const toMs = Math.min(to.getTime(), Date.now());
  const windowDays = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
  const buildRow = (spec) => {
    const sp = prods.filter((x) => (x.spec || '') === spec);
    const soldSp = sold.filter((x) => (x.spec || '') === spec);
    const stock = sp.filter((x) => x.status === 'instock').length;
    const qty = soldSp.length;
    const amount = soldSp.reduce((s, x) => s + (Number(x.price) || 0), 0);
    const profit = soldSp.reduce((s, x) => s + saleProfit(x), 0);
    const costs = sp.filter((x) => Number(x.cost) > 0).map((x) => Number(x.cost));
    const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
    const velocity = qty / windowDays;
    const coverage = velocity > 0 ? stock / velocity : null;
    const suggested = Math.max(0, Math.ceil(velocity * cov) - stock);
    return {
      spec,
      qty,
      amount: util.money(amount),
      profit: util.money(profit),
      stock,
      avgCost: util.money(avgCost),
      velocity: Math.round(velocity * 1000) / 1000,
      coverageDays: coverage === null ? null : Math.round(coverage * 10) / 10,
      suggested,
      suggestedCost: util.money(suggested * avgCost),
      suggestedCostUsd: util.money(rate.costToUsd(suggested * avgCost, rate.current())),
    };
  };
  const rows = SPEC_LABELS.map(buildRow);
  const totals = {
    sold: rows.reduce((s, r) => s + r.qty, 0),
    stock: rows.reduce((s, r) => s + r.stock, 0),
    suggested: rows.reduce((s, r) => s + r.suggested, 0),
    outgoingCostUsd: util.money(rows.reduce((s, r) => s + Number(r.suggestedCostUsd), 0)),
  };
  return { rows, totals, windowDays, coverage: cov, rangeLabel: util.fmtDate(from) + ' ~ ' + util.fmtDate(new Date(toMs)) };
}

module.exports = { overview, timeline, supplierStats, specStats, soldProducts };