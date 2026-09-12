const { createApp } = Vue;

const RATE_STORE = Vue.reactive({ rate: '', updatedAt: '', source: '' });
window.__rate = RATE_STORE;

const app = createApp({
  data() {
    return {
      page: 'dashboard',
      menus: [
        { key: 'dashboard', title: '工作台', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
        { key: 'suppliers', title: '供货人', icon: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
        { key: 'products', title: '商品管理', icon: '<line x1="16.5" y1="9.4" x2="7.55" y2="4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
        { key: 'sales', title: '销售开单', icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
        { key: 'orders', title: '订单管理', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' },
        { key: 'report', title: '统计报表', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
        { key: 'backup', title: '备份与导出', icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
        { key: 'settings', title: '系统设置', icon: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>' },
      ],
      app: {
        title: '我的小店',
        settings: {},
      },
      savedTip: '',
      tipTimer: null,
      rateInfo: RATE_STORE,
      rateBusy: false,
      dark: document.documentElement.classList.contains('dark'),
      updateInfo: { latest: null },
    };
  },
  computed: {
    currentMenu() { return this.menus.find((m) => m.key === this.page) || this.menus[0]; },
    rateText() {
      if (!this.rateInfo.rate) return '--';
      const n = Number(this.rateInfo.rate);
      return isNaN(n) ? '--' : n.toFixed(4);
    },
    rateTimeText() {
      const t = this.rateInfo.updatedAt;
      if (!t) return '未获取';
      const d = new Date(t);
      if (isNaN(d)) return t;
      return FMT.fmtDate(d) + ' ' + FMT.pad(d.getHours()) + ':' + FMT.pad(d.getMinutes()) + ':' + FMT.pad(d.getSeconds());
    },
    rateSourceText() {
      const s = this.rateInfo.source;
      return s === 'auto' ? '自动获取' : s === 'manual' ? '手动设置' : '缓存/离线';
    },
  },
  methods: {
    goto(key) { this.page = key; },
    toggleDark() {
      this.dark = !this.dark;
      document.documentElement.classList.toggle('dark', this.dark);
      try { localStorage.setItem('dz-theme', this.dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
      window.dispatchEvent(new CustomEvent('dz-theme-changed', { detail: { dark: this.dark } }));
    },
    iconHtml(inner) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px">' + inner + '</svg>';
    },
    showSaved() {
      this.savedTip = '已更新';
      clearTimeout(this.tipTimer);
      this.tipTimer = setTimeout(() => { this.savedTip = ''; }, 1800);
    },
    async loadRate() {
      try {
        const d = await api('/api/rate');
        RATE_STORE.rate = d.rate;
        RATE_STORE.updatedAt = d.updatedAt || '';
        RATE_STORE.source = d.source || '';
      } catch (e) { /* 保持现状 */ }
    },
    async refreshRate() {
      if (this.rateBusy) return;
      this.rateBusy = true;
      try {
        const d = await api('/api/rate/refresh', { method: 'POST', body: {} });
        const src = d.source === 'auto' ? '自动' : d.source === 'manual' ? '手动' : '缓存';
        RATE_STORE.rate = d.rate;
        RATE_STORE.updatedAt = d.updatedAt || new Date().toISOString();
        RATE_STORE.source = d.source || 'cache';
        toast('汇率已更新：$1 = ¥' + Number(d.rate).toFixed(4) + '（' + src + '）', 'success');
      } catch (e) {
        toast('汇率刷新失败：' + e.message, 'error');
      } finally {
        this.rateBusy = false;
      }
    },
    async loadBootstrap() {
      try {
        const d = await api('/api/bootstrap');
        this.app.title = d.settings.shopName || '我的小店';
        this.app.settings = d.settings || {};
        document.title = this.app.title + ' - 管理系统';
        window.__bootstrapData = d;
      } catch (e) { /* ignore */ }
    },
    async silentUpdateCheck() {
      try {
        const r = await api('/api/update/check');
        if (r.latest && r.hasUpdate) {
          this.updateInfo.latest = r.latest;
          toast('发现新版本 v' + r.latest.version + '，可在「系统设置」中下载更新');
        }
      } catch (e) { /* 无网络等情况忽略 */ }
    },
    async doShutdown() {
      const ok = await askConfirm('退出程序', '确认关闭后台服务？', { confirmText: '确认退出', danger: true });
      if (!ok) return;
      try {
        await api('/api/system/shutdown', { method: 'POST', body: {} });
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:16px;color:#6b7280">系统已关闭，可关闭此窗口。</div>';
      } catch (e) { document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:16px;color:#6b7280">系统已关闭，可关闭此窗口。</div>'; }
    },
  },
  created() {
    this.loadRate();
    this.loadBootstrap();
    this.silentUpdateCheck();
    const self = this;
    setInterval(() => {
      if (window.__bootstrapDirty) {
        window.__bootstrapDirty = false;
        self.loadBootstrap();
        self.showSaved();
      }
    }, 1500);
  },
  mounted() {
    document.body.classList.add('ready');
  },
});

app.config.globalProperties.FMT = FMT;
app.config.globalProperties.specImg = function (spec) { return '/img/crown-' + spec + '.png'; };
app.config.globalProperties.SPEC_LABELS = ['2.5k', '5k', '13.75k', '30k', '60k', '80k'];

app.component('toast-view', {
  data() { return { list: window.__toasts }; },
  template: `<div class="toast-wrap"><div v-for="t in list" :key="t.id" class="toast" :class="'toast-' + (t.type||'info')">{{ t.msg }}</div></div>`,
});

app.component('confirm-view', {
  data() { return { cfg: window.__confirmCfg }; },
  template: `<div class="modal-mask" v-if="cfg.visible" @click.self="no"><div class="modal modal-sm"><div class="modal-body" style="padding:22px"><div style="font-weight:700;font-size:15px;margin-bottom:12px">{{ cfg.title }}</div><div class="muted" style="white-space:pre-line;line-height:1.6">{{ cfg.message }}</div></div><div class="modal-foot"><button class="btn btn-outline" @click="no">取消</button><button class="btn" :class="cfg.danger ? 'btn-danger' : 'btn-primary'" @click="yes">{{ cfg.confirmText }}</button></div></div></div>`,
  methods: {
    yes() { this.cfg.visible = false; if (this.cfg.cb) this.cfg.cb(true); },
    no() { this.cfg.visible = false; if (this.cfg.cb) this.cfg.cb(false); },
  },
});

app.component('modal-view', {
  data() { return { cfg: window.__modalCfg }; },
  template: `<div class="modal-mask" v-if="cfg.visible" @click.self="close"><div class="modal" :class="cfg.sizeClass" :style="cfg.width ? 'max-width:' + cfg.width : ''"><div class="modal-head"><span>{{ cfg.title }}</span><span class="close" @click="close">&times;</span></div><div class="modal-body" v-html="cfg.html"></div></div></div>`,
  methods: { close() { this.cfg.visible = false; } },
});

// Register page components
app.component('page-dashboard', DashboardPage);
app.component('page-suppliers', SuppliersPage);
app.component('page-products', ProductsPage);
app.component('page-sales', SalesPage);
app.component('page-orders', OrdersPage);
app.component('page-report', ReportPage);
app.component('page-backup', BackupPage);
app.component('page-settings', SettingsPage);

app.mount('#app');