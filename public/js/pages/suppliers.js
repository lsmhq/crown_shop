const SuppliersPage = {
  template: `
    <div>
      <div v-if="!detail" class="card">
        <div class="toolbar">
          <input class="input" style="width:220px" v-model="newName" placeholder="输入供货人姓名" @keyup.enter="addSupplier()">
          <button class="btn btn-primary" @click="addSupplier">新增供货人</button>
          <input class="input" style="width:180px;margin-left:12px" v-model="keyword" placeholder="搜索供货人" @keyup.enter="applyFilter()">
          <button class="btn btn-outline" @click="applyFilter">查询</button>
        </div>
        <div class="detail-box" style="margin-bottom:12px">
          先新增供货人，再点击供货人进入其商品列表，在该供货人下新增商品。
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>供货人</th>
                <th class="num">在库商品</th>
                <th class="num">已售出</th>
                <th class="num">成本合计(¥)</th>
                <th class="num">售出金额($)</th>
                <th class="num">售出利润($)</th>
                <th>最近入库</th>
                <th style="width:240px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && !shownSuppliers.length">
                <td class="empty" colspan="8">暂无供货人，先在上方新增</td>
              </tr>
              <tr v-for="s in shownSuppliers" :key="s.name">
                <td class="kbd-strong">{{ s.name }}</td>
                <td class="num">{{ countBy(s.name, 'instock') }}</td>
                <td class="num">{{ countBy(s.name, 'sold') }}</td>
                <td class="num">{{ instockCostText(s.name) }}</td>
                <td class="num"><span class="amount" v-if="soldStats(s.name).qty">\${{ FMT.money(soldStats(s.name).amount) }}</span><span v-else>-</span></td>
                <td class="num"><span class="profit" v-if="soldStats(s.name).qty">\${{ FMT.money(soldStats(s.name).profit) }}</span><span v-else>-</span></td>
                <td>{{ lastPurchaseAt(s.name) }}</td>
                <td class="td-ops">
                  <button class="btn btn-sm btn-primary" @click="openDetail(s)">管理商品</button>
                  <button class="btn btn-sm btn-outline" @click="renameSupplier(s)">重命名</button>
                  <button class="btn btn-sm btn-danger" @click="removeSupplier(s)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="card">
        <div class="toolbar">
          <button class="btn btn-outline" @click="detail=null">← 返回供货人列表</button>
          <span class="kbd-strong" style="font-size:15px;margin-left:12px">{{ detail.name }}</span>
          <span class="muted"> 共 {{ detailProducts.length }} 件商品</span>
          <span class="spacer"></span>
          <button class="btn btn-success" @click="openBulk">整批入库</button>
          <button class="btn btn-primary" @click="openAdd">新增商品</button>
        </div>
        <div class="detail-box" style="margin-bottom:12px">
          以下商品均归属于「{{ detail.name }}」，新增/整批入库时自动带出供货人，无需重复填写。
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="th-sort" :class="{active: sortKey==='code'}" @click="toggleSort('code')">皇冠码<span class="smark">{{ sortMark('code') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='spec'}" @click="toggleSort('spec')">规格<span class="smark">{{ sortMark('spec') }}</span></th>
                <th class="num th-sort" :class="{active: sortKey==='cost'}" @click="toggleSort('cost')">成本<span class="smark">{{ sortMark('cost') }}</span></th>
                <th class="num th-sort" :class="{active: sortKey==='price'}" @click="toggleSort('price')">售价<span class="smark">{{ sortMark('price') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='status'}" @click="toggleSort('status')">状态<span class="smark">{{ sortMark('status') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='customerName'}" @click="toggleSort('customerName')">买家<span class="smark">{{ sortMark('customerName') }}</span></th>
                <th class="th-sort" :class="{active: sortKey==='purchaseAt'}" @click="toggleSort('purchaseAt')">入库时间<span class="smark">{{ sortMark('purchaseAt') }}</span></th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && !detailProducts.length">
                <td class="empty" colspan="8">该供货人暂无商品，点击右上角「新增商品」录入</td>
              </tr>
              <tr v-for="p in sortedDetail" :key="p.id">
                <td class="kbd-strong">{{ p.code }}</td>
                <td><template v-if="p.spec"><img class="spec-icon" :src="specImg(p.spec)" alt=""><span class="spec-label">{{ p.spec }}</span></template><span v-else class="muted">-</span></td>
                <td class="num">¥{{ FMT.money(p.cost) }}</td>
                <td class="num">{{ priceText(p) }}</td>
                <td><span class="badge" :class="FMT.productStatus(p.status).cls">{{ FMT.productStatus(p.status).text }}</span></td>
                <td>{{ p.customerName || '-' }}</td>
                <td>{{ FMT.fmtDate(p.purchaseAt) }}</td>
                <td class="td-ops">
                  <button class="btn btn-sm btn-outline" @click="openEdit(p)">编辑</button>
                  <button v-if="p.status==='sold'" class="btn btn-sm btn-danger" @click="doReturn(p)">退库</button>
                  <button v-if="p.status==='instock'" class="btn btn-sm btn-danger" @click="doDelete(p)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
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
                <label>供货人</label>
                <input class="input" v-model="form.supplierName" readonly>
              </div>
              <div class="form-item">
                <label>成本（人民币）<span class="req">*</span></label>
                <input class="input" type="number" step="0.01" v-model.number="form.cost">
              </div>
              <div class="form-item">
                <label>规格 <span class="muted" style="font-size:11px">可选</span></label>
                <select class="select wide" v-model="form.spec">
                  <option value="">未设置</option>
                  <option v-for="s in SPEC_LABELS" :key="s" :value="s">{{ s }}</option>
                </select>
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

      <div class="modal-mask" v-if="bulk.show">
        <div class="modal modal-lg">
          <div class="modal-head">
            <span>整批入库</span>
            <span class="close" @click="bulk.show=false">&times;</span>
          </div>
          <div class="modal-body">
            <div class="detail-box" style="margin-bottom:12px">
              准备一个全是皇冠码的文件（Excel 一个单元格对应一个皇冠码；txt 每行一个皇冠码）或直接粘贴皇冠码文本，填入成本即可入库，供货人为「{{ detail ? detail.name : '' }}」。若文件带“皇冠码”表头会自动跳过表头行。
            </div>
            <div class="form-grid">
              <div class="form-item full">
                <label>上传皇冠码文件 <span class="btn btn-sm btn-outline" style="margin:0 8px" @click="pickBulkFile">选择文件</span>
                  <span class="muted" style="font-size:12px">{{ bulk.fileName || '支持 .txt / .xlsx / .xls' }}</span>
                </label>
                <input ref="bulkFileInput" type="file" accept=".txt,.xlsx,.xls" style="display:none" @change="onBulkFile">
              </div>
              <div class="form-item full">
                <label>皇冠码 <span class="req">*</span></label>
                <textarea class="input" style="height:130px;font-family:monospace" v-model="bulk.codesText" placeholder="每行一个皇冠码，如：&#10;381LD-812Z6-784DC-422D3&#10;381LD-812Z6-784DC-422D4"></textarea>
              </div>
              <div class="form-item">
                <label>成本（人民币）<span class="req">*</span></label>
                <input class="input" type="number" step="0.01" v-model.number="bulk.cost">
              </div>
              <div class="form-item">
                <label>规格 <span class="muted" style="font-size:11px">可选</span></label>
                <select class="select" v-model="bulk.spec">
                  <option value="">未设置</option>
                  <option v-for="s in SPEC_LABELS" :key="s" :value="s">{{ s }}</option>
                </select>
                <div class="muted" style="font-size:11px;margin-top:4px">本批统一规格。</div>
              </div>
              <div class="form-item">
                <label>入库时间</label>
                <input class="input" type="date" v-model="bulk.purchaseDate">
              </div>
              <div class="form-item">
                <label>备注</label>
                <input class="input" v-model="bulk.note">
              </div>
            </div>
            <div class="stat-grid" style="margin-top:10px;margin-bottom:0">
              <div class="stat-card"><div class="label">皇冠码数量</div><div class="value">{{ bulkCodes.length }} 个</div></div>
              <div class="stat-card"><div class="label">本次成本合计 (¥)</div><div class="value">¥{{ FMT.money((bulk.cost||0)*bulkCodes.length) }}</div></div>
              <div class="stat-card"><div class="label">预期售出价</div><div class="value muted">售出时填写</div></div>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-outline" @click="bulk.show=false">取消</button>
            <button class="btn btn-primary" :disabled="submitting" @click="saveBulk">{{ submitting ? '入库中…' : '确认入库' }}</button>
          </div>
        </div>
      </div>
    </div>`,
  data() {
    return {
      loading: false,
      suppliers: [],
      allProducts: [],
      settings: {},
      detail: null,
      detailProducts: [],
      newName: '',
      keyword: '',
      form: { show: false, isEdit: false, current: null, code: '', supplierName: '', cost: null, spec: '', note: '' },
      bulk: { show: false, codesText: '', fileName: '', cost: null, spec: '', purchaseDate: FMT.today(), note: '' },
      submitting: false,
      cnyRate: 7,
      sortKey: 'purchaseAt',
      sortDir: 1,
    };
  },
  computed: {
    shownSuppliers() {
      const kw = this.keyword.trim().toLowerCase();
      if (!kw) return this.suppliers;
      return this.suppliers.filter((s) => s.name.toLowerCase().includes(kw));
    },
    bulkCodes() { return (this.bulk.codesText || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean); },
    sortedDetail() { return sortProducts(this.detailProducts, this.sortKey, this.sortDir); },
  },
  methods: {
    sortMark(key) { return this.sortKey === key ? (this.sortDir === 1 ? '▲' : '▼') : ''; },
    toggleSort(key) {
      if (this.sortKey === key) this.sortDir = -this.sortDir;
      else { this.sortKey = key; this.sortDir = key === 'purchaseAt' ? 1 : -1; }
    },
    prodsOf(name) {
      return this.allProducts.filter((p) => (p.supplierName || '') === name);
    },
    countBy(name, status) {
      return this.prodsOf(name).filter((p) => p.status === status).length;
    },
    soldStats(name) {
      const list = this.prodsOf(name).filter((p) => p.status === 'sold');
      let amount = 0, profit = 0;
      for (const p of list) {
        const price = Number(p.price) || 0;
        const rate = Number(p.saleRate) || this.cnyRate || 7;
        amount += price;
        profit += price - (Number(p.cost) || 0) / rate;
      }
      return { qty: list.length, amount, profit };
    },
    instockCostText(name) {
      const list = this.prodsOf(name).filter((p) => p.status === 'instock');
      const sum = list.reduce((a, p) => a + (Number(p.cost) || 0), 0);
      return list.length ? '¥' + FMT.money(sum) : '-';
    },
    lastPurchaseAt(name) {
      const list = this.prodsOf(name);
      if (!list.length) return '-';
      list.sort((a, b) => (b.purchaseAt || '').localeCompare(a.purchaseAt || ''));
      return FMT.fmtDate(list[0].purchaseAt);
    },
    applyFilter() { /* computed handles it */ },
    async addSupplier() {
      const name = (this.newName || '').trim();
      if (!name) return toast('请填写供货人姓名', 'warn');
      if (this.suppliers.some((s) => s.name === name)) return toast('该供货人已存在', 'warn');
      try {
        await api('/api/suppliers', { method: 'POST', body: { name } });
        toast('已新增供货人 ' + name, 'success');
        this.newName = '';
        this.loadMeta();
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
    },
    async renameSupplier(s) {
      const name = prompt('输入新的供货人姓名：', s.name);
      if (name === null) return;
      const n = String(name).trim();
      if (!n) return toast('供货人姓名不能为空', 'warn');
      if (n === s.name) return;
      try {
        await api('/api/suppliers/' + s.id, { method: 'PUT', body: { name } });
        toast('已重命名', 'success');
        this.loadMeta();
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
    },
    async removeSupplier(s) {
      const n = this.prodsOf(s.name).length;
      const ok = await askConfirm('删除供货人', '确认删除供货人「' + s.name + '」？' + (n ? '该供货人下还有 ' + n + ' 件商品，需先删除或转移。' : ''), { confirmText: '删除', danger: true });
      if (!ok) return;
      try {
        await api('/api/suppliers/' + s.id, { method: 'DELETE' });
        toast('已删除', 'success');
        this.loadMeta();
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
    },
    openDetail(s) {
      this.detail = s;
      this.loadDetail(s.name);
    },
    async loadDetail(name) {
      this.loading = true;
      try {
        this.detailProducts = await api('/api/products?supplier=' + encodeURIComponent(name));
      } catch (e) { toast(e.message, 'error'); }
      this.loading = false;
    },
    openAdd() {
      Object.assign(this.form, { show: true, isEdit: false, current: null, code: '', supplierName: this.detail ? this.detail.name : '', cost: null, spec: '', note: '' });
    },
    openEdit(p) {
      Object.assign(this.form, {
        show: true, isEdit: true, current: p,
        code: p.code, supplierName: p.supplierName || (this.detail ? this.detail.name : ''), cost: p.cost, spec: p.spec || '', note: p.note || '',
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
        if (this.detail) this.loadDetail(this.detail.name);
        this.loadMeta();
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
      this.submitting = false;
    },
    openBulk() {
      Object.assign(this.bulk, { show: true, codesText: '', fileName: '', cost: null, spec: '', purchaseDate: FMT.today(), note: '' });
    },
    pickBulkFile() { this.$refs.bulkFileInput.click(); },
    async onBulkFile(e) {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) return toast('文件超过 20MB', 'error');
      this.bulk.fileName = f.name;
      const ext = f.name.split('.').pop().toLowerCase();
      const appendCodes = (codes) => {
        if (!codes || !codes.length) return;
        const existing = (this.bulk.codesText || '').trim();
        this.bulk.codesText = existing ? existing + '\n' + codes.join('\n') : codes.join('\n');
        toast('已读取 ' + codes.length + ' 个皇冠码', 'success');
      };
      if (ext === 'txt') {
        try {
          const text = await f.text();
          appendCodes(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
        } catch (e2) { toast('读取文件失败: ' + e2.message, 'error'); }
      } else if (ext === 'xlsx' || ext === 'xls') {
        try {
          const base64 = await fileToBase64(f);
          const r = await api('/api/products/parse-codes', { method: 'POST', body: { type: 'xlsx', base64 } });
          if (r.error) { toast(r.error, 'error'); return; }
          if (r.message) toast(r.message + '，已跳过', 'warn');
          appendCodes(r.codes || []);
        } catch (e2) { toast('解析文件失败: ' + e2.message, 'error'); }
      } else {
        toast('仅支持 txt / xlsx / xls 文件', 'error');
      }
      this.$refs.bulkFileInput.value = '';
    },
    async saveBulk() {
      const b = this.bulk;
      if (!this.detail) return;
      const codes = this.bulkCodes;
      if (!codes.length) return toast('请填写皇冠码（每行一个）', 'warn');
      if (new Set(codes).size !== codes.length) return toast('存在重复皇冠码，请检查', 'warn');
      if (b.cost === null || isNaN(b.cost)) return toast('请填写成本', 'warn');
      this.submitting = true;
      try {
        const r = await api('/api/products/bulk-entry', { method: 'POST', body: {
          codes, cost: b.cost, spec: b.spec, supplierName: this.detail.name, purchaseAt: b.purchaseDate, note: b.note,
        } });
        toast('已入库 ' + r.count + ' 个皇冠码', 'success');
        this.bulk.show = false;
        this.loadDetail(this.detail.name);
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
        if (this.detail) this.loadDetail(this.detail.name);
        this.loadMeta();
      } catch (e) { toast(e.message, 'error'); }
    },
    async doDelete(p) {
      const ok = await askConfirm('删除商品', '确认删除商品 ' + p.code + ' ？删除后不可恢复。', { confirmText: '删除', danger: true });
      if (!ok) return;
      try {
        await api('/api/products/' + p.id, { method: 'DELETE' });
        toast('已删除', 'success');
        if (this.detail) this.loadDetail(this.detail.name);
        this.loadMeta();
      } catch (e) { toast(e.message, 'error'); }
    },
    priceText(p) {
      if (p.status === 'instock' || p.price === null || p.price === undefined || p.price === '') return '待定';
      return '$' + FMT.money(p.price);
    },
    async loadMeta() {
      try {
        const d = await api('/api/bootstrap');
        this.suppliers = d.suppliers || [];
        this.allProducts = d.products || [];
        this.settings = d.settings || {};
        try { const r = await api('/api/rate'); this.cnyRate = Number(r.rate) || 7; } catch (e2) { /* ignore */ }
        if (this.detail) {
          const cur = this.suppliers.find((s) => s.name === this.detail.name);
          if (cur) this.detail = cur;
          this.loadDetail(this.detail.name);
        }
      } catch (e) { toast(e.message, 'error'); }
    },
  },
  mounted() { this.loadMeta(); },
};