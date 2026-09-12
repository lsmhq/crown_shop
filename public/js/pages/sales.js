const SalesPage = {
  template: `
    <div class="split">
      <div class="card">
        <div class="toolbar">
          <input class="input" style="width:180px" v-model="filters.keyword" placeholder="搜索皇冠码 / 进货人" @keyup.enter="load()">
          <select class="select" v-model="filters.supplier" @change="load()">
            <option value="">全部进货人</option>
            <option v-for="s in suppliers" :key="s.id || s.name" :value="s.name">{{ s.name }}</option>
          </select>
          <select class="select" v-model="filters.spec" @change="load()">
            <option value="">全部规格</option>
            <option v-for="s in SPEC_LABELS" :key="s" :value="s">{{ s }}</option>
            <option value="__none__">未设置</option>
          </select>
          <button class="btn btn-primary" @click="load()">查询</button>
          <span class="spacer"></span>
          <span class="muted">点击「加入」选择要出售的在库商品</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="th-sort" :class="{active: sortKey==='code'}" @click="toggleSort('code')">皇冠码<span class="smark">{{ sortMark('code') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='spec'}" @click="toggleSort('spec')">规格<span class="smark">{{ sortMark('spec') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='supplierName'}" @click="toggleSort('supplierName')">货源<span class="smark">{{ sortMark('supplierName') }}</span></th>
                <th class="num th-sort" :class="{active: sortKey==='cost'}" @click="toggleSort('cost')">成本<span class="smark">{{ sortMark('cost') }}</span></th>
                <th class="num th-sort" :class="{active: sortKey==='purchaseAt'}" @click="toggleSort('purchaseAt')">入库时间<span class="smark">{{ sortMark('purchaseAt') }}</span></th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!rows.length"><td class="empty" colspan="6">没有可售的在库商品（{{ filters.keyword || '当前筛选' }}）</td></tr>
              <tr v-for="p in rows" :key="p.id" :class="{ dim: isInCart(p) }">
                <td class="kbd-strong">{{ p.code }}</td>
                <td><template v-if="p.spec"><img class="spec-icon" :src="specImg(p.spec)" alt=""><span class="spec-label">{{ p.spec }}</span></template><span v-else class="muted">-</span></td>
                <td>{{ p.supplierName || '-' }}</td>
                <td class="num">¥{{ FMT.money(p.cost) }}</td>
                <td class="num">{{ FMT.fmtDate(p.purchaseAt) }}</td>
                <td>
                  <button class="btn btn-sm" :class="isInCart(p) ? 'btn-outline' : 'btn-primary'" @click="toggleCart(p)">
                    {{ isInCart(p) ? '移除' : '加入' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span>共 {{ total }} 件在库</span>
          <button class="btn btn-sm btn-outline" :disabled="page<=1" @click="page--;load()">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-sm btn-outline" :disabled="page>=totalPages" @click="page++;load()">下一页</button>
        </div>
      </div>

      <div class="card" style="position:sticky;top:16px">
        <div class="card-title">收银（购物车）<span class="badge badge-red" v-if="cart.length">{{ cart.length }} 件</span></div>
        <div v-if="!cart.length" class="muted" style="padding:20px 0;text-align:center">购物车为空，从左侧选择商品</div>
        <div v-for="p in cart" :key="p.id" class="cart-item" style="flex-wrap:wrap">
          <div class="info" style="width:100%">
            <div><span class="kbd-strong">{{ p.code }}</span></div>
            <div class="muted" style="font-size:12px;margin-bottom:6px">
              <template v-if="p.spec"><img class="spec-icon" :src="specImg(p.spec)" alt=""><span class="spec-label">{{ p.spec }}</span> · </template>
              {{ p.supplierName || '-' }} · 成本 ¥{{ FMT.money(p.cost) }}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <label class="muted" style="font-size:12px;margin:0">售价：</label>
            <input class="input" type="number" step="0.01" style="width:90px;padding:2px 6px;font-size:13px" v-model.number="p._price" placeholder="必填" min="0">
            <span class="muted" style="font-size:12px" v-if="p._price">≈¥{{ FMT.money(itemRmb(p)) }} · 利润 ¥{{ FMT.money(itemRmbProfit(p)) }}</span>
            <button class="btn btn-sm btn-ghost" style="margin-left:auto;color:#dc2626" @click="removeCart(p.id)">删除</button>
          </div>
        </div>

        <div v-if="cart.length" style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 0;border-top:1px dashed var(--border);padding-top:10px">
          <span class="muted">合计 <b class="amount">\${{ FMT.money(cartTotal) }}</b> <span class="muted">≈¥{{ FMT.money(cartTotalRmb) }}</span></span>
          <span class="muted">预估利润 <b class="profit">\${{ FMT.money(cartProfit) }}</b> ≈¥{{ FMT.money(cartProfitRmb) }}</span>
        </div>
        <div v-if="cart.length" class="muted" style="font-size:12px;margin-top:4px;text-align:right">实时汇率 ¥{{ rateNow().toFixed(4) }}（{{ rateUpdated() || '未更新' }}）</div>

        <div style="margin-top:16px">
          <div class="form-item" style="margin-bottom:10px">
            <label>卖给谁</label>
            <input class="input" style="width:100%" v-model="buyer" placeholder="买家姓名（选填，不填记为散客）">
          </div>
          <div class="form-item" style="margin-bottom:10px">
            <label>备注</label>
            <textarea class="input" rows="2" v-model="note" placeholder="选填"></textarea>
          </div>
          <button class="btn btn-success" style="width:100%;height:40px;font-size:15px" :disabled="submitting || !cart.length" @click="checkout">
            {{ submitting ? '出单中…' : '确认售出 · ' + (cart.length ? '$' + FMT.money(cartTotal) : '') }}
          </button>
        </div>
      </div>
    </div>`,
  data() {
    return {
      rows: [],
      all: [],
      total: 0,
      page: 1,
      pageSize: 30,
      suppliers: [],
      filters: { keyword: '', supplier: '', spec: '' },
      sortKey: 'purchaseAt',
      sortDir: 1,
      cart: [],
      buyer: '',
      note: '',
      submitting: false,
      cnyRate: 7,
    };
  },
  computed: {
    totalPages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); },
    cartTotal() { return this.cart.reduce((s, p) => s + (Number(p._price) || 0), 0); },
    cartProfit() { return this.cart.reduce((s, p) => s + (Number(p._price) || 0) - this.itemCostUsd(p), 0); },
    cartTotalRmb() { return this.cartTotal * this.rateNow(); },
    cartProfitRmb() { return this.cartProfit * this.rateNow(); },
  },
  methods: {
    isInCart(p) { return this.cart.some((x) => x.id === p.id); },
    rateNow() {
      const r = window.__rate ? Number(window.__rate.rate) : NaN;
      return !isNaN(r) && r > 0 ? r : (Number(this.cnyRate) || 7);
    },
    rateUpdated() {
      const t = window.__rate && window.__rate.updatedAt;
      return t ? FMT.fmtDateTime(t) : '';
    },
    sortMark(key) { return this.sortKey === key ? (this.sortDir === 1 ? '▲' : '▼') : ''; },
    toggleSort(key) {
      if (this.sortKey === key) this.sortDir = -this.sortDir;
      else { this.sortKey = key; this.sortDir = key === 'purchaseAt' ? 1 : -1; }
      this.page = 1;
    },
    itemCostUsd(p) { return (Number(p.cost) || 0) / this.rateNow(); },
    itemProfit(p) { return (Number(p._price) || 0) - this.itemCostUsd(p); },
    itemRmb(p) { return (Number(p._price) || 0) * this.rateNow(); },
    itemRmbProfit(p) { return this.itemRmb(p) - (Number(p.cost) || 0); },
    toggleCart(p) {
      const i = this.cart.findIndex((x) => x.id === p.id);
      if (i >= 0) { this.cart.splice(i, 1); return; }
      this.cart.push({ ...p, _price: p.price || null });
    },
    removeCart(id) { this.cart = this.cart.filter((x) => x.id !== id); },
    setRows(list) {
      this.all = list;
      this.total = list.length;
      this.rows = sortProducts(this.all, this.sortKey, this.sortDir).slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
    },
    async load() {
      try {
        const q = new URLSearchParams({ status: 'instock' });
        if (this.filters.keyword) q.set('keyword', this.filters.keyword);
        if (this.filters.supplier) q.set('supplier', this.filters.supplier);
        if (this.filters.spec) q.set('spec', this.filters.spec);
        this.setRows(await api('/api/products?' + q.toString()));
      } catch (e) { toast(e.message, 'error'); }
    },
    async loadMeta() {
      try {
        const [sl, r] = await Promise.all([
          api('/api/suppliers').catch(() => null),
          api('/api/rate').catch(() => null),
        ]);
        this.suppliers = sl || [];
        if (r && window.__rate) { window.__rate.rate = r.rate; window.__rate.updatedAt = r.updatedAt || ''; window.__rate.source = r.source || ''; }
        this.cnyRate = Number(r && r.rate) || 7;
      } catch (e) { /* 保持当前汇率 */ }
    },
    async checkout() {
      // 校验每件商品都有售价
      for (const p of this.cart) {
        if (!p._price && p._price !== 0) {
          toast(p.code + ' 尚未填写售价', 'warn');
          return;
        }
        if (isNaN(Number(p._price)) || Number(p._price) < 0) {
          toast(p.code + ' 的售价格式不正确', 'warn');
          return;
        }
      }
      this.submitting = true;
      try {
        const r = await api('/api/sales', { method: 'POST', body: {
          items: this.cart.map((p) => ({ id: p.id, price: p._price })),
          buyer: this.buyer.trim(),
          note: this.note,
        } });
        this.cart = [];
        this.note = '';
        this.buyer = '';
        toast('出单成功：' + r.order.no + '，共' + r.order.items.length + '件，$' + r.order.total, 'success');
        this.load();
        this.loadMeta();
      } catch (e) { toast(e.message, 'error'); }
      this.submitting = false;
    },
  },
  mounted() { this.loadMeta(); this.load(); },
};