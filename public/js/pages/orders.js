const OrdersPage = {
  template: `
    <div class="card">
      <div class="toolbar">
        <input class="input" style="width:200px" v-model="filters.keyword" placeholder="订单号 / 买家 / 皇冠码" @keyup.enter="load()">
        <select class="select" v-model="filters.status" @change="load()">
          <option value="all">全部状态</option>
          <option value="normal">正常</option>
          <option value="partial">部分退货</option>
          <option value="returned">已退货</option>
        </select>
        <select class="select" v-model="filters.range" @change="load()">
          <option value="">全部时间</option>
          <option value="7d">近7天</option>
          <option value="30d">近30天</option>
          <option value="month">本月</option>
        </select>
        <input class="input" type="date" style="width:135px" v-model="filters.from">
        <span class="muted">至</span>
        <input class="input" type="date" style="width:135px" v-model="filters.to">
        <button class="btn btn-primary" @click="filters.from=filters.from||null;filters.to=filters.to||null;load()">查询</button>
        <span class="spacer"></span>
        <button class="btn btn-outline" @click="exportOrders">导出订单</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th></th><th>订单号</th><th>买家</th><th>时间</th>
              <th class="num">总额</th><th class="num">利润</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!orders.length"><td class="empty" colspan="8">暂无订单</td></tr>
            <template v-for="o in orders" :key="o.id">
              <tr @click="toggleExpand(o)" style="cursor:pointer">
                <td><button class="btn btn-sm btn-ghost" @click.stop="toggleExpand(o)">{{ expanded===o.id ? '▾' : '▸' }}</button></td>
                <td class="kbd-strong">{{ o.no }}</td>
                <td>{{ o.customerName }}</td>
                <td>{{ FMT.fmtDateTime(o.createdAt) }}</td>
                <td class="num"><span class="amount">\${{ FMT.money(o.total) }}</span></td>
                <td class="num"><span class="profit">\${{ FMT.money(o.profit) }}</span></td>
                <td><span class="badge" :class="FMT.orderStatus(o.status).cls">{{ FMT.orderStatus(o.status).text }}</span></td>
<td class="td-ops">
                  <button v-if="o.status!=='returned'" class="btn btn-sm btn-danger" @click.stop="returnAll(o)">整单退货</button>
                </td>
              </tr>
              <tr v-if="expanded===o.id">
                <td colspan="8" style="padding:14px 18px">
                  <div class="detail-box" style="margin-top:0">
                    <div class="detail-meta">
                      <span>买家：<b>{{ o.customerName || '散客' }}</b></span>
                      <span>时间：{{ FMT.fmtDateTime(o.createdAt) }}</span>
                      <span>售出汇率：¥{{ (Number(o.rate) || 7).toFixed(4) }}</span>
                      <span>状态：<span class="badge" :class="FMT.orderStatus(o.status).cls">{{ FMT.orderStatus(o.status).text }}</span></span>
                      <span v-if="o.note" class="b-block">备注：{{ o.note }}</span>
                    </div>
                    <table class="table" style="margin-top:10px">
                      <thead>
                        <tr>
                          <th>皇冠码</th><th>规格</th><th>货源</th><th class="num">成本(¥)</th><th class="num">售价($)</th><th class="num">预计收人民币</th><th class="num">利润($)</th><th class="num">利润(¥)</th><th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="it in o.items" :key="it.productId">
                          <td class="kbd-strong">{{ it.code }}</td>
                          <td><template v-if="it.spec"><img class="spec-icon" :src="specImg(it.spec)" alt=""><span class="spec-label">{{ it.spec }}</span></template><span v-else class="muted">-</span></td>
                          <td>{{ it.supplierName || '-' }}</td>
                          <td class="num">¥{{ FMT.money(it.cost) }}</td>
                          <td class="num">\${{ FMT.money(it.price) }}</td>
                          <td class="num">¥{{ FMT.money(Number(it.price) * (Number(it.rate) || 7)) }}</td>
                          <td class="num"><span class="profit">\${{ FMT.money(Number(it.price) - Number(it.costUsd || (Number(it.cost) || 0) / (Number(it.rate) || 7))) }}</span></td>
                          <td class="num"><span class="profit">¥{{ FMT.money(Number(it.price) * (Number(it.rate) || 7) - Number(it.cost)) }}</span></td>
                          <td>
                            <button class="btn btn-sm btn-danger" :disabled="!findItemStatus(o, it.productId)" @click="returnItem(o, it)">
                              {{ findItemStatus(o, it.productId) ? '单件退货' : '已退' }}
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)">
                      <span class="muted">合计 <b class="amount">\${{ FMT.money(o.total) }}</b>（≈¥{{ FMT.money(Number(o.total) * (Number(o.rate) || 7)) }}）</span>
                      <span class="muted">利润 <b class="profit">\${{ FMT.money(o.profit) }}</b>（≈¥{{ FMT.money(Number(o.profit) * (Number(o.rate) || 7)) }}）</span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>`,

  data() {
    return {
      orders: [],
      expanded: '',
      filters: { keyword: '', status: 'all', range: '30d', from: '', to: '' },
    };
  },
  methods: {
    findItemStatus(o, pid) {
      const p = window.__allProducts && window.__allProducts.find((x) => x.id === pid);
      return p && p.status === 'sold';
    },
    toggleExpand(o) { this.expanded = this.expanded === o.id ? '' : o.id; },
    async load() {
      try {
        const q = new URLSearchParams();
        if (this.filters.keyword) q.set('keyword', this.filters.keyword);
        if (this.filters.status && this.filters.status !== 'all') q.set('status', this.filters.status);
        if (this.filters.range) q.set('from', this.filters.range);
        if (this.filters.from) q.set('from', this.filters.from);
        if (this.filters.to) q.set('to', this.filters.to);
        this.orders = await api('/api/orders?' + q.toString());
      } catch (e) { toast(e.message, 'error'); }
      try {
        window.__allProducts = await api('/api/products');
      } catch (e) { /* ignore */ }
    },
    async returnAll(o) {
      const ok = await askConfirm('整单退货', '确认订单 ' + o.no + ' 全部退货？所有商品将退回在库，利润将取消。', { confirmText: '整单退货', danger: true });
      if (!ok) return;
      try {
        await api('/api/orders/' + o.id + '/return-all', { method: 'POST', body: {} });
        (window.__allProducts || []).forEach((x) => {
          if (x.orderId === o.id) {
            x.status = 'instock';
            x.soldAt = '';
            x.orderId = '';
            x.customerId = '';
            x.customerName = '';
            x.sellerName = '';
          }
        });
        this.load();
        toast('已整单退货', 'success');
      } catch (e) { toast(e.message, 'error'); }
    },
    async returnItem(o, it) {
      const ok = await askConfirm('单件退货', '确认将 ' + it.code + ' 退货回库？', { confirmText: '退货', danger: true });
      if (!ok) return;
      try {
        await api('/api/orders/' + o.id + '/return-items', { method: 'POST', body: { productIds: [it.productId] } });
        const p = (window.__allProducts || []).find((x) => x.id === it.productId);
        if (p) {
          p.status = 'instock';
          p.soldAt = '';
          p.orderId = '';
          p.customerId = '';
          p.customerName = '';
          p.sellerName = '';
        }
        this.load();
        toast('已退货', 'success');
      } catch (e) { toast(e.message, 'error'); }
    },
    exportOrders() {
      const q = {};
      if (this.filters.range) q.from = this.filters.range;
      if (this.filters.from) q.from = this.filters.from;
      if (this.filters.to) q.to = this.filters.to;
      download('/api/export/orders.xlsx', '订单列表.xlsx', q);
    },
  },
  mounted() { this.load(); },
};