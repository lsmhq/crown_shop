const ProductsPage = {
  template: `
    <div>
      <div class="card">
        <div class="toolbar">
          <input class="input" style="width:220px" v-model="filters.keyword" placeholder="搜索皇冠码 / 供货人 / 买家 / 备注" @keyup.enter="load()">
          <select class="select" v-model="filters.status" @change="load()">
            <option value="all">全部状态</option>
            <option value="instock">在库</option>
            <option value="sold">已售出</option>
            <option value="returned">已退货</option>
          </select>
          <select class="select" v-model="filters.supplier" @change="load()">
            <option value="">全部供货人</option>
            <option v-for="s in suppliers" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
          <select class="select" v-model="filters.spec" @change="load()">
            <option value="">全部规格</option>
            <option v-for="s in SPEC_LABELS" :key="s" :value="s">{{ s }}</option>
            <option value="__none__">未设置</option>
          </select>
          <button class="btn btn-primary" @click="load()">查询</button>
          <button class="btn btn-outline" @click="reset()">重置</button>
          <span class="spacer"></span>
          <span v-if="selectedCount" class="kbd-strong">已选 {{ selectedCount }} 条</span>
          <button class="btn btn-danger" :disabled="!selectedCount" @click="batchDelete">批量删除</button>
          <button class="btn btn-outline" @click="exportList">导出</button>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:32px;text-align:center"><input type="checkbox" :checked="allChecked" :indeterminate.prop="someChecked" @change="toggleAll" title="全选当前结果中的在库商品"></th>
                <th class="th-sort" :class="{active: sortKey==='code'}" @click="toggleSort('code')">皇冠码<span class="smark">{{ sortMark('code') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='spec'}" @click="toggleSort('spec')">规格<span class="smark">{{ sortMark('spec') }}</span></th>
                <th class="num th-sort" :class="{active: sortKey==='cost'}" @click="toggleSort('cost')">成本<span class="smark">{{ sortMark('cost') }}</span></th>
                <th class="num th-sort" :class="{active: sortKey==='price'}" @click="toggleSort('price')">售价<span class="smark">{{ sortMark('price') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='supplierName'}" @click="toggleSort('supplierName')">货源<span class="smark">{{ sortMark('supplierName') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='status'}" @click="toggleSort('status')">状态<span class="smark">{{ sortMark('status') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='customerName'}" @click="toggleSort('customerName')">买家<span class="smark">{{ sortMark('customerName') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='purchaseAt'}" @click="toggleSort('purchaseAt')">入库时间<span class="smark">{{ sortMark('purchaseAt') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='soldAt'}" @click="toggleSort('soldAt')">售出时间<span class="smark">{{ sortMark('soldAt') }}</span></th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && !rows.length">
                <td class="empty" colspan="11">暂无商品，点击右上角「整批入库」或「新增商品」录入</td>
              </tr>
              <tr v-for="p in rows" :key="p.id">
                <td style="width:32px;text-align:center"><input type="checkbox" :disabled="p.status!=='instock'" :checked="selected.includes(p.id)" @change="toggleRow(p.id)" :title="p.status!=='instock' ? '已售/退货商品不可删除' : ''"></td>
                <td class="kbd-strong">{{ p.code }}</td>
                <td><template v-if="p.spec"><img class="spec-icon" :src="specImg(p.spec)" alt=""><span class="spec-label">{{ p.spec }}</span></template><span v-else class="muted">-</span></td>
                <td class="num">¥{{ FMT.money(p.cost) }}</td>
                <td class="num">{{ priceText(p) }}</td>
                <td>{{ p.supplierName || '-' }}</td>
                <td><span class="badge" :class="FMT.productStatus(p.status).cls">{{ FMT.productStatus(p.status).text }}</span></td>
                <td>{{ p.customerName || '-' }}</td>
                <td>{{ FMT.fmtDate(p.purchaseAt) }}</td>
                <td>{{ FMT.fmtDateTime(p.soldAt) }}</td>
                <td class="td-ops">
                  <button class="btn btn-sm btn-outline" @click="openEdit(p)">编辑</button>
                  <button v-if="p.status==='sold'" class="btn btn-sm btn-danger" @click="doReturn(p)">退库</button>
                  <button v-if="p.status==='instock'" class="btn btn-sm btn-danger" @click="doDelete(p)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span>共 {{ total }} 条</span>
          <button class="btn btn-sm btn-outline" :disabled="page<=1" @click="page--;load()">上一页</button>
          <span>{{ page }} / {{ totalPages || 1 }}</span>
          <button class="btn btn-sm btn-outline" :disabled="page>=totalPages" @click="page++;load()">下一页</button>
        </div>
      </div>

      <div class="modal-mask" v-if="form.show">
        <div class="modal">
          <div class="modal-head">
            <span>{{ form.isEdit ? '编辑商品 ' + (form.current ? form.current.code : '') : '新增商品' }}</span>
            <span class="close" @click="form.show=false">&times;</span>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-item">
                <label>皇冠码 <span class="req">*</span></label>
                <input class="input" v-model="form.code" placeholder="皇冠码即商品本身，如 381LD-812Z6-784DC-422D3" :disabled="form.isEdit">
                <div class="muted" style="font-size:11px;margin-top:4px">皇冠码是商品的唯一标识，保存后不可修改。</div>
              </div>
              <div class="form-item">
                <label>成本（人民币）<span class="req">*</span></label>
                <input class="input" type="number" step="0.01" v-model.number="form.cost">
              </div>
              <div class="form-item">
                <label>供货人 <span class="req">*</span></label>
                <select class="select wide" v-model="form.supplierName">
                  <option value="">请选择供货人</option>
                  <option v-for="s in suppliers" :key="s.name" :value="s.name">{{ s.name }}</option>
                </select>
                <div class="muted" style="font-size:11px;margin-top:4px">供货人在「供货人」菜单中新增，商品必须归属一个供货人。</div>
              </div>
              <div class="form-item">
                <label>规格 <span :class="form.spec ? 'req' : 'muted'" style="font-size:11px">可选</span></label>
                <select class="select wide" v-model="form.spec">
                  <option value="">未设置</option>
                  <option v-for="s in SPEC_LABELS" :key="s" :value="s">{{ s }}</option>
                </select>
                <div class="muted" style="font-size:11px;margin-top:4px">规格对应皇冠等级图，售出时跟随商品。</div>
              </div>
              <div class="form-item">
                <label>备注</label>
                <input class="input" v-model="form.note">
              </div>
              <div style="grid-column:1/-1" class="muted">售价和买家在售出时再填写。</div>
            </div>
            <div v-if="form.isEdit && form.current && form.current.status==='sold'" class="detail-box" style="margin-top:12px">
              <span class="badge badge-red">已售出</span>
              <span class="muted"> 已售商品只能调整备注。</span>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-outline" @click="form.show=false">取消</button>
            <button class="btn btn-primary" :disabled="submitting" @click="save">{{ submitting ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </div>`,
  data() {
    return {
      loading: false,
      rows: [],
      all: [],
      total: 0,
      page: 1,
      pageSize: 50,
      suppliers: [],
      settings: {},
      filters: { keyword: '', status: 'all', supplier: '', spec: '' },
      sortKey: 'purchaseAt',
      sortDir: 1,
      selected: [],
      form: { show: false, isEdit: false, current: null, code: '', cost: null, price: null, supplierName: '', spec: '', note: '' },
      submitting: false,
    };
  },
  computed: {
    totalPages() { return Math.max(1, Math.ceil(this.total / this.pageSize)); },
    selectableList() { return this.all.filter((p) => p.status === 'instock'); },
    selectedCount() { return this.selected.length; },
    allChecked() { return this.selectableList.length > 0 && this.selectableList.every((p) => this.selected.includes(p.id)); },
    someChecked() { return this.selected.length > 0 && !this.allChecked; },
  },
  methods: {
    sortMark(key) { return this.sortKey === key ? (this.sortDir === 1 ? '▲' : '▼') : ''; },
    toggleSort(key) {
      if (this.sortKey === key) this.sortDir = -this.sortDir;
      else { this.sortKey = key; this.sortDir = key === 'purchaseAt' ? 1 : -1; }
      this.page = 1;
      this.applySort();
    },
    applySort() {
      this.rows = sortProducts(this.all, this.sortKey, this.sortDir).slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
    },
    async load() {
      this.selected = [];
      this.loading = true;
      try {
        const q = new URLSearchParams();
        Object.entries(this.filters).forEach(([k, v]) => { if (v && v !== 'all') q.set(k, v); });
        q.set('page', this.page);
        q.set('pageSize', this.pageSize);
        const list = await api('/api/products?' + q.toString());
        this.all = list;
        this.total = list.length;
        this.applySort();
      } catch (e) { toast(e.message, 'error'); }
      this.loading = false;
    },
    async loadMeta() {
      try {
        const d = await api('/api/bootstrap');
        this.suppliers = d.suppliers || [];
        this.settings = d.settings || {};
      } catch (e) { toast(e.message, 'error'); }
    },
    reset() {
      this.filters = { keyword: '', status: 'all', supplier: '', spec: '' };
      this.page = 1;
      this.load();
    },
    openEdit(p) {
      Object.assign(this.form, {
        show: true, isEdit: true, current: p,
        code: p.code, cost: p.cost, price: p.price,
        supplierName: p.supplierName || '', spec: p.spec || '', note: p.note || '',
      });
    },
    async save() {
      const f = this.form;
      if (!f.code.trim()) return toast('请填写皇冠码', 'warn');
      if (!f.supplierName.trim()) return toast('请选择供货人', 'warn');
      if (f.cost === null || isNaN(f.cost)) return toast('请填写成本', 'warn');
      this.submitting = true;
      try {
        const body = { code: f.code.trim(), cost: f.cost, note: f.note, supplierName: f.supplierName, spec: f.spec };
        if (f.isEdit) {
          await api('/api/products/' + f.current.id, { method: 'PUT', body });
        } else {
          await api('/api/products', { method: 'POST', body });
        }
        toast('保存成功', 'success');
        this.form.show = false;
        this.load();
        this.loadMeta();
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
      this.submitting = false;
    },
    async doReturn(p) {
      const ok = await askConfirm('商品退库', '确认将商品 ' + p.code + ' 退回在库？该商品将从已售商品中扣除。', { confirmText: '退库', danger: true });
      if (!ok) return;
      try {
        await api('/api/products/return', { method: 'POST', body: { id: p.id } });
        toast('已退回在库', 'success');
        this.load();
      } catch (e) { toast(e.message, 'error'); }
    },
    async doDelete(p) {
      const ok = await askConfirm('删除商品', '确认删除商品 ' + p.code + ' ？删除后不可恢复。', { confirmText: '删除', danger: true });
      if (!ok) return;
      try {
        await api('/api/products/' + p.id, { method: 'DELETE' });
        toast('已删除', 'success');
        this.load();
      } catch (e) { toast(e.message, 'error'); }
    },
    toggleAll(ev) {
      this.selected = ev.target.checked ? this.selectableList.map((p) => p.id) : [];
    },
    toggleRow(id) {
      const i = this.selected.indexOf(id);
      if (i >= 0) this.selected.splice(i, 1);
      else this.selected.push(id);
    },
    async batchDelete() {
      const n = this.selected.length;
      if (!n) return;
      const ok = await askConfirm('批量删除商品', '确认删除选中的 ' + n + ' 个在库商品？删除后不可恢复。', { confirmText: '删除', danger: true });
      if (!ok) return;
      try {
        const r = await api('/api/products/batch-delete', { method: 'POST', body: { ids: this.selected } });
        const parts = ['已删除 ' + r.deleted + ' 个商品'];
        if (r.skipped > 0) parts.push('跳过 ' + r.skipped + ' 个已售/退货商品');
        toast(parts.join('，'), 'success');
        this.selected = [];
        this.load();
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
    },
    exportList() {
      const q = new URLSearchParams();
      Object.entries(this.filters).forEach(([k, v]) => { if (v && v !== 'all') q.set(k, v); });
      download('/api/export/products.xlsx', '商品列表.xlsx', q);
    },
    priceText(p) {
      if (p.status === 'instock' || p.price === null || p.price === undefined || p.price === '') return '待定';
      return '$' + FMT.money(p.price);
    },
  },
  mounted() { this.load(); this.loadMeta(); },
};