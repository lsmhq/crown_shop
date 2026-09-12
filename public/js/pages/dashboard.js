const DashboardPage = {
  template: `
    <div>
      <div class="stat-grid">
        <div class="stat-card" v-for="c in cards" :key="c.label">
          <div class="label">{{ c.label }}</div>
          <div class="value">{{ c.value }}</div>
          <div class="sub" v-if="c.sub">{{ c.sub }}</div>
        </div>
      </div>

      <div class="widget-grid">
        <div class="card">
          <div class="card-title">最近订单
            <span class="widget-link" @click="$root.goto('orders')">全部订单 &rsaquo;</span>
          </div>
          <div v-if="recent.length === 0" class="muted" style="padding:18px 0;text-align:center">近30天暂无订单</div>
          <table class="table mini" v-else>
            <thead>
              <tr><th>订单号</th><th>买家</th><th class="num">总额</th><th class="num">利润</th><th>时间</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="o in recent" :key="o.id">
                <td class="kbd-strong">{{ o.no }}</td>
                <td>{{ o.customerName }}</td>
                <td class="num"><span class="amount">\${{ FMT.money(o.total) }}</span></td>
                <td class="num"><span class="profit">\${{ FMT.money(o.profit) }}</span></td>
                <td class="muted">{{ FMT.fmtDateTime(o.createdAt) }}</td>
                <td><span class="badge" :class="FMT.orderStatus(o.status).cls">{{ FMT.orderStatus(o.status).text }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-title">货源销售排行
            <span class="widget-link" @click="$root.goto('report')">统计报表 &rsaquo;</span>
          </div>
          <div v-if="topSup.length === 0" class="muted" style="padding:18px 0;text-align:center">近30天暂无售出</div>
          <div v-for="s in topSup" :key="s.name">
            <div class="rank-row">
              <div class="rank-name" :title="s.name">{{ s.name }}</div>
              <div class="rank-bar"><div class="rank-fill" :style="{ width: s.pct + '%' }"></div></div>
              <div class="rank-val">\${{ FMT.money(s.amount) }}
                <span class="rank-sub">{{ s.count }} 件</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="chart-grid">
        <div class="card full">
          <div class="card-title">近30天销售趋势</div>
          <div ref="saleChart" style="height:320px"></div>
        </div>
        <div class="card full">
          <div class="card-title">货源销售占比（销售额）</div>
          <div ref="pieChart" style="height:300px"></div>
        </div>
      </div>
    </div>`,
  data() {
    return {
      ov: null,
      tl: null,
      sup: null,
      recent: [],
      topSup: [],
      saleChart: null,
      pieChart: null,
    };
  },
  computed: {
    cards() {
      const o = this.ov;
      if (!o) return [];
      return [
        { label: '在库商品', value: o.instockCount, sub: '共 ' + o.totalProducts + ' 件商品' },
        { label: '已售出', value: o.soldCount, sub: '退货 ' + o.returnedCount + ' 件' },
        { label: '累计销售额', value: '$' + FMT.money(o.totalRevenue), sub: '' },
        { label: '累计利润', value: '$' + FMT.money(o.totalProfit), sub: '' },
        { label: '今日销售', value: '$' + FMT.money(o.todayRevenue), sub: o.todaySoldCount + ' 件' },
        { label: '今日利润', value: '$' + FMT.money(o.todayProfit), sub: '' },
        { label: '订单数', value: o.ordersCount, sub: '' },
      ];
    },
  },
  methods: {
    async load() {
      try {
        const [o] = await Promise.all([api('/api/stats/overview')]);
        this.ov = o;
      } catch (e) { toast(e.message, 'error'); }
      const [tl, sup, recent] = await Promise.all([
        api('/api/stats/timeline?from=30d&to=&groupBy=day').catch(() => null),
        api('/api/stats/suppliers?from=30d&to=').catch(() => null),
        api('/api/orders?from=30d').catch(() => []),
      ]);
      this.tl = tl;
      this.sup = sup;
      this.recent = recent.slice(0, 6);
      this.topSup = (sup && sup.rows || []).slice(0, 5).map((r) => {
        const max = Math.max.apply(null, (sup.rows || []).map((x) => Number(x.amount) || 0)) || 1;
        return { name: r.name, amount: Number(r.amount) || 0, count: r.count || 0, pct: Math.round((Number(r.amount) || 0) / max * 100) };
      });
      this.renderCharts();
    },
    renderCharts() {
      const p = themeChartPalette();
      const tick = { color: p.tick, fontSize: 11 };
      const split = { color: p.split, type: 'dashed' };
      const tl = this.tl;
      const keys = tl && tl.keys ? tl.keys : [];
      if (this.saleChart) {
        this.saleChart.setOption({
          tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(15,23,42,0.88)', borderWidth: 0, confine: true,
            textStyle: { color: '#f8fafc', fontSize: 12 },
            axisPointer: { type: 'line', lineStyle: { color: p.tick } },
            formatter: (ps) => {
              const amount = ps.find((x) => x.seriesName === '销售额');
              const qty = ps.find((x) => x.seriesName === '销售件数');
              return ps[0].axisValue
                + '<br/>销售额：$' + FMT.money(amount ? amount.value : 0)
                + '<br/>销售件数：' + (qty ? qty.value : 0) + ' 件';
            },
          },
          legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 14, textStyle: { color: p.txt, fontSize: 12 } },
          grid: { left: 64, right: 52, top: 42, bottom: 24 },
          xAxis: {
            type: 'category', data: keys,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: p.axis } },
            axisLabel: Object.assign({}, tick, { hideOverlap: true, interval: 'auto', rotate: keys.length > 20 ? 30 : 0 }),
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
              data: (tl && tl.sales ? tl.sales : []).map((s) => s.amount),
              itemStyle: { color: '#2563eb' },
              areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(37,99,235,0.22)' }, { offset: 1, color: 'rgba(37,99,235,0.02)' }] } },
            },
            {
              name: '销售件数', type: 'bar', yAxisIndex: 1, barWidth: '45%',
              data: (tl && tl.sales ? tl.sales : []).map((s) => s.qty),
              itemStyle: { color: '#bfdbfe', borderRadius: [2, 2, 0, 0] },
            },
          ],
        });
      }
      const sup = this.sup;
      if (this.pieChart && sup && sup.rows) {
        this.pieChart.setOption({
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(15,23,42,0.88)', borderWidth: 0, confine: true,
            textStyle: { color: '#f8fafc', fontSize: 12 },
            formatter: '{b}：${c}（{d}%）',
          },
          legend: { type: 'scroll', top: 4, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 12, textStyle: { color: p.txt, fontSize: 11 } },
          series: [{
            type: 'pie',
            radius: ['40%', '60%'],
            center: ['50%', '44%'],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: p.pieBorder, borderWidth: 2 },
            label: { show: true, formatter: '{d}%', color: '#fff', fontSize: 11, textBorderColor: 'rgba(0,0,0,0.4)', textBorderWidth: 1 },
            labelLine: { show: false },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' } },
            data: sup.rows.map((r) => ({ name: r.name, value: Number(r.amount) })),
          }],
        });
      }
    },
    onThemeChange() { this.renderCharts(); },
  },
  mounted() {
    if (this.$refs.saleChart) this.saleChart = echarts.init(this.$refs.saleChart);
    if (this.$refs.pieChart) this.pieChart = echarts.init(this.$refs.pieChart);
    this.load();
    window.addEventListener('dz-theme-changed', this.onThemeChange);
  },
  unmounted() {
    window.removeEventListener('dz-theme-changed', this.onThemeChange);
    if (this.saleChart) { this.saleChart.dispose(); this.saleChart = null; }
    if (this.pieChart) { this.pieChart.dispose(); this.pieChart = null; }
  },
};