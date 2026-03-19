<template>
  <div v-if="stats">
    <FilterBanner
      :has-filters="hasFilters"
      :active-filters="activeFilters"
      :filtered-count="filteredCount"
      :total-count="stats.global.totalDelegatesCount"
      @remove="removeFilter"
      @clear="clearFilters"
    />

    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">Badges délivrés</div>
        <div class="kpi-value">{{ fmt(fs.global.totalBadgesDelivered) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.totalBadgesDelivered, registeredCount) }} des attendus</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Check-in effectués</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.checkedInCount, registeredCount) }} des attendus</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Pic de performance (15 min)</div>
        <div class="kpi-value">{{ fs.badges.peakSlot.count > 0 ? fs.badges.peakSlot.count + ' badges' : '—' }}</div>
        <div class="kpi-sub" v-if="fs.badges.peakSlot.count > 0">
          le {{ fs.badges.peakSlot.date }} à {{ fs.badges.peakSlot.time }}
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Restants sans badge (validés)</div>
        <div class="kpi-value">{{ fmt(confirmedWithoutBadge) }}</div>
      </div>
    </div>

    <!-- Progression du check-in -->
    <div class="chart-card" style="margin-bottom: 16px;">
      <h3>Progression du check-in</h3>
      <div class="progress-bar-container">
        <div class="progress-bar-fill-checkin" :style="{ width: checkinPct }"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #646464; margin-top: 4px;">
        <span>{{ fmt(fs.global.checkedInCount) }} checked-in ({{ checkinPct }})</span>
        <span>{{ fmt(registeredCount) }} attendus (registered)</span>
      </div>
    </div>

    <!-- Badges délivrés par jour -->
    <div class="chart-card" style="margin-bottom: 16px;">
      <div class="chart-header">
        <h3>Badges délivrés par jour</h3>
        <CsvButton filename="badges-par-jour" :headers="['Date', 'Badges']" :rows="(fs.badges.byDay || []).map(d => [d.date, d.count])" />
      </div>
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
        <div style="display: flex; align-items: center; gap: 8px;">
        <CsvButton filename="perf-15min" :headers="['Date', 'Heure', 'Badges']" :rows="filtered15min.map(s => [s.date, s.time, s.count])" />
        <div v-if="availableDays.length > 1" class="period-selector">
          <button v-for="day in availableDays" :key="day"
            :class="['period-btn', { active: selectedDay === day }]"
            @click="selectedDay = day">
            {{ day === 'all' ? 'Tous' : day.slice(5) }}
          </button>
        </div>
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

    <!-- Badges imprimés par device -->
    <div class="chart-card" style="margin-bottom: 16px;">
      <div class="chart-header">
        <h3>Badges imprimés par device</h3>
        <CsvButton filename="badges-par-device" :headers="['Device', 'Badges']" :rows="byDevice.map(d => [d.device, d.count])" />
      </div>
      <template v-if="deviceLabels.length > 0">
        <HBarChart
          :labels="deviceLabels"
          :data="deviceData"
          color="#6F45FF"
          :height="deviceChartHeight"
          :active-label="afm.device"
          @select="onDeviceSelect"
        />
      </template>
      <p v-else class="empty-msg">Aucune donnée de device</p>
    </div>

    <!-- Flux de check-in par heure -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Flux de check-in par jour et heure</h3>
          <CsvButton filename="checkin-par-heure" :headers="['Heure', ...checkinDays.map(d => d.slice(5))]" :rows="allCheckinHours.map(h => [h, ...checkinDays.map(day => (fs.checkinFlow?.byDayAndHour?.[day]?.[h] || 0))])" />
        </div>
        <LineChart
          v-if="hourlyLabels.length > 0"
          :labels="hourlyLabels"
          :datasets="hourlyDatasets"
          :height="220"
        />
        <p v-else class="empty-msg">Aucun check-in enregistré</p>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>Check-in par jour</h3>
          <CsvButton filename="checkin-par-jour" :headers="['Date', 'Check-in']" :rows="checkinByDay.map(([d, c]) => [d, c])" />
        </div>
        <template v-if="checkinDayLabels.length > 0">
          <div :style="{ position: 'relative', height: '260px' }">
            <Bar :data="checkinDayChartData" :options="barOptions" />
          </div>
        </template>
        <p v-else class="empty-msg">Aucun check-in enregistré</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";

