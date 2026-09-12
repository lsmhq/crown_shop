const ReportPage = {
  template: `
    <div>
      <div class="card">
        <div class="tabs">
          <div class="tab-item" :class="{active: tab==='charts'}" @click="tab='charts'">统计图表</div>
          <div class="tab-item" :class="{active: tab==='profit'}" @click="tab='profit'">货源分成报表</div>
          <div class="tab-item" :class="{active: tab==='reorder'}" @click="tab='reorder'">建议进货</div>
        </div>

        <div class="toolbar">
          <select class="select" v-model="range" @change="rangeChanged">
            <option value="7d">近7天</option>
            <option value="30d">近30天</option>
            <option value="month">本月</option>
            <option value="custom">自定义</option>
          </select>
          <template v-if="range==='custom'">
            <input class="input" type="date" v-model="from">
            <span class="muted">至</span>
            <input class="input" type="date" v-model="to">
          </template>
          <select v-if="tab==='reorder'" class="select" v-model="coverage" @change="reload">
            <option :value="7">目标库存 7 天</option>
            <option :value="14">目标库存 14 天</option>
            <option :value="30">目标库存 30 天</option>
          </select>
          <button class="btn btn-primary" @click="reload">刷新</button>
          <span class="spacer"></span>
          <template v-if="tab==='profit'">
            <button class="btn btn-success" @click="exportProfit">导出分货源报表 (Excel)</button>
          </template>
        </div>
      </div>

      <template v-if="tab==='charts'">
        <div class="stat-grid">
          <div class="stat-card"><div class="label">{{ rangeLabel }}销售额</div><div class="value amount">\${{ FMT.money(summary.salesAmount) }}</div><div class="sub">{{ summary.salesQty }} 件售出</div></div>
          <div class="stat-card"><div class="label">{{ rangeLabel }}利润</div><div class="value profit">\${{ FMT.money(summary.salesProfit) }}</div><div class="sub">利润率 {{ summary.margin }}%</div></div>
          <div class="stat-card"><div class="label">{{ rangeLabel }}进货</div><div class="value">\${{ FMT.money(summary.purchaseCost) }}</div><div class="sub">{{ summary.purchaseQty }} 件入库</div></div>
          <div class="stat-card"><div class="label">活跃货源</div><div class="value">{{ summary.supplierCount }}</div><div class="sub">售出配件货源数</div></div>
        </div>

        <div class="chart-grid">
          <div class="card"><div class="card-title">每日销售（{{ rangeLabel }}）</div><div ref="saleChart" style="height:300px"></div></div>
          <div class="card"><div class="card-title">每日进货（{{ rangeLabel }}）</div><div ref="purchaseChart" style="height:300px"></div></div>
          <div class="card"><div class="card-title">按货源销售占比（售出件数）</div><div ref="pieChart" style="height:300px"></div></div>
          <div class="card"><div class="card-title">按货源利润对比</div><div ref="barChart" style="height:300px"></div></div>
          <div class="card"><div class="card-title">按规格：售出件数与当前库存（近{{ rangeLabel }}）</div><div ref="specChart" style="height:300px"></div></div>
        </div>
      </template>

      <template v-else-if="tab==='profit'">
        <div class="card">
          <div class="toolbar">
            <span class="kbd-strong">{{ rangeLabel }}：货源销售与利润明细，用于与各货源按商品结算 / 利润分成。</span>
            <span class="spacer"></span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>货源</th><th class="num">售出件数</th><th class="num">销售量占比</th><th class="num">成本合计</th><th class="num">销售额</th><th class="num">利润</th><th class="num">销售额占比</th></tr>
              </thead>
              <tbody>
                <tr v-if="!profitRows.length"><td class="empty" colspan="7">所选时间段内没有售出记录</td></tr>
                <tr v-for="r in profitRows" :key="r.name">
                  <td class="kbd-strong">{{ r.name }}</td>
                  <td class="num">{{ r.qty }}</td>
                  <td class="num">{{ r.ratio }}%</td>
                  <td class="num">\${{ r.cost }}</td>
                  <td class="num"><span class="amount">\${{ r.amount }}</span></td>
                  <td class="num"><span class="profit">\${{ r.profit }}</span></td>
                  <td class="num">{{ r.amountRatio }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="card">
          <div class="toolbar">
            <span class="kbd-strong">{{ rangeLabel }}售出与库存统计，按 {{ coverage }} 天目标库存给出建议进货数量。近 {{ reorderDays }} 天共售出 {{ reorderTotals.sold || 0 }} 件，当前在库 {{ reorderTotals.stock || 0 }} 件，合计建议进货 {{ reorderTotals.suggested || 0 }} 张（约 \${{ reorderTotals.outgoingCostUsd || '0.00' }}）。</span>
            <span class="spacer"></span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>规格</th><th class="num">当前库存</th><th class="num">售出件数</th><th class="num">销售额</th><th class="num">利润</th><th class="num">日均销量</th><th class="num">库存可售(天)</th><th class="num">建议进货(张)</th><th class="num">建议成本</th></tr>
              </thead>
              <tbody>
                <tr v-if="!reorderRows.length"><td class="empty" colspan="9">暂无数据</td></tr>
                <tr v-for="r in reorderRows" :key="r.spec">
                  <td><img class="spec-icon" :src="specImg(r.spec)" alt=""><span class="spec-label">{{ r.spec }}</span></td>
                  <td class="num">{{ r.stock }}</td>
                  <td class="num">{{ r.qty }}</td>
                  <td class="num">\${{ r.amount }}</td>
                  <td class="num"><span class="profit">\${{ r.profit }}</span></td>
                  <td class="num">{{ r.velocity }}</td>
                  <td class="num">{{ r.coverageDays === null ? '—' : r.coverageDays }}</td>
                  <td class="num"><span class="badge" :class="r.suggested > 0 ? 'badge-red' : 'badge-green'">{{ r.suggested }}</span></td>
                  <td class="num">¥{{ r.suggestedCost }} <span class="muted">(\${{ r.suggestedCostUsd }})</span></td>
                </tr>
              </tbody>
              <tfoot v-if="reorderRows.length">
                <tr>
                  <td class="kbd-strong">合计</td>
                  <td class="num">{{ reorderTotals.stock }}</td>
                  <td class="num">{{ reorderTotals.sold }}</td>
                  <td class="num" colspan="4"></td>
                  <td class="num"><span class="badge" :class="reorderTotals.suggested > 0 ? 'badge-red' : 'badge-green'">{{ reorderTotals.suggested }}</span></td>
                  <td class="num">\${{ reorderTotals.outgoingCostUsd }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </template>
    </div>`,
  data() {
    return {
      tab: 'charts',
      range: '30d',
      from: FMT.today(),
      to: FMT.today(),
      coverage: 14,
      tl: null,
      sup: null,
      specStats: null,
      charts: {},
    };
  },
  computed: {
    rangeLabel() { return FMT.rangeShort(this.range); },
    summary() {
      const t = this.tl;
      const s = this.sup;
      let salesAmount = 0, salesProfit = 0, salesQty = 0, purchaseCost = 0, purchaseQty = 0;
      if (t) {
        t.sales.forEach((x) => { salesAmount += Number(x.amount); salesProfit += Number(x.profit); salesQty += x.qty; });
        t.purchases.forEach((x) => { purchaseCost += Number(x.cost); purchaseQty += x.qty; });
      }
      const supplierCount = s && s.rows ? s.rows.filter((r) => r.qty > 0).length : 0;
      return {
        salesAmount, salesProfit, salesQty, purchaseCost, purchaseQty, supplierCount,
        margin: salesAmount ? Math.round((salesProfit / salesAmount) * 1000) / 10 : 0,
      };
    },
    profitRows() { return this.sup && this.sup.rows ? this.sup.rows : []; },
    reorderRows() { return this.specStats && this.specStats.rows ? this.specStats.rows : []; },
    reorderTotals() { return this.specStats && this.specStats.totals ? this.specStats.totals : {}; },
    reorderDays() { return this.specStats ? this.specStats.windowDays : 0; },
  },
  watch: {
    tab(v) { if (v === 'charts') this.reload(); },
  },
  methods: {
    ensureCharts() {
      Object.values(this.charts).forEach((c) => { if (c) { c.dispose(); } });
      this.charts = {};
      if (this.$refs.saleChart) this.charts.sale = echarts.init(this.$refs.saleChart);
      if (this.$refs.purchaseChart) this.charts.purchase = echarts.init(this.$refs.purchaseChart);
      if (this.$refs.pieChart) this.charts.pie = echarts.init(this.$refs.pieChart);
      if (this.$refs.barChart) this.charts.bar = echarts.init(this.$refs.barChart);
      if (this.$refs.specChart) this.charts.spec = echarts.init(this.$refs.specChart);
    },
    rangeChanged() {
      if (this.range === 'custom') {
        const now = new Date();
        this.from = FMT.today();
        const d = new Date(now.getTime() - 6 * 86400000);
        this.to = FMT.today();
        this.$nextTick(() => { this.from = FMT.fmtDate(d); });
        return;
      }
      this.reload();
    },
    qp() {
      const p = {};
      if (this.range === 'custom') { p.from = this.from; p.to = this.to; }
      else p.from = this.range;
      return p;
    },
    async reload() {
      const p = this.qp();
      const prm = new URLSearchParams(p);
      if (this.tab === 'reorder') prm.set('coverage', this.coverage);
      const [tl, sup, specs] = await Promise.all([
        api('/api/stats/timeline?' + prm + '&groupBy=day').catch(() => null),
        api('/api/stats/suppliers?' + prm).catch(() => null),
        api('/api/stats/specs?' + prm).catch(() => null),
      ]);
      this.tl = tl;
      this.sup = sup;
      this.specStats = specs;
      this.ensureCharts();
      this.$nextTick(() => {
        if (!this.tl && !this.sup && !this.specStats) { toast('统计加载失败', 'error'); return; }
        this.drawCharts();
      });
    },
    drawCharts() {
      const p = themeChartPalette();
      const keys = this.tl ? this.tl.keys : [];
      const tick = { color: p.tick, fontSize: 11 };
      const split = { color: p.split, type: 'dashed' };
      const tip = {
        backgroundColor: 'rgba(15,23,42,0.88)', borderWidth: 0,
        textStyle: { color: '#f8fafc', fontSize: 12 },
        confine: true,
      };
      const xl = (rotate) => Object.assign({}, tick, { hideOverlap: true, interval: 'auto', rotate });
      this.charts.sale && this.charts.sale.setOption({
        tooltip: Object.assign({}, tip, {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: p.tick } },
          formatter: (ps) => {
            const amount = ps.find((p) => p.seriesName === '销售额');
            const qty = ps.find((p) => p.seriesName === '销售件数');
            return ps[0].axisValue
              + '<br/>销售额：$' + FMT.money(amount ? amount.value : 0)
              + '<br/>销售件数：' + (qty ? qty.value : 0) + ' 件';
          },
        }),
        legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16, textStyle: { color: p.txt, fontSize: 12 } },
        grid: { left: 64, right: 52, top: 42, bottom: 24 },
        xAxis: {
          type: 'category', data: keys,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: p.axis } },
          axisLabel: xl(keys.length > 20 ? 30 : 0),
        },
        yAxis: [
          {
            type: 'value', name: '销售额($)', nameTextStyle: { color: p.tick },
            axisTick: { show: false }, axisLine: { lineStyle: { color: p.axis } },
            axisLabel: Object.assign({}, tick, { formatter: (v) => '$' + v }),
            splitLine: { lineStyle: split },
          },
          {
            type: 'value', name: '件数', nameTextStyle: { color: p.tick },
            axisTick: { show: false }, axisLine: { show: false },
            axisLabel: tick, minInterval: 1, splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '销售额', type: 'line', smooth: true, symbol: 'none', lineWidth: 2.5,
            data: (this.tl ? this.tl.sales : []).map((s) => s.amount),
            itemStyle: { color: '#2563eb' },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(37,99,235,0.22)' }, { offset: 1, color: 'rgba(37,99,235,0.02)' }] } },
          },
          {
            name: '销售件数', type: 'bar', yAxisIndex: 1, barWidth: '45%',
            data: (this.tl ? this.tl.sales : []).map((s) => s.qty),
            itemStyle: { color: '#bfdbfe', borderRadius: [2, 2, 0, 0] },
          },
        ],
      });
      this.charts.purchase && this.charts.purchase.setOption({
        tooltip: Object.assign({}, tip, {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: p.tick } },
          formatter: (ps) => {
            const cost = ps.find((p) => p.seriesName === '进货成本');
            const qty = ps.find((p) => p.seriesName === '进货件数');
            return ps[0].axisValue
              + '<br/>进货成本：$' + FMT.money(cost ? cost.value : 0)
              + '<br/>进货件数：' + (qty ? qty.value : 0) + ' 件';
          },
        }),
        legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16, textStyle: { color: p.txt, fontSize: 12 } },
        grid: { left: 68, right: 52, top: 42, bottom: 24 },
        xAxis: {
          type: 'category', data: keys,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: p.axis } },
          axisLabel: xl(keys.length > 20 ? 30 : 0),
        },
        yAxis: [
          {
            type: 'value', name: '成本($)', nameTextStyle: { color: p.tick },
            axisTick: { show: false }, axisLine: { lineStyle: { color: p.axis } },
            axisLabel: Object.assign({}, tick, { formatter: (v) => '$' + v }),
            splitLine: { lineStyle: split },
          },
          {
            type: 'value', name: '件数', nameTextStyle: { color: p.tick },
            axisTick: { show: false }, axisLine: { show: false },
            axisLabel: tick, minInterval: 1, splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '进货成本', type: 'bar', barWidth: '45%',
            data: (this.tl ? this.tl.purchases : []).map((s) => s.cost),
            itemStyle: { color: '#059669', borderRadius: [2, 2, 0, 0] },
          },
          {
            name: '进货件数', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'none', lineWidth: 2,
            data: (this.tl ? this.tl.purchases : []).map((s) => s.qty),
            itemStyle: { color: '#6ee7b7' },
          },
        ],
      });
      const sd = this.sup && this.sup.rows ? this.sup.rows.map((r) => ({ name: r.name, value: r.qty })) : [];
      this.charts.pie && this.charts.pie.setOption({
        tooltip: Object.assign({}, tip, { trigger: 'item', formatter: '{b}：{c} 件（{d}%）' }),
        legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 12, textStyle: { color: p.txt, fontSize: 11 } },
        series: [{
          type: 'pie', radius: ['40%', '60%'], center: ['50%', '44%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: p.pieBorder, borderWidth: 2 },
          label: { show: true, formatter: '{d}%', color: '#fff', fontSize: 11, textBorderColor: 'rgba(0,0,0,0.4)', textBorderWidth: 1 },
          labelLine: { show: false },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' } },
          data: sd,
        }],
      });
      const profit = this.sup && this.sup.rows ? this.sup.rows.map((r) => ({ name: r.name, value: Number(r.profit) })) : [];
      this.charts.bar && this.charts.bar.setOption({
        legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16, textStyle: { color: p.txt, fontSize: 12 }, data: ['利润'] },
        tooltip: Object.assign({}, tip, {
          trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: (ps) => ps[0].name + '：$' + FMT.money(ps[0].value),
        }),
        grid: { left: 58, right: 26, top: 42, bottom: 26 },
        xAxis: {
          type: 'category', data: profit.map((r) => r.name),
          axisTick: { show: false }, axisLine: { lineStyle: { color: p.axis } },
          axisLabel: Object.assign({}, tick, { hideOverlap: true, interval: 0, rotate: profit.length > 6 ? 30 : 0 }),
        },
        yAxis: {
          type: 'value', name: '利润($)', nameTextStyle: { color: p.tick },
          axisTick: { show: false }, axisLine: { lineStyle: { color: p.axis } },
          axisLabel: Object.assign({}, tick, { formatter: (v) => '$' + v }),
          splitLine: { lineStyle: split },
        },
        series: [{
          name: '利润', type: 'bar', barMaxWidth: 40, data: profit,
          itemStyle: { color: (p) => (p.value >= 0 ? '#16a34a' : '#dc2626') },
          label: { show: profit.length <= 7, position: 'top', fontSize: 11, color: p.txt, formatter: (q) => '$' + FMT.money(q.value) },
        }],
      });
      const specCols = ['#2563eb', '#7c3aed', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#94a3b8'];
      const sr = this.specStats && this.specStats.rows ? this.specStats.rows : [];
      const specNames = sr.map((r) => r.spec);
      this.charts.spec && this.charts.spec.setOption({
        tooltip: Object.assign({}, tip, {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (ps) => {
            const nm = ps[0].name;
            const r = sr.find((x) => x.spec === nm);
            if (!r) return nm;
            let s = '<b>' + nm + '</b>'
              + '<br/>售出：' + r.qty + ' 件（' + r.velocity + ' 件/天）'
              + '<br/>销售额：$' + r.amount + '　利润：$' + r.profit
              + '<br/>当前库存：' + r.stock + '　可售 ' + (r.coverageDays === null ? '—' : r.coverageDays + ' 天')
              + '<br/>建议进货：' + r.suggested + ' 张（¥' + r.suggestedCost + '）';
            return s;
          },
        }),
        legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 16, textStyle: { color: p.txt, fontSize: 12 } },
        grid: { left: 52, right: 40, top: 42, bottom: 60 },
        xAxis: {
          type: 'category', data: specNames,
          axisTick: { show: false }, axisLine: { lineStyle: { color: p.axis } },
          axisLabel: { color: p.tick, fontSize: 11, interval: 0 },
        },
        yAxis: {
          type: 'value', name: '件数', nameTextStyle: { color: p.tick },
          axisTick: { show: false }, axisLine: { lineStyle: { color: p.axis } },
          axisLabel: tick, minInterval: 1, splitLine: { lineStyle: split },
        },
        series: [
          {
            name: '售出件数', type: 'bar', barMaxWidth: 30,
            data: sr.map((r, i) => ({ value: r.qty, itemStyle: { color: specCols[i % specCols.length] } })),
            label: { show: true, position: 'top', fontSize: 11, color: p.txt },
          },
          {
            name: '当前库存', type: 'bar', barMaxWidth: 30,
            data: sr.map((r) => r.stock),
            itemStyle: { color: '#94a3b8', borderRadius: [2, 2, 0, 0] },
          },
        ],
      });
    },
    exportProfit() {
      download('/api/export/supplier-profit.xlsx', '货源分成报表.xlsx', this.qp());
    },
    onThemeChange() { this.drawCharts(); },
  },
  mounted() {
    this.reload();
    window.addEventListener('dz-theme-changed', this.onThemeChange);
  },
  unmounted() {
    window.removeEventListener('dz-theme-changed', this.onThemeChange);
    Object.values(this.charts).forEach((c) => { if (c) c.dispose(); });
    this.charts = {};
  },
};