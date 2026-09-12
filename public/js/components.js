const TOASTS = Vue.reactive([]);
window.__toasts = TOASTS;

const SPEC_LABELS = ['2.5k', '5k', '13.75k', '30k', '60k', '80k'];
window.SPEC_LABELS = SPEC_LABELS;
function specImg(spec) { return '/img/crown-' + spec + '.png'; }
window.specImg = specImg;

function isDark() { return document.documentElement.classList.contains('dark'); }

function themeChartPalette() {
  if (!isDark()) return { axis: '#cbd5e1', split: '#e2e8f0', tick: '#64748b', txt: '#475569', pieBorder: '#fff' };
  return { axis: '#334155', split: '#243247', tick: '#94a3b8', txt: '#94a3b8', pieBorder: '#121b2e' };
}

function sortProducts(list, key, dir) {
  const arr = list.slice();
  arr.sort((a, b) => {
    let va = a && a[key];
    let vb = b && b[key];
    if (va === undefined || va === null) va = '';
    if (vb === undefined || vb === null) vb = '';
    let cmp;
    const sa = String(va).trim();
    const sb = String(vb).trim();
    if (sa === '' && sb === '') cmp = 0;
    else if (sa === '') cmp = 1;
    else if (sb === '') cmp = -1;
    else {
      const na = Number(sa);
      const nb = Number(sb);
      cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : sa.localeCompare(sb, 'zh');
    }
    return cmp * dir;
  });
  return arr;
}

function toast(msg, type) {
  const id = 't' + Date.now() + Math.random();
  TOASTS.push({ id, msg, type: type || 'info' });
  setTimeout(() => {
    const i = TOASTS.findIndex((x) => x.id === id);
    if (i >= 0) TOASTS.splice(i, 1);
  }, 2800);
}

const ToastView = {
  data() { return { list: window.__toasts }; },
  template: `
    <div class="toast-wrap">
      <div v-for="t in list" :key="t.id" class="toast" :class="'toast-' + (t.type || 'info')">{{ t.message || t.msg }}</div>
    </div>`,
};

const ConfirmView = {
  data() { return { cfg: this.$CONFIRM }; },
  template: `
    <div class="modal-mask" v-if="cfg.visible" @click.self="cancel">
      <div class="modal modal-sm">
        <div class="modal-body" style="padding:20px">
          <div style="font-weight:700;font-size:15px;margin-bottom:10px">{{ cfg.title }}</div>
          <div class="muted" style="white-space:pre-line">{{ cfg.message }}</div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-outline" @click="cancel">取消</button>
          <button class="btn" :class="cfg.danger ? 'btn-danger' : 'btn-primary'" @click="ok">{{ cfg.confirmText }}</button>
        </div>
      </div>
    </div>`,
  methods: {
    cancel() {
      this.cfg.visible = false;
      if (this.cfg.cb) this.cfg.cb(false);
    },
    ok() {
      this.cfg.visible = false;
      if (this.cfg.cb) this.cfg.cb(true);
    },
  },
  mounted() {
    const self = this;
    if (!this.cfg) Object.assign(this, { cfg: { visible: false } });
    self.cfg = this.$CONFIRM;
  },
};

window.__confirmCfg = Vue.reactive({ visible: false, title: '', message: '', confirmText: '确定', danger: false, cb: null });

function askConfirm(title, message, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    Object.assign(window.__confirmCfg, {
      visible: true,
      title: title || '确认',
      message: message || '',
      confirmText: o.confirmText || '确定',
      danger: !!o.danger,
      cb: resolve,
    });
  });
}

const ConfirmCfg = {
  data() { return { cfg: window.__confirmCfg }; },
};

const ModalShell = {
  props: ['show', 'title', 'width'],
  emits: ['close'],
  template: `
    <div class="modal-mask" v-if="show" @click.self="$emit('close')">
      <div class="modal" :style="width ? 'max-width:' + width : ''">
        <div class="modal-head">
          <span>{{ title }}</span>
          <span class="close" @click="$emit('close')">&times;</span>
        </div>
        <slot></slot>
      </div>
    </div>`,
};

const ModalView = {
  data() { return { cfg: window.__modalCfg }; },
  template: `
    <div class="modal-mask" v-if="cfg.visible" @click.self="close">
      <div class="modal" :class="cfg.sizeClass" :style="cfg.width ? 'max-width:' + cfg.width : ''">
        <div class="modal-head">
          <span>{{ cfg.title }}</span>
          <span class="close" @click="close">&times;</span>
        </div>
        <div class="modal-body" v-html="cfg.html"></div>
      </div>
    </div>`,
  methods: { close() { this.cfg.visible = false; } },
};

window.__modalCfg = Vue.reactive({ visible: false, title: '', html: '', sizeClass: '', width: '' });

function askModal(title, html, opts) {
  const o = opts || {};
  Object.assign(window.__modalCfg, {
    visible: true,
    title: title || '',
    html: html || '',
    sizeClass: o.size === 'lg' ? 'modal-lg' : o.size === 'sm' ? 'modal-sm' : '',
    width: o.width || '',
  });
}