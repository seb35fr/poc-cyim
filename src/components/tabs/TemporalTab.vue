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

    <div class="kpi-grid" v-if="fs.temporal.insights">
      <div class="kpi-card blue">
        <div class="kpi-label">{{ t("temporal.kpi.peakDay") }}</div>
        <div class="kpi-value">{{ fs.temporal.insights.peakDay?.date || '—' }}</div>
        <div class="kpi-sub">{{ t("temporal.kpi.peakDaySub", { n: fmt(fs.temporal.insights.peakDay?.count || 0) }) }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("temporal.kpi.avgPerDay") }}</div>
        <div class="kpi-value">{{ fs.temporal.insights.avgPerDay?.toFixed(1) || '0' }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">{{ t("temporal.kpi.lastWeek") }}</div>
        <div class="kpi-value">{{ fmt(lastWeekCount) }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">{{ t("temporal.kpi.cancellationRate") }}</div>
        <div class="kpi-value">{{ cancellationRate }}</div>
      </div>
    </div>

    <div class="chart-card" v-if="fs.temporal.dailyRegistrations.length > 0">
      <div class="chart-header">
        <h3>{{ t("temporal.charts.cumulCurve") }}</h3>
        <div style="display: flex; align-items: center; gap: 8px;">
        <CsvButton filename="inscriptions-cumulees" :headers="[t('temporal.csv.date'), t('temporal.csv.registrations')]" :rows="periodData.map(d => [d.date, d.count])" />
        <div class="period-selector">
          <button v-for="p in periods" :key="p.value"
            :class="['period-btn', { active: selectedPeriod === p.value }]"
            @click="selectedPeriod = p.value">
            {{ p.label }}
          </button>
        </div>
        </div>
      </div>
      <LineChart :labels="periodLabels" :datasets="cumulDatasets" :height="260" />
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("temporal.charts.last30") }}</h3>
          <CsvButton filename="inscriptions-30j" :headers="[t('temporal.csv.date'), t('temporal.csv.registrations')]" :rows="last30.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="last30Labels"
          :datasets="dailyBarDataset"
          :height="220"
        />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("temporal.charts.byWeekday") }}</h3>
          <CsvButton filename="jours-semaine" :headers="[t('temporal.csv.day'), t('temporal.csv.registrations')]" :rows="dayOfWeekLabels.map((d, i) => [d, dayOfWeekData[i]])" />
        </div>
        <HBarChart
          :labels="dayOfWeekLabels"
          :data="dayOfWeekData"
          color="#6F45FF"
          :height="200"
          :active-label="afm.dayOfWeek"
          @select="onDayOfWeekSelect"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("temporal.charts.weeklyByType") }}</h3>
          <CsvButton filename="hebdo-par-type" :headers="[t('temporal.csv.week'), ...weeklyByTypeDatasets.map(d => d.label)]" :rows="weeklyByTypeLabels.map((w, i) => [w, ...weeklyByTypeDatasets.map(d => d.data[i])])" />
        </div>
        <StackedBarChart
          v-if="weeklyByTypeLabels.length > 0"
          :labels="weeklyByTypeLabels"
          :datasets="weeklyByTypeDatasets"
          :height="240"
        />
        <p v-else class="empty-msg">{{ t("temporal.notEnoughData") }}</p>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("temporal.charts.weeklyStatus") }}</h3>
          <CsvButton filename="hebdo-statuts" :headers="[t('temporal.csv.week'), ...weeklyStatusDatasets.map(d => d.label)]" :rows="weeklyStatusLabels.map((w, i) => [w, ...weeklyStatusDatasets.map(d => d.data[i])])" />
        </div>
        <StackedBarChart
          v-if="weeklyStatusLabels.length > 0"
          :labels="weeklyStatusLabels"
          :datasets="weeklyStatusDatasets"
          :height="240"
        />
        <p v-else class="empty-msg">{{ t("temporal.notEnoughData") }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import LineChart from "../charts/LineChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { weekdayNames } from "@/i18n/labels.js";
import { fmt } from "@/utils/formatters.js";

const { t } = useI18n();

const props = defineProps({ stats: Object, delegates: Array, dateRange: { type: Object, default: null } });

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates);

const selectedPeriod = ref("all");
const periods = computed(() => [
  { value: "30", label: t("temporal.periods.d30") },
  { value: "90", label: t("temporal.periods.d90") },
  { value: "all", label: t("temporal.periods.all") },
]);

