const base = 'http://127.0.0.1:8765';
const j = (r) => r.json();

async function main() {
  // 1 新增货源
  let r = await fetch(base + '/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '测试货源A', phone: '13800000000' }) }).then(j);
  console.log('addSupplier:', JSON.stringify(r));
  const supA = r.id;
  r = await fetch(base + '/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '测试货源B' }) }).then(j);
  const supB = r.id;

  // 2 整批入库
  r = await fetch(base + '/api/products/bulk-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '卫衣', category: '服装', cost: 35, price: 59, supplierId: supA, count: 3, purchaseAt: '2026-09-01' }) }).then(j);
  console.log('bulkEntry A:', JSON.stringify(r));
  r = await fetch(base + '/api/products/bulk-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '牛仔裤', category: '服装', cost: 60, price: 99, supplierId: supB, count: 2, purchaseAt: '2026-09-02' }) }).then(j);
  console.log('bulkEntry B:', JSON.stringify(r));

  // 3 单件新增
  r = await fetch(base + '/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '帽子', category: '配饰', cost: 8, price: 20, supplierName: '测试货源A' }) }).then(j);
  console.log('addProduct:', JSON.stringify(r));

  // 4 创建销售（买 2 件卫衣 + 1 帽子）
  const prods = await fetch(base + '/api/products?status=instock').then(j);
  const ids = prods.filter((x) => x.name === '卫衣').slice(0, 2).map((x) => x.id);
  const hat = prods.find((x) => x.name === '帽子');
  ids.push(hat.id);
  r = await fetch(base + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds: ids, customer: { name: '张先生', phone: '13900000000' }, seller: '店员小王', note: '测试单' }) }).then(j);
  console.log('createSale:', JSON.stringify(r));

  // 5 统计
  r = await fetch(base + '/api/stats/overview').then(j);
  console.log('overview:', JSON.stringify(r));
  r = await fetch(base + '/api/stats/timeline?groupBy=day&from=2026-08-01&to=2026-09-30').then(j);
  console.log('timeline sales:', JSON.stringify(r.sales.slice(0, 2)), 'purchase keys:', r.purchases.length);
  r = await fetch(base + '/api/stats/suppliers?from=2026-08-01&to=2026-09-30').then(j);
  console.log('supplierStats:', JSON.stringify(r));

  // 6 订单
  const orders = await fetch(base + '/api/orders').then(j);
  console.log('orders count:', orders.length, 'status:', orders[0].status, 'total:', orders[0].total);

  // 7 单品退货
  const sold = await fetch(base + '/api/products?status=sold').then(j);
  r = await fetch(base + '/api/orders/' + orders[0].id + '/return-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds: [sold[0].id] }) }).then(j);
  console.log('return-item:', JSON.stringify(r));
  const oo = await fetch(base + '/api/orders/' + orders[0].id).then(j);
  console.log('order status after partial return:', oo.status);

  // 8 导入（粘贴文本）
  const paste = '商品名称\t成本\t售价\t货源\t数量\t备注\n进口红酒\t120\t199\t测试货源A\t2\t进口\n';
  r = await fetch(base + '/api/import/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'paste', content: paste }) }).then(j);
  console.log('import parse rows:', r.rows.length, 'errors:', r.errors.length);
  r = await fetch(base + '/api/import/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: r.rows }) }).then(j);
  console.log('import commit:', JSON.stringify(r));

  // 9 导出文件头检查
  const exp = await fetch(base + '/api/export/supplier-profit.xlsx?from=2026-08-01&to=2026-09-30');
  const buf = Buffer.from(await exp.arrayBuffer());
  console.log('export supplier-profit.xlsx bytes:', buf.length, 'sig:', buf.slice(0, 2).toString('hex') === '504b' ? 'OK-PK' : 'BAD');

  // 10 分类
  r = await fetch(base + '/api/products/categories').then(j);
  console.log('categories:', JSON.stringify(r));

  // 11 备份
  r = await fetch(base + '/api/system/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'smoke' }) }).then(j);
  console.log('backup:', JSON.stringify(r));
  r = await fetch(base + '/api/system/backups').then(j);
  console.log('backups list:', r.map((b) => b.file).join(', '));

  console.log('\nALL SMOKE TESTS PASSED');
}

main().catch((e) => { console.error('TEST FAILED:', e); process.exit(1); });