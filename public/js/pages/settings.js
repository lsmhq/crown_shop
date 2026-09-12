const SettingsPage = {
  template: `
    <div>
      <div class="card" style="max-width:680px">
        <div class="card-title">系统设置</div>
        <div class="form-grid">
          <div class="form-item">
            <label>店铺名称 <span class="req">*</span></label>
            <input class="input" v-model="form.shopName" placeholder="如：我的小店">
          </div>
          <div class="form-item">
            <label>自动备份间隔（天）</label>
            <input class="input" type="number" min="0" v-model.number="form.autoBackupDays">
            <div class="muted" style="font-size:11px;margin-top:4px">设置 0 关闭自动备份，每次启动时检查是否超过间隔自动备份。</div>
          </div>
        </div>
        <div style="margin-top:18px;display:flex;gap:10px;align-items:center">
          <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button>
          <span class="muted" style="font-size:12px">{{ savedMsg }}</span>
        </div>
      </div>

      <div class="card" style="max-width:680px;margin-top:0">
        <div class="card-title">美元/人民币汇率</div>
        <div class="form-grid">
          <div class="form-item">
            <label>当前汇率</label>
            <div class="kbd-strong" style="font-size:20px">$1 = ¥{{ FMT.money(rateInfo.rate) }}</div>
            <div class="muted" style="font-size:12px;margin-top:4px">
              来源：{{ rateInfo.source === 'auto' ? '实时获取' : '手动/默认' }}
              <span v-if="rateInfo.updatedAt"> · 更新于 {{ FMT.fmtDateTime(rateInfo.updatedAt) }}</span>
            </div>
          </div>
          <div class="form-item">
            <label>手动汇率（可留空）</label>
            <input class="input" type="number" step="0.01" v-model.number="manualRate" placeholder="如 7.2">
            <div class="muted" style="font-size:11px;margin-top:4px">联网时自动获取实时汇率；手动值用于无网络时兜底。</div>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
          <button class="btn btn-primary" :disabled="refreshing" @click="refreshRate">{{ refreshing ? '获取中…' : '立即获取实时汇率' }}</button>
          <button class="btn btn-outline" :disabled="saving" @click="saveRate">保存手动汇率</button>
          <span class="muted" style="font-size:12px">利润按「售价 - 成本÷汇率」以美元计算。</span>
        </div>
      </div>

      <div class="card" style="max-width:680px;margin-top:0">
        <div class="card-title">程序信息</div>
        <table class="table" style="max-width:440px">
          <tr><td class="muted" style="width:140px">数据存储位置</td><td class="kbd-strong" style="font-size:12px;word-break:break-all">{{ dataDir }}</td></tr>
          <tr><td class="muted">首次创建</td><td>{{ FMT.fmtDateTime(createdAt) }}</td></tr>
          <tr><td class="muted">数据版本</td><td>v{{ version }}</td></tr>
        </table>
        <div class="detail-box" style="margin-top:12px">
          <b>备份文件夹</b>位于数据目录内的 backups/ 子目录，如需迁移或备份整个数据，请拷贝整个 <b>data</b> 文件夹。
        </div>
      </div>

      <div class="card" style="max-width:680px;margin-top:0">
        <div class="card-title">应用更新</div>
        <div class="muted" style="font-size:12px;margin-bottom:8px">当前版本 <span class="kbd-strong">v{{ upd.current }}</span>，通过 GitHub Releases 自动检测并下载更新。</div>
        <div v-if="upd.status==='checking'" class="muted" style="font-size:12px">正在检查更新…</div>
        <div v-else-if="upd.status==='latest'" class="muted" style="font-size:12px"><span class="badge badge-green">已是最新版本</span></div>
        <div v-else-if="upd.status==='error'" class="muted" style="font-size:12px;color:var(--danger)">{{ upd.error }}</div>
        <div v-else-if="upd.status==='applying'" class="muted" style="font-size:12px">更新已下载，程序将自动重启完成更新，稍候请刷新页面。</div>
        <div v-else-if="upd.status==='available'">
          <div class="kbd-strong" style="font-size:15px">发现新版本 v{{ upd.latest.version }} <span class="muted" style="font-size:12px;font-weight:400">（发布于 {{ FMT.fmtDateTime(upd.latest.publishedAt) }}）</span></div>
          <div v-if="upd.latest.notes" class="muted" style="white-space:pre-wrap;font-size:12px;margin:6px 0">{{ upd.latest.notes }}</div>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
          <button class="btn btn-outline" :disabled="upd.status==='checking' || applying" @click="checkUpdate(false)">{{ upd.status==='checking' ? '检查中…' : '检查更新' }}</button>
          <button v-if="upd.status==='available'" class="btn btn-primary" :disabled="applying" @click="applyUpdate">{{ applying ? '下载中…' : '下载并立即更新' }}</button>
        </div>
      </div>

      <div class="card" style="max-width:680px;margin-top:0">
        <div class="card-title" style="color:var(--danger)">退出程序</div>
        <p class="muted" style="margin-bottom:10px">优雅关闭后台服务。如需重新启动，双击 start.bat 或 店长宝.exe 即可。</p>
        <button class="btn btn-danger" @click="doShutdown">退出程序</button>
      </div>
    </div>`,
  data() {
    return {
      form: { shopName: '', autoBackupDays: 1 },
      saving: false,
      savedMsg: '',
      dataDir: '',
      createdAt: '',
      version: '1.0.0',
      rateInfo: { rate: 7, updatedAt: '', source: 'cache' },
      manualRate: null,
      refreshing: false,
      upd: { status: 'idle', current: '0.0.0', latest: null, error: '' },
      applying: false,
    };
  },
  methods: {
    async load() {
      try {
        const d = await api('/api/bootstrap');
        this.form = { ...d.settings };
        this.dataDir = '/data/';
        this.createdAt = d.settings.createdAt || '';
        this.version = '1.0.0';
        this.loadRate();
      } catch (e) { toast(e.message, 'error'); }
    },
    async loadRate() {
      try {
        const r = await api('/api/rate');
        this.rateInfo = { rate: r.rate, updatedAt: r.updatedAt, source: r.source };
        this.manualRate = null;
      } catch (e) { /* ignore */ }
    },
    async refreshRate() {
      this.refreshing = true;
      try {
        const r = await api('/api/rate/refresh', { method: 'POST', body: {} });
        this.rateInfo = { rate: r.rate, updatedAt: r.updatedAt, source: r.source };
        toast('汇率已更新：$1 = ¥' + r.rate, 'success');
        window.__bootstrapDirty = true;
      } catch (e) { toast(e.message, 'error'); }
      this.refreshing = false;
    },
    async checkUpdate(silent) {
      this.upd.status = 'checking';
      try {
        const r = await api('/api/update/check');
        this.upd.current = r.current || this.upd.current;
        this.version = r.current || this.version;
        if (r.latest && r.hasUpdate) {
          this.upd.latest = r.latest;
          this.upd.status = 'available';
          if (!silent) toast('发现新版本 v' + r.latest.version, 'success');
        } else {
          this.upd.latest = null;
          this.upd.status = 'latest';
          if (!silent) toast('已是最新版本 v' + (r.current || ''), 'success');
        }
      } catch (e) {
        this.upd.status = 'error';
        this.upd.error = e.message || '检查更新失败';
        if (!silent) toast(this.upd.error, 'error');
      }
    },
    async applyUpdate() {
      if (!this.upd.latest) return;
      const ok = await askConfirm('应用更新', '将下载 v' + this.upd.latest.version + ' 替换当前程序，下载完成后会自动重启应用，确定继续？\n\n更新期间请勿关闭此窗口。', { confirmText: '下载并更新', danger: true });
      if (!ok) return;
      this.applying = true;
      try {
        const r = await api('/api/update/apply', { method: 'POST', body: {} });
        if (r.ok) {
          this.upd.status = 'applying';
          toast(r.message || '更新已提交', 'success');
          setTimeout(() => { window.location.reload(); }, 8000);
        } else {
          toast(r.message || r.error || '当前已是最新版本', 'success');
          this.checkUpdate(true);
        }
      } catch (e) {
        toast('更新失败：' + (e.message || e), 'error');
        this.upd.status = 'error';
        this.upd.error = e.message || String(e);
      }
      this.applying = false;
    },
    async saveRate() {
      if (this.manualRate === null || isNaN(this.manualRate) || this.manualRate <= 0) { toast('请填写正确的汇率', 'warn'); return; }
      this.saving = true;
      try {
        await api('/api/settings', { method: 'PUT', body: { usdCnyRate: this.manualRate } });
        toast('手动汇率已保存', 'success');
        this.loadRate();
      } catch (e) { toast(e.message, 'error'); }
      this.saving = false;
    },
    async save() {
      if (!this.form.shopName.trim()) { toast('请填写店铺名称', 'warn'); return; }
      this.saving = true;
      try {
        await api('/api/settings', { method: 'PUT', body: {
          shopName: this.form.shopName.trim(),
          autoBackupDays: this.form.autoBackupDays,
        } });
        this.savedMsg = '已保存';
        setTimeout(() => { this.savedMsg = ''; }, 2000);
        toast('设置已保存', 'success');
        window.__bootstrapDirty = true;
        document.title = this.form.shopName.trim() + ' - 管理系统';
      } catch (e) { toast(e.message, 'error'); }
      this.saving = false;
    },
    async doShutdown() {
      const ok = await askConfirm('退出程序', '确认关闭「' + this.form.shopName + '」管理系统？\n\n关闭后将无法继续操作，如需重新开启需双击启动文件。', { confirmText: '确认退出', danger: true });
      if (!ok) return;
      try {
        await api('/api/system/shutdown', { method: 'POST', body: {} });
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:16px;color:#6b7280">系统已关闭，可关闭此窗口。</div>';
      } catch (e) { /* process already exited */ }
    },
  },
  mounted() { this.load(); this.checkUpdate(true); },
};