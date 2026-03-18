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

    <div class="kpi-row-all">
      <div class="kpi-card blue">
        <div class="kpi-label">Total inscrits</div>
        <div class="kpi-value">{{ fmt(fs.global.totalDelegatesCount) }}</div>
      </div>
      <div class="kpi-card-status">
        <div class="kpi-label">Répartition par statut</div>
        <div class="status-row">
          <div style="width: 100px; flex-shrink: 0;">
            <DoughnutChart
              :labels="fs.registrations.statuses.map(s => s.value)"
              :data="fs.registrations.statuses.map(s => s.totalCount)"
              :colors="['#30DD92', '#FFA600', '#E53935', '#6F45FF', '#e5e7eb']"
              :active-label="afm.status"
              @select="onStatusSelect"
            />
          </div>
          <div class="legend-col">
            <span v-for="s in fs.registrations.statuses" :key="s.value" class="legend-pill">
              {{ s.value }} <strong>{{ fmt(s.totalCount) }}</strong>
            </span>
          </div>
        </div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Taux de check-in</div>
        <div class="kpi-value">{{ pct(fs.global.checkedInCount, fs.global.totalDelegatesCount) }}</div>
        <div class="kpi-sub"><strong>{{ fmt(fs.global.checkedInCount) }}</strong> / {{ fmt(fs.global.totalDelegatesCount) }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Connexion onboarding</div>
        <div class="kpi-value">{{ pct(fs.global.onboardingCount, registeredCount) }}</div>
        <div class="kpi-sub"><strong>{{ fmt(fs.global.onboardingCount) }}</strong> / {{ fmt(registeredCount) }} registered</div>
      </div>
      <div v-if="props.mobileAppId" class="kpi-card purple">
        <div class="kpi-label">App mobile (&lt; 3 mois)</div>
        <div class="kpi-value">{{ pct(fs.global.mobileAppCount, registeredCount) }}</div>
        <div class="kpi-sub"><strong>{{ fmt(fs.global.mobileAppCount) }}</strong> / {{ fmt(registeredCount) }} registered</div>
      </div>
    </div>

    <div class="charts-row" style="margin-top: 16px;">
      <div class="chart-card" v-if="onboardingDaily.length > 0">
        <h3>Evolution des connexions onboarding</h3>
        <LineChart
          :labels="onboardingLabels"
          :datasets="onboardingDatasets"
          :height="220"
        />
      </div>
      <div class="chart-card" v-if="mobileAppDaily.length > 0">
        <h3>Utilisation de l'application mobile</h3>
        <LineChart
          :labels="mobileAppLabels"
          :datasets="mobileAppDatasets"
          :height="220"
        />
      </div>
    </div>

    <div class="chart-card" v-if="fs.temporal.dailyRegistrations.length > 0" style="margin-top: 16px;">
      <h3>Evolution des inscriptions</h3>
      <LineChart
        :labels="allDailyLabels"
        :datasets="timelineDatasets"
        :height="220"
      />
    </div>

    <div class="charts-row" style="margin-top: 16px;">
      <div class="chart-card">
        <h3>Repartition par type d'inscription</h3>
        <HBarChart
          :labels="fs.registrations.types.slice(0, 8).map(t => t.value)"
          :data="fs.registrations.types.slice(0, 8).map(t => t.totalCount)"
          :active-label="afm.regType"
          @select="onTypeSelect"
        />
      </div>
      <div class="chart-card">
        <h3>Top 10 categories</h3>
        <HBarChart
          :labels="topCategories.map(c => c.value)"
          :data="topCategories.map(c => c.totalCount)"
          color="#2a6a8a"
          :active-label="afm.category"
          @select="onCategorySelect"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import FilterBanner from "../FilterBanner.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";

const props = defineProps({ stats: Object, delegates: Array, mobileAppId: String });

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates, () => props.mobileAppId);

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

const registeredCount = computed(() =>
  (props.delegates || []).filter((d) => d.status?.toLowerCase() === "registered").length
);

// --- Filtres ---
function onStatusSelect(label) {
  toggleFilter("status", label, (d) => d.status === label);
}
function onTypeSelect(label) {
  toggleFilter("regType", label, (d) => (d.registrations || []).some((r) => r.type === label));
}
function onCategorySelect(label) {
  toggleFilter("category", label, (d) =>
    (d.registrations || []).some((r) => (r.categories || []).includes(label))
  );
}

// --- Computed charts ---
const topCategories = computed(() => (fs.value?.registrations?.categories || []).slice(0, 10));

// --- Mobile app timeline ---
const mobileAppDaily = computed(() => fs.value?.mobileApp?.daily || []);
const mobileAppLabels = computed(() => mobileAppDaily.value.map((d) => d.date.slice(5)));
const mobileAppDatasets = computed(() => {
  const daily = mobileAppDaily.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Utilisateurs cumulés",
      data: cumulData,
      borderColor: "#6F45FF",
      backgroundColor: "rgba(111,69,255,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Utilisateurs/jour",
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(2, Math.min(8, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});

// Toutes les inscriptions depuis le premier delegate
const allDailyRegs = computed(() => fs.value?.temporal?.dailyRegistrations || []);
const allDailyLabels = computed(() => allDailyRegs.value.map((d) => d.date.slice(5)));

const timelineDatasets = computed(() => {
  const daily = allDailyRegs.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Inscriptions cumulées",
      data: cumulData,
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.08)",
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
      barThickness: Math.max(1, Math.min(6, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});

// --- Onboarding timeline ---
const onboardingDaily = computed(() => fs.value?.onboarding?.daily || []);
const onboardingLabels = computed(() => onboardingDaily.value.map((d) => d.date.slice(5)));
const onboardingDatasets = computed(() => {
  const daily = onboardingDaily.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Connexions cumulées",
      data: cumulData,
      borderColor: "#FFA600",
      backgroundColor: "rgba(255,166,0,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Connexions/jour",
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(2, Math.min(8, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});
</script>

<style scoped>
.kpi-row-all {
  display: flex; gap: 16px; margin-bottom: 0; align-items: stretch;
}
.kpi-row-all > .kpi-card { flex: 1; min-width: 0; }
.kpi-card-status {
  flex: 1.5; min-width: 0;
  background: #fff; border-radius: 10px; padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.kpi-card-status .kpi-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
.status-row { display: flex; align-items: center; gap: 12px; }
.legend-col { display: flex; flex-direction: column; gap: 3px; }
@media (max-width: 1024px) {
  .kpi-row-all { flex-wrap: wrap; }
  .kpi-row-all > .kpi-card, .kpi-card-status { flex-basis: calc(50% - 8px); }
}
@media (max-width: 640px) {
  .kpi-row-all { flex-direction: column; }
}
</style>
