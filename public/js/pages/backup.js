const BackupPage = {
  template: `
    <div class="chart-grid">
      <div class="card">
        <div class="card-title">数据导出</div>
        <p class="muted" style="margin-bottom:12px">导出当前数据为 Excel 文件，可在其他电脑或 Excel 中打开。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" @click="exportAllProducts">导出全部商品</button>
          <button class="btn btn-primary" @click="exportAllOrders">导出全部订单</button>
          <button class="btn btn-success" @click="exportProfit">导出货源分成报表（本月）</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">手动备份</div>
        <div class="stat-grid" style="margin-bottom:14px;margin-top:0">
          <div class="stat-card"><div class="label">上次备份</div><div class="value" style="font-size:14px">{{ lastBackup || '尚未备份' }}</div></div>
          <div class="stat-card"><div class="label">备份文件数</div><div class="value">{{ backups.length }}</div></div>
        </div>
        <button class="btn btn-success" :disabled="backing" @click="doBackup">
          {{ backing ? '备份中…' : '立即备份' }}
        </button>
      </div>

      <div class="card full">
        <div class="card-title">备份列表（数据文件夹 data/backups/）</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>文件名</th><th>大小</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-if="!backups.length"><td class="empty" colspan="4">暂无备份，点击上方按钮创建</td></tr>
              <tr v-for="b in backups" :key="b.file">
                <td class="kbd-strong" style="font-size:12px">{{ b.file }}</td>
                <td class="muted">{{ (b.size/1024).toFixed(1) }} KB</td>
                <td>{{ FMT.fmtDateTime(b.mtime) }}</td>
                <td>
                  <button class="btn btn-sm btn-danger" @click="restore(b)">恢复此备份</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="detail-box" style="margin-top:12px">
          <b>恢复操作说明：</b> 恢复后，当前数据将被替换（替换前会自动保留一份快照）。恢复后所有页面自动刷新最新数据。
        </div>
      </div>
    </div>`,
  data() {
    return {
      backups: [],
      lastBackup: '',
      backing: false,
    };
  },
  methods: {
    async load() {
      try {
        this.backups = await api('/api/system/backups');
        this.lastBackup = this.backups.length ? FMT.fmtDateTime(this.backups[0].mtime) : '';
      } catch (e) { toast(e.message, 'error'); }
    },
    async doBackup() {
      this.backing = true;
      try {
        const r = await api('/api/system/backup', { method: 'POST', body: { label: 'manual' } });
        toast('备份完成：' + r.file, 'success');
        await this.load();
      } catch (e) { toast(e.message, 'error'); }
      this.backing = false;
    },
    async restore(b) {
      const ok = await askConfirm('恢复备份', '确认从备份文件恢复数据？\n\n' + b.file + '\n\n恢复前会自动保存当前数据为快照，但请确认这是你要恢复的版本。', { confirmText: '确认恢复', danger: true });
      if (!ok) return;
      try {
        await api('/api/system/restore', { method: 'POST', body: { file: b.file } });
        toast('数据已恢复成功', 'success');
        window.__bootstrapDirty = true;
        await this.load();
      } catch (e) { toast(e.message, 'error'); }
    },
    exportAllProducts() { download('/api/export/products.xlsx', '商品列表.xlsx'); },
    exportAllOrders() { download('/api/export/orders.xlsx', '订单列表.xlsx'); },
    exportProfit() { download('/api/export/supplier-profit.xlsx', '货源分成报表.xlsx', { from: 'month' }); },
  },
  mounted() { this.load(); },
};