const props = defineProps({ stats: Object, delegates: Array });

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates);

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

// --- Filtres ---
function onDeviceSelect(label) {
  toggleFilter("device", label, (d) =>
    (d.badges || []).some((b) => (b.deliveredBy || "Inconnu") === label)
  );
}

// Restants sans badge = delegates VALIDATED sans checkedInDate
const confirmedWithoutBadge = computed(() => {
  const delegates = props.delegates || [];
  return delegates.filter(
    (d) => d.status?.toLowerCase() === "registered" && !d.checkedInDate
  ).length;
});

// Base = delegates au statut REGISTERED (ceux qui auront un badge)
const registeredCount = computed(() => {
  const delegates = props.delegates || [];
  return delegates.filter((d) => d.status?.toLowerCase() === "registered").length;
});

const checkinPct = computed(() => pct(fs.value?.global?.checkedInCount, registeredCount.value));

// --- Badges par jour ---
const badgesDayLabels = computed(() => (fs.value?.badges?.byDay || []).map((d) => d.date.slice(5)));
const badgesDayChartData = computed(() => ({
  labels: badgesDayLabels.value,
  datasets: [{
    label: "Badges délivrés",
    data: (fs.value?.badges?.byDay || []).map((d) => d.count),
    backgroundColor: "#1E4E66",
    borderRadius: 4,
    barThickness: Math.max(8, Math.min(32, 600 / (badgesDayLabels.value.length || 1))),
  }],
}));

// --- Performance 15 min ---
const selectedDay = ref("all");
const availableDays = computed(() => {
  const days = [...new Set((fs.value?.badges?.per15min || []).map((s) => s.date))];
  return days.length > 1 ? ["all", ...days] : days;
});

const filtered15min = computed(() => {
  const data = fs.value?.badges?.per15min || [];
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
      return "#1E4E66";
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

// --- Badges par device ---
const byDevice = computed(() => fs.value?.badges?.byDevice || []);
const deviceLabels = computed(() => byDevice.value.map((d) => d.device));
const deviceData = computed(() => byDevice.value.map((d) => d.count));
const deviceChartHeight = computed(() => Math.max(180, byDevice.value.length * 36));

// --- Flux de check-in par jour et heure ---
const checkinDays = computed(() => {
  const obj = fs.value?.checkinFlow?.byDayAndHour || {};
  return Object.keys(obj).sort();
});
const allCheckinHours = computed(() => {
  const obj = fs.value?.checkinFlow?.byDayAndHour || {};
  const hours = new Set();
  for (const dayData of Object.values(obj)) {
    for (const h of Object.keys(dayData)) hours.add(h);
  }
  return [...hours].sort();
});
const hourlyLabels = computed(() => allCheckinHours.value);
const dayColors = ["#1E4E66", "#30DD92", "#6F45FF", "#FFA600", "#FF6B6B", "#00BCD4", "#9C27B0"];
const hourlyDatasets = computed(() => {
  const obj = fs.value?.checkinFlow?.byDayAndHour || {};
  const hours = allCheckinHours.value;
  return checkinDays.value.map((day, i) => ({
    label: day.slice(5),
    data: hours.map((h) => obj[day]?.[h] || 0),
    borderColor: dayColors[i % dayColors.length],
    backgroundColor: dayColors[i % dayColors.length] + "33",
    fill: false,
    tension: 0.3,
    pointRadius: 3,
    borderWidth: 2,
  }));
});

// --- Check-in par jour ---
const checkinByDay = computed(() => {
  const obj = fs.value?.checkinFlow?.byDay || {};
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
      color: "#414141",
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
  background: #f9fafb; border-radius: 8px; font-size: 13px; color: #414141;
}
.period-selector { display: flex; gap: 4px; flex-wrap: wrap; }
.period-btn {
  padding: 4px 10px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 11px; cursor: pointer; color: #646464;
}
.period-btn.active { background: #1E4E66; color: #fff; border-color: #1E4E66; }
.progress-bar-container {
  background: #e5e7eb; border-radius: 8px; height: 24px; overflow: hidden;
}
.progress-bar-fill-checkin {
  background: linear-gradient(90deg, #30DD92, #22c55e);
  height: 100%; border-radius: 8px; transition: width .5s ease;
  min-width: 2px;
}
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
