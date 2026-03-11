<template>
  <div v-if="stats">
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">Total inscrits</div>
        <div class="kpi-value">{{ fmt(stats.global.totalDelegatesCount) }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Taux de check-in</div>
        <div class="kpi-value">{{ pct(stats.global.checkedInCount, stats.global.totalDelegatesCount) }}</div>
        <div class="kpi-sub"><strong>{{ fmt(stats.global.checkedInCount) }}</strong> / {{ fmt(stats.global.totalDelegatesCount) }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Connexion onboarding</div>
        <div class="kpi-value">{{ pct(stats.global.onboardingCount, stats.global.totalDelegatesCount) }}</div>
        <div class="kpi-sub"><strong>{{ fmt(stats.global.onboardingCount) }}</strong> / {{ fmt(stats.global.totalDelegatesCount) }}</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Inscriptions en attente</div>
        <div class="kpi-value">{{ fmt(stats.global.pendingCount) }}</div>
        <div class="kpi-sub"><strong>{{ pct(stats.global.pendingCount, stats.global.totalDelegatesCount) }}</strong> des inscrits</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Repartition par statut</h3>
        <div style="max-width: 220px; margin: 0 auto;">
          <DoughnutChart
            :labels="stats.registrations.statuses.map(s => s.value)"
            :data="stats.registrations.statuses.map(s => s.totalCount)"
            :colors="['#30DD92', '#FFA600', '#E53935', '#8b5cf6', '#e5e7eb']"
          />
        </div>
        <div class="legend-row">
          <span v-for="s in stats.registrations.statuses" :key="s.value" class="legend-pill">
            {{ s.value }} {{ fmt(s.totalCount) }}
          </span>
        </div>
      </div>
      <div class="chart-card">
        <h3>Repartition par type d'inscription</h3>
        <HBarChart
          :labels="stats.registrations.types.slice(0, 8).map(t => t.value)"
          :data="stats.registrations.types.slice(0, 8).map(t => t.totalCount)"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Top 10 categories</h3>
        <HBarChart
          :labels="topCategories.map(c => c.value)"
          :data="topCategories.map(c => c.totalCount)"
          color="#1a5cb0"
        />
      </div>
      <div class="chart-card">
        <h3>Connexion onboarding</h3>
        <div style="max-width: 200px; margin: 0 auto;">
          <DoughnutChart
            :labels="['Connectes', 'Jamais connectes']"
            :data="[stats.global.onboardingCount, stats.global.totalDelegatesCount - stats.global.onboardingCount]"
            :colors="['#30DD92', '#e5e7eb']"
          />
        </div>
      </div>
    </div>

    <div class="chart-card" v-if="stats.temporal.dailyRegistrations.length > 0">
      <h3>Evolution des inscriptions (30 derniers jours)</h3>
      <LineChart
        :labels="last30Labels"
        :datasets="timelineDatasets"
        :height="220"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";

const props = defineProps({ stats: Object });

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

const topCategories = computed(() => {
  return (props.stats?.registrations?.categories || []).slice(0, 10);
});

const last30 = computed(() => (props.stats?.temporal?.dailyRegistrations || []).slice(-30));
const last30Labels = computed(() => last30.value.map((d) => d.date.slice(5)));

const timelineDatasets = computed(() => {
  const daily = last30.value.map((d) => d.count);
  let cumul = 0;
  const cumulBefore = (props.stats?.temporal?.dailyRegistrations || [])
    .slice(0, -30)
    .reduce((s, d) => s + d.count, 0);
  const cumulData = daily.map((v) => {
    cumul += v;
    return cumulBefore + cumul;
  });
  return [
    {
      label: "Inscriptions cumulees",
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
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: 10,
      yAxisID: "y1",
    },
  ];
});
</script>
