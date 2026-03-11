<template>
  <div v-if="stats">
    <div class="kpi-grid" v-if="stats.temporal.insights">
      <div class="kpi-card blue">
        <div class="kpi-label">Jour pic d'inscriptions</div>
        <div class="kpi-value">{{ stats.temporal.insights.peakDay?.date || '—' }}</div>
        <div class="kpi-sub">{{ fmt(stats.temporal.insights.peakDay?.count || 0) }} inscriptions</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Moyenne / jour</div>
        <div class="kpi-value">{{ stats.temporal.insights.avgPerDay?.toFixed(1) || '0' }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Dernière semaine</div>
        <div class="kpi-value">{{ fmt(lastWeekCount) }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Taux d'annulation</div>
        <div class="kpi-value">{{ cancellationRate }}</div>
      </div>
    </div>

    <div class="chart-card" v-if="stats.temporal.dailyRegistrations.length > 0" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3>Courbe d'inscriptions cumulées</h3>
        <div class="period-selector">
          <button v-for="p in periods" :key="p.value"
            :class="['period-btn', { active: selectedPeriod === p.value }]"
            @click="selectedPeriod = p.value">
            {{ p.label }}
          </button>
        </div>
      </div>
      <LineChart :labels="periodLabels" :datasets="cumulDatasets" :height="260" />
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Inscriptions par jour (30 derniers jours)</h3>
        <LineChart
          :labels="last30Labels"
          :datasets="dailyBarDataset"
          :height="220"
        />
      </div>
      <div class="chart-card">
        <h3>Distribution par jour de la semaine</h3>
        <HBarChart
          :labels="dayOfWeekLabels"
          :data="dayOfWeekData"
          color="#8b5cf6"
          :height="200"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Inscriptions par semaine et par type (8 dernières)</h3>
        <StackedBarChart
          v-if="weeklyByTypeLabels.length > 0"
          :labels="weeklyByTypeLabels"
          :datasets="weeklyByTypeDatasets"
          :height="240"
        />
        <p v-else class="empty-msg">Pas assez de données</p>
      </div>
      <div class="chart-card">
        <h3>Évolution des statuts par semaine</h3>
        <StackedBarChart
          v-if="weeklyStatusLabels.length > 0"
          :labels="weeklyStatusLabels"
          :datasets="weeklyStatusDatasets"
          :height="240"
        />
        <p v-else class="empty-msg">Pas assez de données</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import LineChart from "../charts/LineChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";

const props = defineProps({ stats: Object });
const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");

const selectedPeriod = ref("all");
const periods = [
  { value: "30", label: "30j" },
  { value: "90", label: "90j" },
  { value: "all", label: "Tout" },
];

const dailyRegs = computed(() => props.stats?.temporal?.dailyRegistrations || []);

const periodData = computed(() => {
  const d = dailyRegs.value;
  if (selectedPeriod.value === "all") return d;
  return d.slice(-Number(selectedPeriod.value));
});

const periodLabels = computed(() => periodData.value.map((d) => d.date.slice(5)));

const cumulDatasets = computed(() => {
  const d = periodData.value;
  const offset = dailyRegs.value.slice(0, dailyRegs.value.length - d.length).reduce((s, x) => s + x.count, 0);
  let cumul = offset;
  const cumulData = d.map((v) => { cumul += v.count; return cumul; });
  return [
    {
      label: "Inscriptions cumulées",
      data: cumulData,
      borderColor: "#0F2D69",
      backgroundColor: "rgba(15,45,105,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Inscriptions/jour",
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
const last30Labels = computed(() => last30.value.map((d) => d.date.slice(5)));
const dailyBarDataset = computed(() => [
  {
    label: "Inscriptions",
    data: last30.value.map((d) => d.count),
    borderColor: "#0F2D69",
    backgroundColor: "rgba(15,45,105,0.6)",
    type: "bar",
    borderRadius: 3,
    barThickness: 10,
  },
]);

const lastWeekCount = computed(() => dailyRegs.value.slice(-7).reduce((s, d) => s + d.count, 0));

const cancellationRate = computed(() => {
  const cancelled = props.stats?.registrations?.statuses?.find((s) => s.value === "cancelled");
  const total = props.stats?.global?.totalDelegatesCount || 0;
  return total > 0 && cancelled ? ((cancelled.totalCount / total) * 100).toFixed(1) + "%" : "0%";
});

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const dayOfWeekLabels = computed(() => {
  const dist = props.stats?.temporal?.dayOfWeekDistribution || {};
  return DAY_NAMES.filter((_, i) => (dist[i + 1] || 0) > 0 || true);
});
const dayOfWeekData = computed(() => {
  const dist = props.stats?.temporal?.dayOfWeekDistribution || {};
  return DAY_NAMES.map((_, i) => dist[i + 1] || 0);
});

const TYPE_COLORS = ["#0F2D69", "#30DD92", "#FFA600", "#E53935", "#8b5cf6", "#3b82f6", "#f59e0b", "#6366f1"];

const weeklyByTypeLabels = computed(() =>
  (props.stats?.temporal?.weeklyByType || []).slice(-8).map((w) => w.week)
);
const weeklyByTypeDatasets = computed(() => {
  const weeks = (props.stats?.temporal?.weeklyByType || []).slice(-8);
  const allTypes = [...new Set(weeks.flatMap((w) => Object.keys(w.types || {})))];
  return allTypes.map((type, i) => ({
    label: type,
    data: weeks.map((w) => w.types?.[type] || 0),
    backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length],
    borderRadius: 2,
  }));
});

const weeklyStatusLabels = computed(() =>
  (props.stats?.temporal?.weeklyStatuses || []).slice(-8).map((w) => w.week)
);
const weeklyStatusDatasets = computed(() => {
  const weeks = (props.stats?.temporal?.weeklyStatuses || []).slice(-8);
  const STATUS_MAP = { confirmed: "#30DD92", pending: "#FFA600", cancelled: "#E53935", refused: "#8b5cf6" };
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
  border-radius: 4px; font-size: 12px; cursor: pointer; color: #6b7280;
}
.period-btn.active { background: #0F2D69; color: #fff; border-color: #0F2D69; }
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
