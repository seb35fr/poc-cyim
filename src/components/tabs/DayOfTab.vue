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

    <div v-if="hasCheckinData" class="live-banner">
      Check-in en cours — {{ fmt(fs.global.checkedInCount) }} / {{ fmt(fs.global.totalDelegatesCount) }} ({{ checkinPct }})
    </div>

    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="kpi-label">Checked-in</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ checkinPct }} du total</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Restants (validés)</div>
        <div class="kpi-value">{{ fmt(confirmedRemaining) }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">RGPD signés</div>
        <div class="kpi-value">{{ fmt(fs.global.gdprSignedCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.gdprSignedCount, fs.global.totalDelegatesCount) }} des inscrits</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Comptes créés</div>
        <div class="kpi-value">{{ fmt(fs.global.accountsCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.accountsCount, fs.global.totalDelegatesCount) }} des inscrits</div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom: 16px;">
      <h3>Progression du check-in</h3>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: checkinPct }"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #646464; margin-top: 4px;">
        <span>0</span>
        <span>{{ fmt(fs.global.totalDelegatesCount) }}</span>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Flux de check-in par heure</h3>
        <LineChart
          v-if="hourlyLabels.length > 0"
          :labels="hourlyLabels"
          :datasets="hourlyDatasets"
          :height="220"
        />
        <p v-else class="empty-msg">Aucun check-in enregistré</p>
      </div>
      <div class="chart-card">
        <h3>Check-in par jour</h3>
        <HBarChart
          v-if="checkinByDayLabels.length > 0"
          :labels="checkinByDayLabels"
          :data="checkinByDayData"
          color="#30DD92"
          :height="200"
          :active-label="afm.checkinDay"
          @select="onCheckinDaySelect"
        />
        <p v-else class="empty-msg">Aucun check-in enregistré</p>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Conformité RGPD</h3>
        <div style="max-width: 200px; margin: 0 auto;">
          <DoughnutChart
            :labels="['RGPD signé', 'Non signé']"
            :data="[fs.global.gdprSignedCount, fs.global.totalDelegatesCount - fs.global.gdprSignedCount]"
            :colors="['#30DD92', '#e5e7eb']"
            :active-label="afm.gdpr"
            @select="onGdprSelect"
          />
        </div>
      </div>
      <div class="chart-card">
        <h3>Onboarding / Comptes</h3>
        <div style="max-width: 200px; margin: 0 auto;">
          <DoughnutChart
            :labels="onboardingLabels"
            :data="onboardingData"
            :colors="['#30DD92', '#FFA600', '#e5e7eb']"
            :active-label="afm.onboarding"
            @select="onOnboardingSelect"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import LineChart from "../charts/LineChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import FilterBanner from "../FilterBanner.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";

const props = defineProps({ stats: Object, delegates: Array });

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates);

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

// --- Filtres ---
function onCheckinDaySelect(label) {
  // label est au format "MM-DD", on cherche la date complète
  const byDay = fs.value?.checkinFlow?.byDay || {};
  const fullDate = Object.keys(byDay).find((d) => d.endsWith(label));
  if (!fullDate) return;
  toggleFilter("checkinDay", label, (d) =>
    d.checkedInDate && d.checkedInDate.startsWith(fullDate)
  );
}
function onGdprSelect(label) {
  toggleFilter("gdpr", label, (d) =>
    label === "RGPD signé" ? !!d.gdpr : !d.gdpr
  );
}
function onOnboardingSelect(label) {
  toggleFilter("onboarding", label, (d) => {
    if (label === "Connecté onboarding") return !!d.firstOnboardingConnection;
    if (label === "Compte créé (pas connecté)") return !!d.contactId && !d.firstOnboardingConnection;
    return !d.contactId;
  });
}

// --- Computed ---
// Restants = delegates VALIDATED non checked-in
const confirmedRemaining = computed(() => {
  const delegates = props.delegates || [];
  return delegates.filter(
    (d) => d.status?.toLowerCase() === "validated" && !d.checkedInDate
  ).length;
});

const checkinPct = computed(() => pct(fs.value?.global?.checkedInCount, fs.value?.global?.totalDelegatesCount));
const hasCheckinData = computed(() => (fs.value?.global?.checkedInCount || 0) > 0);

const hourlyLabels = computed(() => {
  const h = fs.value?.checkinFlow?.hourly || {};
  return Object.keys(h).sort();
});
const hourlyDatasets = computed(() => {
  const h = fs.value?.checkinFlow?.hourly || {};
  const sorted = Object.keys(h).sort();
  const data = sorted.map((k) => h[k]);
  let cumul = 0;
  const cumulData = data.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Check-in cumulés",
      data: cumulData,
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2,
    },
    {
      label: "Check-in / heure",
      data,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.5)",
      type: "bar",
      borderRadius: 3,
      barThickness: 16,
      yAxisID: "y1",
    },
  ];
});

const checkinByDayLabels = computed(() => {
  const d = fs.value?.checkinFlow?.byDay || {};
  return Object.keys(d).sort().map((k) => k.slice(5));
});
const checkinByDayData = computed(() => {
  const d = fs.value?.checkinFlow?.byDay || {};
  return Object.keys(d).sort().map((k) => d[k]);
});

const onboardingLabels = ["Connecté onboarding", "Compte créé (pas connecté)", "Aucun compte"];
const onboardingData = computed(() => [
  fs.value.global.onboardingCount,
  fs.value.global.accountsCount - fs.value.global.onboardingCount,
  fs.value.global.totalDelegatesCount - fs.value.global.accountsCount,
]);
</script>

<style scoped>
.live-banner {
  background: linear-gradient(135deg, #30DD92, #22c55e);
  color: #fff; padding: 12px 20px; border-radius: 8px;
  font-weight: 600; font-size: 14px; margin-bottom: 16px;
  text-align: center;
}
.progress-bar-container {
  background: #e5e7eb; border-radius: 8px; height: 24px; overflow: hidden;
}
.progress-bar {
  background: linear-gradient(90deg, #30DD92, #22c55e);
  height: 100%; border-radius: 8px; transition: width .5s ease;
  min-width: 2px;
}
.empty-msg { text-align: center; color: #646464; padding: 20px; font-size: 13px; }
</style>
