<template>
  <div v-if="stats">
    <div v-if="hasCheckinData" class="live-banner">
      Check-in en cours — {{ fmt(stats.global.checkedInCount) }} / {{ fmt(stats.global.totalDelegatesCount) }} ({{ checkinPct }})
    </div>

    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="kpi-label">Checked-in</div>
        <div class="kpi-value">{{ fmt(stats.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ checkinPct }} du total</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Restants</div>
        <div class="kpi-value">{{ fmt(remaining) }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">RGPD signés</div>
        <div class="kpi-value">{{ fmt(stats.global.gdprSignedCount) }}</div>
        <div class="kpi-sub">{{ pct(stats.global.gdprSignedCount, stats.global.totalDelegatesCount) }} des inscrits</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Comptes créés</div>
        <div class="kpi-value">{{ fmt(stats.global.accountsCount) }}</div>
        <div class="kpi-sub">{{ pct(stats.global.accountsCount, stats.global.totalDelegatesCount) }} des inscrits</div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom: 16px;">
      <h3>Progression du check-in</h3>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: checkinPct }"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-top: 4px;">
        <span>0</span>
        <span>{{ fmt(stats.global.totalDelegatesCount) }}</span>
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
            :data="[stats.global.gdprSignedCount, stats.global.totalDelegatesCount - stats.global.gdprSignedCount]"
            :colors="['#30DD92', '#e5e7eb']"
          />
        </div>
      </div>
      <div class="chart-card">
        <h3>Onboarding / Comptes</h3>
        <div style="max-width: 200px; margin: 0 auto;">
          <DoughnutChart
            :labels="['Connecté onboarding', 'Compte créé (pas connecté)', 'Aucun compte']"
            :data="[
              stats.global.onboardingCount,
              stats.global.accountsCount - stats.global.onboardingCount,
              stats.global.totalDelegatesCount - stats.global.accountsCount
            ]"
            :colors="['#30DD92', '#FFA600', '#e5e7eb']"
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

const props = defineProps({ stats: Object });

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

const remaining = computed(() => (props.stats?.global?.totalDelegatesCount || 0) - (props.stats?.global?.checkedInCount || 0));
const checkinPct = computed(() => pct(props.stats?.global?.checkedInCount, props.stats?.global?.totalDelegatesCount));
const hasCheckinData = computed(() => (props.stats?.global?.checkedInCount || 0) > 0);

const hourlyLabels = computed(() => {
  const h = props.stats?.checkinFlow?.hourly || {};
  return Object.keys(h).sort();
});
const hourlyDatasets = computed(() => {
  const h = props.stats?.checkinFlow?.hourly || {};
  const sorted = Object.keys(h).sort();
  const data = sorted.map((k) => h[k]);
  let cumul = 0;
  const cumulData = data.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Check-in cumulés",
      data: cumulData,
      borderColor: "#0F2D69",
      backgroundColor: "rgba(15,45,105,0.08)",
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
  const d = props.stats?.checkinFlow?.byDay || {};
  return Object.keys(d).sort();
});
const checkinByDayData = computed(() => {
  const d = props.stats?.checkinFlow?.byDay || {};
  return Object.keys(d).sort().map((k) => d[k]);
});
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
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