// --- Filtres ---
// Jours localises (index 0 = Lundi ... 6 = Dimanche), via le meme util que
// l'affichage : le clic renvoie le libelle localise, indexOf retrouve l'index.
const dayNames = computed(() => weekdayNames());
const ISO_TO_JS = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 }; // index in dayNames → JS getDay()

function onDayOfWeekSelect(label) {
  const dayIndex = dayNames.value.indexOf(label);
  const jsDay = ISO_TO_JS[dayIndex];
  toggleFilter("dayOfWeek", label, (d) => {
    if (!d.createdAt) return false;
    return new Date(d.createdAt).getDay() === jsDay;
  });
}

// --- Computed ---
const dailyRegs = computed(() => fs.value?.temporal?.dailyRegistrations || []);

const periodData = computed(() => {
  const d = dailyRegs.value;
  if (selectedPeriod.value === "all") return d;
  return d.slice(-Number(selectedPeriod.value));
});

const periodLabels = computed(() => {
  const dates = periodData.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});

const cumulDatasets = computed(() => {
  const d = periodData.value;
  const offset = dailyRegs.value.slice(0, dailyRegs.value.length - d.length).reduce((s, x) => s + x.count, 0);
  let cumul = offset;
  const cumulData = d.map((v) => { cumul += v.count; return cumul; });
  return [
    {
      label: t("temporal.datasets.cumulRegistrations"),
      data: cumulData,
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: t("temporal.datasets.registrationsPerDay"),
      data: d.map((v) => v.count),
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(4, Math.min(12, 600 / d.length)),
      yAxisID: "y1",
    },
  ];
});

const last30 = computed(() => dailyRegs.value.slice(-30));
const last30Labels = computed(() => {
  const dates = last30.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
const dailyBarDataset = computed(() => [
  {
    label: t("temporal.datasets.registrations"),
    data: last30.value.map((d) => d.count),
    borderColor: "#1E4E66",
    backgroundColor: "rgba(30,78,102,0.6)",
    type: "bar",
    borderRadius: 3,
    barThickness: 10,
  },
]);

const lastWeekCount = computed(() => dailyRegs.value.slice(-7).reduce((s, d) => s + d.count, 0));

const cancellationRate = computed(() => {
  const cancelled = fs.value?.registrations?.statuses?.find((s) => s.value === "cancelled");
  const total = fs.value?.global?.totalDelegatesCount || 0;
  return total > 0 && cancelled ? ((cancelled.totalCount / total) * 100).toFixed(1) + "%" : "0%";
});

const dayOfWeekLabels = computed(() => dayNames.value);
const dayOfWeekData = computed(() => {
  const dist = fs.value?.temporal?.dayOfWeekDistribution || {};
  return dayNames.value.map((_, i) => dist[i + 1] || 0);
});

const TYPE_COLORS = ["#1E4E66", "#30DD92", "#FFA600", "#E53935", "#6F45FF", "#3b82f6", "#f59e0b", "#6366f1"];

const weeklyByTypeLabels = computed(() =>
  (fs.value?.temporal?.weeklyByType || []).slice(-8).map((w) => w.week)
);
const weeklyByTypeDatasets = computed(() => {
  const weeks = (fs.value?.temporal?.weeklyByType || []).slice(-8);
  const allTypes = [...new Set(weeks.flatMap((w) => Object.keys(w.types || {})))];
  return allTypes.map((type, i) => ({
    label: type,
    data: weeks.map((w) => w.types?.[type] || 0),
    backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length],
    borderRadius: 2,
  }));
});

const weeklyStatusLabels = computed(() =>
  (fs.value?.temporal?.weeklyStatuses || []).slice(-8).map((w) => w.week)
);
const weeklyStatusDatasets = computed(() => {
  const weeks = (fs.value?.temporal?.weeklyStatuses || []).slice(-8);
  const STATUS_MAP = { confirmed: "#30DD92", pending: "#FFA600", cancelled: "#E53935", refused: "#6F45FF" };
  const allStatuses = [...new Set(weeks.flatMap((w) => Object.keys(w.statuses || {})))];
  return allStatuses.map((status) => ({
    label: status,
    data: weeks.map((w) => w.statuses?.[status] || 0),
    backgroundColor: STATUS_MAP[status] || "#e5e7eb",
    borderRadius: 2,
  }));
});
</script>

<style scoped>
.period-selector { display: flex; gap: 4px; }
.period-btn {
  padding: 4px 12px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 14px; cursor: pointer; color: var(--text-secondary);
}
.period-btn.active { background: #1E4E66; color: #fff; border-color: #1E4E66; }
.empty-msg { text-align: center; color: var(--text-muted); padding: 20px; font-size: 15px; }
</style>
