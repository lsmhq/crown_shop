const base = 'http://127.0.0.1:8765';
const j = (r) => r.json();
let pass = 0, fail = 0;

async function t(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  PASS  ' + name);
  } catch (e) {
    fail++;
    console.log('  FAIL  ' + name + ': ' + e.message);
  }
}

async function main() {
  console.log('\n=== 店长宝 完整功能验证 ===\n');

  // 基础
  await t('首页HTML加载', async () => {
    const r = await fetch(base + '/');
    if (!r.ok) throw new Error('status ' + r.status);
    const html = await r.text();
    if (!html.includes('vue.global.prod.js')) throw new Error('缺少 vue');
  });
  await t('Bootstrap API', async () => {
    const d = await api('/api/bootstrap');
    if (!d.settings) throw new Error('no settings');
    if (!Array.isArray(d.products)) throw new Error('no products');
  });

  // 货源
  let supA, supB;
  await t('新增货源A', async () => {
    const r = await api('/api/suppliers', { method: 'POST', body: { name: '华东供货', phone: '021-1234' } });
    supA = r.id;
  });
  await t('新增货源B', async () => {
    const r = await api('/api/suppliers', { method: 'POST', body: { name: '广州批发' } });
    supB = r.id;
  });
  await t('货源列表', async () => {
    const list = await api('/api/suppliers');
    if (list.length !== 2) throw new Error('expected 2, got ' + list.length);
  });
  await t('编辑货源A', async () => {
    await api('/api/suppliers/' + supA, { method: 'PUT', body: { name: '华东供货（总部）', phone: '021-5678' } });
    const list = await api('/api/suppliers');
    const a = list.find((s) => s.id === supA);
    if (a.name !== '华东供货（总部）') throw new Error('name not updated');
  });

  // 客户
  let custA;
  await t('新增客户', async () => {
    const r = await api('/api/customers', { method: 'POST', body: { name: '张三', phone: '13912345678' } });
    custA = r.id;
  });

  // 整批入库
  await t('整批入库A - 卫衣x5', async () => {
    const r = await api('/api/products/bulk-entry', { method: 'POST', body: { name: '卫衣', category: '服装', cost: 35, price: 59, supplierId: supA, count: 5, purchaseAt: '2026-09-01' } });
    if (r.count !== 5) throw new Error('expected 5');
  });
  await t('整批入库B - 牛仔裤x3', async () => {
    await api('/api/products/bulk-entry', { method: 'POST', body: { name: '牛仔裤', category: '服装', cost: 60, price: 99, supplierId: supB, count: 3, purchaseAt: '2026-09-02' } });
  });

  // 单件新增
  let hatId;
  await t('单件新增 - 帽子', async () => {
    const r = await api('/api/products', { method: 'POST', body: { name: '帽子', category: '配饰', cost: 8, price: 20, supplierId: supA } });
    hatId = r.id;
  });
  await t('商品列表 - 在库9件', async () => {
    const list = await api('/api/products?status=instock');
    if (list.length !== 9) throw new Error('expected 9, got ' + list.length);
  });

  // 销售
  let orderId;
  await t('销售开单 - 2卫衣+1帽子', async () => {
    const instock = await api('/api/products?status=instock');
    const w = instock.filter((p) => p.name === '卫衣').slice(0, 2).map((p) => p.id);
    const h = instock.find((p) => p.name === '帽子');
    const r = await api('/api/sales', { method: 'POST', body: {
      productIds: [...w, h.id],
      customer: { id: custA },
      seller: '店员小王',
      note: '测试单'
    } });
    orderId = r.order.id;
    if (r.order.total !== '138.00') throw new Error('total ' + r.order.total);
    if (r.order.profit !== '60.00') throw new Error('profit ' + r.order.profit);
  });

  // 订单
  await t('订单列表', async () => {
    const orders = await api('/api/orders');
    if (orders.length !== 1) throw new Error('expected 1');
    if (orders[0].no !== 'DD2609111') throw new Error('no: ' + orders[0].no);
    if (orders[0].status !== 'normal') throw new Error('status: ' + orders[0].status);
  });
  await t('订单详情', async () => {
    const o = await api('/api/orders/' + orderId);
    if (o.items.length !== 3) throw new Error('items: ' + o.items.length);
  });

  // 退货
  let soldItem;
  await t('单品退货', async () => {
    const sold = await api('/api/products?status=sold');
    soldItem = sold.find((p) => p.name === '帽子');
    await api('/api/orders/' + orderId + '/return-items', { method: 'POST', body: { productIds: [soldItem.id] } });
    const o = await api('/api/orders/' + orderId);
    if (o.status !== 'partial') throw new Error('status after partial: ' + o.status);
  });
  await t('帽子退货后回到在库', async () => {
    const p = await api('/api/products?status=instock');
    const h = p.find((x) => x.name === '帽子');
    if (!h) throw new Error('hat not found in instock');
  });
  await t('整单退货', async () => {
    await api('/api/orders/' + orderId + '/return-all', { method: 'POST', body: {} });
    const o = await api('/api/orders/' + orderId);
    if (o.status !== 'returned') throw new Error('status: ' + o.status);
    const instock = await api('/api/products?status=instock');
    if (instock.length !== 9) throw new Error('instock after return-all: ' + instock.length);
  });

  // 导入
  await t('文本导入解析', async () => {
    const paste = '名称\t成本\t售价\t货源\t数量\n红酒\t100\t188\t华东供货（总部）\t3\n眼镜\t25\t59\t广州批发\t2';
    const r = await api('/api/import/parse', { method: 'POST', body: { type: 'paste', content: paste } });
    if (r.rows.length !== 2) throw new Error('rows: ' + r.rows.length);
  });
  await t('文本导入提交', async () => {
    const paste = '名称\t成本\t售价\t货源\t数量\n红酒\t100\t188\t华东供货（总部）\t3\n眼镜\t25\t59\t广州批发\t2';
    const p = await api('/api/import/parse', { method: 'POST', body: { type: 'paste', content: paste } });
    const r = await api('/api/import/commit', { method: 'POST', body: { rows: p.rows } });
    if (r.imported !== 5) throw new Error('imported: ' + r.imported);
  });

  // 统计
  await t('统计概览', async () => {
    const ov = await api('/api/stats/overview');
    if (Number(ov.soldCount) !== 0) throw new Error('soldCount: ' + ov.soldCount);
    if (Number(ov.instockCount) !== 14) throw new Error('instockCount: ' + ov.instockCount);
  });
  await t('统计时间线', async () => {
    const tl = await api('/api/stats/timeline?from=30d&to=&groupBy=day');
    if (!tl.keys) throw new Error('no keys');
    if (!tl.sales) throw new Error('no sales');
  });
  await t('货源统计', async () => {
    const sup = await api('/api/stats/suppliers?from=30d&to=');
    if (!sup.rows) throw new Error('no rows');
  });

  // 导出
  await t('导出商品Excel', async () => {
    const r = await fetch(base + '/api/export/products.xlsx');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) throw new Error('too small: ' + buf.length);
    if (buf.slice(0, 2).toString('hex') !== '504b') throw new Error('not PK');
  });
  await t('导出订单Excel', async () => {
    const r = await fetch(base + '/api/export/orders.xlsx');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 2).toString('hex') !== '504b') throw new Error('not PK');
  });
  await t('导出货源分成报表', async () => {
    const r = await fetch(base + '/api/export/supplier-profit.xlsx?from=30d&to=');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 2).toString('hex') !== '504b') throw new Error('not PK');
    if (buf.length < 1000) throw new Error('too small');
  });
  await t('下载导入模板', async () => {
    const r = await fetch(base + '/api/template/products.xlsx');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 2).toString('hex') !== '504b') throw new Error('not PK');
  });

  // 备份
  await t('手动备份', async () => {
    const r = await api('/api/system/backup', { method: 'POST', body: { label: 'test' } });
    if (!r.file) throw new Error('no file');
  });
  await t('备份列表', async () => {
    const list = await api('/api/system/backups');
    if (list.length < 1) throw new Error('no backups');
  });

  // 设置
  await t('保存设置', async () => {
    await api('/api/settings', { method: 'PUT', body: { shopName: '测试店铺', sellers: ['张三', '李四'], currentSeller: '李四', codePrefix: 'XH', autoBackupDays: 7 } });
    const d = await api('/api/bootstrap');
    if (d.settings.shopName !== '测试店铺') throw new Error('shopName');
    if (d.settings.sellers.length !== 2) throw new Error('sellers');
    if (d.settings.currentSeller !== '李四') throw new Error('currentSeller');
    if (d.settings.codePrefix !== 'XH') throw new Error('codePrefix');
  });

  // 分类
  await t('获取分类列表', async () => {
    const cats = await api('/api/products/categories');
    if (!cats.includes('服装')) throw new Error('no 服装');
    if (!cats.includes('配饰')) throw new Error('no 配饰');
  });

  // HTML 静态文件
  await t('CSS 文件', async () => {
    const r = await fetch(base + '/css/app.css');
    if (!r.ok) throw new Error('status ' + r.status);
  });
  await t('Vue vendor', async () => {
    const r = await fetch(base + '/vendor/vue.global.prod.js');
    if (!r.ok) throw new Error('status ' + r.status);
  });
  await t('ECharts vendor', async () => {
    const r = await fetch(base + '/vendor/echarts.min.js');
    if (!r.ok) throw new Error('status ' + r.status);
  });

  console.log('\n=== 结果: ' + pass + ' PASSED, ' + fail + ' FAILED ===\n');
  if (fail > 0) process.exit(1);
}

async function api(path, opts) {
  const o = opts || {};
  const res = await fetch(base + path, {
    method: o.method || 'GET',
    headers: o.body ? { 'Content-Type': 'application/json' } : {},
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });