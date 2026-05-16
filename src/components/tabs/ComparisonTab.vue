<template>
  <div>
    <!-- Header -->
    <div class="cmp-header">
      <div class="cmp-event cmp-event--current">
        <span class="cmp-event-dot" :style="{ background: COLORS.current }"></span>
        <div>
          <div class="cmp-event-label">Événement sélectionné</div>
          <div class="cmp-event-name">{{ eventName || "—" }}</div>
        </div>
      </div>
      <div class="cmp-vs">vs</div>
      <div class="cmp-event cmp-event--compare">
        <span class="cmp-event-dot" :style="{ background: COLORS.compare }"></span>
        <div>
          <div class="cmp-event-label">Événement comparé</div>
          <div class="cmp-event-name">{{ compareEventName || "—" }}</div>
        </div>
      </div>
    </div>

    <div v-if="compareLoading" class="cmp-loading">
      <div class="spinner"></div>
      <p class="loading-label">Chargement de l'événement de comparaison...</p>
      <div v-if="compareProgress?.total > 0" class="progress-wrapper">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: compareProgressPercent + '%' }"></div>
        </div>
        <p class="progress-text">
          {{ compareProgress.loaded }} / {{ compareProgress.total }} inscrits
        </p>
      </div>
    </div>

    <div v-else-if="compareError" class="cmp-error">
      Erreur sur l'événement comparé : {{ compareError }}
    </div>

    <template v-else-if="compareStats">
      <!-- KPIs cote a cote -->
      <div class="kpi-compare-grid">
        <div class="kpi-compare-card">
          <div class="kpi-label">Badges délivrés</div>
          <div class="kpi-rows">
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.current }"></span>
              <span class="kpi-row-name">{{ shortName(eventName) }}</span>
              <span class="kpi-row-value">{{ fmt(currentMetrics.badgesDelivered) }}</span>
              <span class="kpi-row-pct">{{ pct(currentMetrics.badgesDelivered, currentMetrics.registered) }}</span>
            </div>
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.compare }"></span>
              <span class="kpi-row-name">{{ shortName(compareEventName) }}</span>
              <span class="kpi-row-value">{{ fmt(compareMetrics.badgesDelivered) }}</span>
              <span class="kpi-row-pct">{{ pct(compareMetrics.badgesDelivered, compareMetrics.registered) }}</span>
            </div>
          </div>
        </div>

        <div class="kpi-compare-card">
          <div class="kpi-label">Check-in effectués</div>
          <div class="kpi-rows">
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.current }"></span>
              <span class="kpi-row-name">{{ shortName(eventName) }}</span>
              <span class="kpi-row-value">{{ fmt(currentMetrics.checkedIn) }}</span>
              <span class="kpi-row-pct">{{ pct(currentMetrics.checkedIn, currentMetrics.registered) }}</span>
            </div>
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.compare }"></span>
              <span class="kpi-row-name">{{ shortName(compareEventName) }}</span>
              <span class="kpi-row-value">{{ fmt(compareMetrics.checkedIn) }}</span>
              <span class="kpi-row-pct">{{ pct(compareMetrics.checkedIn, compareMetrics.registered) }}</span>
            </div>
          </div>
        </div>

        <div class="kpi-compare-card">
          <div class="kpi-label">Pic 15 min</div>
          <div class="kpi-rows">
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.current }"></span>
              <span class="kpi-row-name">{{ shortName(eventName) }}</span>
              <span class="kpi-row-value">{{ currentMetrics.peak.count || "—" }}</span>
              <span class="kpi-row-pct">{{ currentMetrics.peak.count > 0 ? currentMetrics.peak.time : "" }}</span>
            </div>
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.compare }"></span>
              <span class="kpi-row-name">{{ shortName(compareEventName) }}</span>
              <span class="kpi-row-value">{{ compareMetrics.peak.count || "—" }}</span>
              <span class="kpi-row-pct">{{ compareMetrics.peak.count > 0 ? compareMetrics.peak.time : "" }}</span>
            </div>
          </div>
        </div>

        <div class="kpi-compare-card">
          <div class="kpi-label">Restants sans badge</div>
          <div class="kpi-rows">
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.current }"></span>
              <span class="kpi-row-name">{{ shortName(eventName) }}</span>
              <span class="kpi-row-value">{{ fmt(currentMetrics.remainingNoBadge) }}</span>
              <span class="kpi-row-pct">{{ pct(currentMetrics.remainingNoBadge, currentMetrics.registered) }}</span>
            </div>
            <div class="kpi-row">
              <span class="kpi-dot" :style="{ background: COLORS.compare }"></span>
              <span class="kpi-row-name">{{ shortName(compareEventName) }}</span>
              <span class="kpi-row-value">{{ fmt(compareMetrics.remainingNoBadge) }}</span>
              <span class="kpi-row-pct">{{ pct(compareMetrics.remainingNoBadge, compareMetrics.registered) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Taux de conversion -->
      <div class="chart-card">
        <h3>Taux de conversion (% des registered)</h3>
        <div :style="{ position: 'relative', height: '180px' }">
          <Bar :data="conversionChartData" :options="conversionOptions" />
        </div>
      </div>

      <!-- Badges par jour (relatif au J0 du 1er badge) -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Badges délivrés par jour (J0 = 1er badge)</h3>
          <span class="cmp-axis-hint">Axe X : décalage en jours depuis le 1er badge délivré de chaque event</span>
        </div>
        <LineChart
          v-if="badgesByDayChart.labels.length > 0"
          :labels="badgesByDayChart.labels"
          :datasets="badgesByDayChart.datasets"
          :height="260"
        />
        <p v-else class="empty-msg">Aucun badge délivré sur l'un ou l'autre des événements</p>
      </div>

      <!-- Check-in par jour (relatif au J0 du 1er check-in) -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Check-in par jour (J0 = 1er check-in)</h3>
          <span class="cmp-axis-hint">Axe X : décalage en jours depuis le 1er check-in de chaque event</span>
        </div>
        <LineChart
          v-if="checkinByDayChart.labels.length > 0"
          :labels="checkinByDayChart.labels"
          :datasets="checkinByDayChart.datasets"
          :height="260"
        />
        <p v-else class="empty-msg">Aucun check-in enregistré sur l'un ou l'autre des événements</p>
      </div>

      <!-- Performance 15 min superposee (cumul par time-of-day) -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Performance de distribution (créneaux de 15 min, cumul time-of-day)</h3>
          <span class="cmp-axis-hint">Toutes les journées de chaque event sont agrégées par heure de la journée.</span>
        </div>
        <LineChart
          v-if="perf15minChart.labels.length > 0"
          :labels="perf15minChart.labels"
          :datasets="perf15minChart.datasets"
          :height="280"
        />
        <p v-else class="empty-msg">Aucune donnée de distribution</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Bar } from "vue-chartjs";
import LineChart from "../charts/LineChart.vue";

const props = defineProps({
  stats: Object,
  delegates: Array,
  eventName: String,
  compareStats: Object,
  compareDelegates: Array,
  compareEventName: String,
  compareLoading: Boolean,
  compareError: String,
  compareProgress: Object,
});

const COLORS = {
  current: "#1E4E66",
  compare: "#6F45FF",
};

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");
const shortName = (n) => {
  if (!n) return "—";
  return n.length > 26 ? n.slice(0, 24) + "…" : n;
};

const compareProgressPercent = computed(() => {
  const p = props.compareProgress;
  return p?.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
});

function metricsFor(stats, delegates) {
  const list = delegates || [];
  const registered = list.filter((d) => d.status?.toLowerCase() === "registered").length;
  const checkedIn = stats?.global?.checkedInCount || 0;
  const badgesDelivered = stats?.global?.totalBadgesDelivered || 0;
  const remainingNoBadge = list.filter(
    (d) => d.status?.toLowerCase() === "registered" && !d.checkedInDate
  ).length;
  const peakSlot = stats?.badges?.peakSlot || { count: 0, date: "-", time: "-" };
  const peak = {
    count: peakSlot.count || 0,
    time: peakSlot.count > 0 ? `${peakSlot.date} ${peakSlot.time}` : "",
  };
  return { registered, checkedIn, badgesDelivered, remainingNoBadge, peak };
}

const currentMetrics = computed(() => metricsFor(props.stats, props.delegates));
const compareMetrics = computed(() => metricsFor(props.compareStats, props.compareDelegates));

// --- Taux de conversion ---
const conversionChartData = computed(() => ({
  labels: ["Badges délivrés", "Check-in effectués", "Restants sans badge"],
  datasets: [
    {
      label: shortName(props.eventName),
      data: [
        ratio(currentMetrics.value.badgesDelivered, currentMetrics.value.registered),
        ratio(currentMetrics.value.checkedIn, currentMetrics.value.registered),
        ratio(currentMetrics.value.remainingNoBadge, currentMetrics.value.registered),
      ],
      backgroundColor: COLORS.current,
      borderRadius: 4,
      barThickness: 22,
    },
    {
      label: shortName(props.compareEventName),
      data: [
        ratio(compareMetrics.value.badgesDelivered, compareMetrics.value.registered),
        ratio(compareMetrics.value.checkedIn, compareMetrics.value.registered),
        ratio(compareMetrics.value.remainingNoBadge, compareMetrics.value.registered),
      ],
      backgroundColor: COLORS.compare,
      borderRadius: 4,
      barThickness: 22,
    },
  ],
}));

function ratio(a, b) {
  return b > 0 ? +((a / b) * 100).toFixed(1) : 0;
}

const conversionOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "circle" } },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      color: "#414141",
      font: { weight: 600, size: 10 },
      formatter: (v) => v + "%",
    },
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${ctx.raw}%` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 }, callback: (v) => v + "%" }, beginAtZero: true, max: 110 },
  },
};

// --- Alignement J-N : convertit une serie [{date, count}] en map { dayOffset: count } ---
function toRelativeDayMap(series) {
  if (!series || series.length === 0) return { map: new Map(), max: 0 };
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const day0 = new Date(sorted[0].date + "T00:00:00Z");
  const map = new Map();
  let max = 0;
  for (const item of sorted) {
    const d = new Date(item.date + "T00:00:00Z");
    const offset = Math.round((d - day0) / 86_400_000);
    map.set(offset, item.count);
    if (offset > max) max = offset;
  }
  return { map, max };
}

function buildRelativeDayDatasets(currentSeries, compareSeries) {
  const cur = toRelativeDayMap(currentSeries);
  const cmp = toRelativeDayMap(compareSeries);
  const maxDay = Math.max(cur.max, cmp.max);
  if (cur.map.size === 0 && cmp.map.size === 0) {
    return { labels: [], datasets: [] };
  }
  const labels = [];
  const curData = [];
  const cmpData = [];
  for (let i = 0; i <= maxDay; i++) {
    labels.push(`J${i}`);
    curData.push(cur.map.get(i) ?? 0);
    cmpData.push(cmp.map.get(i) ?? 0);
  }
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: curData,
        borderColor: COLORS.current,
        backgroundColor: COLORS.current + "33",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        borderWidth: 2,
      },
      {
        label: shortName(props.compareEventName),
        data: cmpData,
        borderColor: COLORS.compare,
        backgroundColor: COLORS.compare + "33",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        borderWidth: 2,
      },
    ],
  };
}

const badgesByDayChart = computed(() =>
  buildRelativeDayDatasets(
    props.stats?.badges?.byDay || [],
    props.compareStats?.badges?.byDay || []
  )
);

const checkinByDayChart = computed(() => {
  const cur = Object.entries(props.stats?.checkinFlow?.byDay || {}).map(([date, count]) => ({ date, count }));
  const cmp = Object.entries(props.compareStats?.checkinFlow?.byDay || {}).map(([date, count]) => ({ date, count }));
  return buildRelativeDayDatasets(cur, cmp);
});

// --- 15min superpose : agrege par time-of-day (HH:MM) sur tout l'event ---
function aggregateByTimeOfDay(per15min) {
  const map = new Map();
  for (const slot of per15min || []) {
    const key = slot.time;
    map.set(key, (map.get(key) || 0) + slot.count);
  }
  return map;
}

const perf15minChart = computed(() => {
  const curMap = aggregateByTimeOfDay(props.stats?.badges?.per15min);
  const cmpMap = aggregateByTimeOfDay(props.compareStats?.badges?.per15min);
  if (curMap.size === 0 && cmpMap.size === 0) return { labels: [], datasets: [] };
  const labels = [...new Set([...curMap.keys(), ...cmpMap.keys()])].sort();
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: labels.map((t) => curMap.get(t) || 0),
        borderColor: COLORS.current,
        backgroundColor: COLORS.current + "33",
        fill: false,
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: shortName(props.compareEventName),
        data: labels.map((t) => cmpMap.get(t) || 0),
        borderColor: COLORS.compare,
        backgroundColor: COLORS.compare + "33",
        fill: false,
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };
});
</script>

<style scoped>
.cmp-header {
  display: flex; align-items: center; gap: 12px;
  background: var(--card); border-radius: 10px; padding: 12px 16px;
  box-shadow: var(--shadow); margin-bottom: 12px;
}
.cmp-event { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.cmp-event-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cmp-event-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
.cmp-event-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp-vs { font-size: 11px; color: var(--text-muted); font-weight: 600; }

.kpi-compare-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px; margin-bottom: 12px;
}
.kpi-compare-card {
  background: var(--card); border-radius: 10px; padding: 12px 14px;
  box-shadow: var(--shadow);
}
.kpi-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.kpi-row {
  display: grid; grid-template-columns: 10px 1fr auto auto;
  align-items: center; gap: 8px;
  font-size: 12px;
}
.kpi-dot { width: 8px; height: 8px; border-radius: 50%; }
.kpi-row-name { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-row-value { font-weight: 700; color: var(--text); font-size: 14px; }
.kpi-row-pct { color: var(--text-muted); font-size: 11px; min-width: 50px; text-align: right; }

.cmp-axis-hint { font-size: 10px; color: var(--text-muted); font-style: italic; }

.cmp-loading, .cmp-error {
  background: var(--card); border-radius: 10px; padding: 32px 16px;
  box-shadow: var(--shadow); text-align: center;
}
.cmp-error { color: var(--danger); }
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
