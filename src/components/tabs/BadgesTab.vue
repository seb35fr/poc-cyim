<template>
  <div v-if="stats">
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">Badges délivrés</div>
        <div class="kpi-value">{{ fmt(stats.global.totalBadgesDelivered) }}</div>
        <div class="kpi-sub">{{ pct(stats.global.totalBadgesDelivered, stats.global.totalDelegatesCount) }} des inscrits</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Check-in effectués</div>
        <div class="kpi-value">{{ fmt(stats.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ pct(stats.global.checkedInCount, stats.global.totalDelegatesCount) }} des inscrits</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Pic de performance (15 min)</div>
        <div class="kpi-value">{{ stats.badges.peakSlot.count > 0 ? stats.badges.peakSlot.count + ' badges' : '—' }}</div>
        <div class="kpi-sub" v-if="stats.badges.peakSlot.count > 0">
          le {{ stats.badges.peakSlot.date }} à {{ stats.badges.peakSlot.time }}
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Restants sans badge</div>
        <div class="kpi-value">{{ fmt(stats.global.totalDelegatesCount - stats.global.totalBadgesDelivered) }}</div>
      </div>
    </div>

    <!-- Badges délivrés par jour -->
    <div class="chart-card" style="margin-bottom: 16px;">
      <h3>Badges délivrés par jour</h3>
      <template v-if="badgesDayLabels.length > 0">
        <div :style="{ position: 'relative', height: '260px' }">
          <Bar :data="badgesDayChartData" :options="barOptions" />
        </div>
      </template>
      <p v-else class="empty-msg">Aucun badge délivré</p>
    </div>

    <!-- Performance par créneau de 15 min -->
    <div class="chart-card" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3>Performance de distribution (créneaux de 15 min)</h3>
        <div v-if="availableDays.length > 1" class="period-selector">
          <button v-for="day in availableDays" :key="day"
            :class="['period-btn', { active: selectedDay === day }]"
            @click="selectedDay = day">
            {{ day === 'all' ? 'Tous' : day.slice(5) }}
          </button>
        </div>
      </div>
      <template v-if="perf15Labels.length > 0">
        <div :style="{ position: 'relative', height: '280px' }">
          <Bar :data="perf15ChartData" :options="perf15Options" />
        </div>
        <div class="perf-summary">
          <span><strong>Moyenne :</strong> {{ avgPer15min }} badges / 15 min</span>
          <span><strong>Max :</strong> {{ maxPer15min }} badges / 15 min</span>
          <span><strong>Équivalent horaire max :</strong> {{ maxPer15min * 4 }} badges/h</span>
        </div>
      </template>
      <p v-else class="empty-msg">Aucune donnée de distribution</p>
    </div>

    <!-- Check-in par jour -->
    <div class="chart-card">
      <h3>Check-in par jour</h3>
      <template v-if="checkinDayLabels.length > 0">
        <div :style="{ position: 'relative', height: '260px' }">
          <Bar :data="checkinDayChartData" :options="barOptions" />
        </div>
      </template>
      <p v-else class="empty-msg">Aucun check-in enregistré</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { Bar } from "vue-chartjs";

const props = defineProps({ stats: Object });

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

// --- Badges par jour ---
const badgesDayLabels = computed(() => (props.stats?.badges?.byDay || []).map((d) => d.date.slice(5)));
const badgesDayChartData = computed(() => ({
  labels: badgesDayLabels.value,
  datasets: [{
    label: "Badges délivrés",
    data: (props.stats?.badges?.byDay || []).map((d) => d.count),
    backgroundColor: "#0F2D69",
    borderRadius: 4,
    barThickness: Math.max(8, Math.min(32, 600 / (badgesDayLabels.value.length || 1))),
  }],
}));

// --- Performance 15 min ---
const selectedDay = ref("all");
const availableDays = computed(() => {
  const days = [...new Set((props.stats?.badges?.per15min || []).map((s) => s.date))];
  return days.length > 1 ? ["all", ...days] : days;
});

const filtered15min = computed(() => {
  const data = props.stats?.badges?.per15min || [];
  if (selectedDay.value === "all") return data;
  return data.filter((s) => s.date === selectedDay.value);
});

const perf15Labels = computed(() =>
  filtered15min.value.map((s) => selectedDay.value === "all" ? `${s.date.slice(5)} ${s.time}` : s.time)
);

const perf15ChartData = computed(() => ({
  labels: perf15Labels.value,
  datasets: [{
    label: "Badges / 15 min",
    data: filtered15min.value.map((s) => s.count),
    backgroundColor: (ctx) => {
      const v = ctx.raw || 0;
      const max = maxPer15min.value || 1;
      const ratio = v / max;
      if (ratio > 0.8) return "#30DD92";
      if (ratio > 0.5) return "#FFA600";
      return "#0F2D69";
    },
    borderRadius: 3,
    barThickness: Math.max(4, Math.min(16, 800 / (perf15Labels.value.length || 1))),
  }],
}));

const avgPer15min = computed(() => {
  const d = filtered15min.value;
  if (d.length === 0) return 0;
  return (d.reduce((s, x) => s + x.count, 0) / d.length).toFixed(1);
});

const maxPer15min = computed(() => {
  const d = filtered15min.value;
  return d.length > 0 ? Math.max(...d.map((x) => x.count)) : 0;
});

const perf15Options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.raw} badges (≈ ${ctx.raw * 4}/h)`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

// --- Check-in par jour ---
const checkinByDay = computed(() => {
  const obj = props.stats?.checkinFlow?.byDay || {};
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
});
const checkinDayLabels = computed(() => checkinByDay.value.map(([d]) => d.slice(5)));
const checkinDayChartData = computed(() => ({
  labels: checkinDayLabels.value,
  datasets: [{
    label: "Check-in",
    data: checkinByDay.value.map(([, c]) => c),
    backgroundColor: "#30DD92",
    borderRadius: 4,
    barThickness: Math.max(8, Math.min(32, 600 / (checkinDayLabels.value.length || 1))),
  }],
}));

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      color: "#374151",
      font: { weight: 600, size: 11 },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};
</script>

<style scoped>
.perf-summary {
  display: flex; gap: 24px; margin-top: 12px; padding: 10px 16px;
  background: #f9fafb; border-radius: 8px; font-size: 13px; color: #374151;
}
.period-selector { display: flex; gap: 4px; flex-wrap: wrap; }
.period-btn {
  padding: 4px 10px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 11px; cursor: pointer; color: #6b7280;
}
.period-btn.active { background: #0F2D69; color: #fff; border-color: #0F2D69; }
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
