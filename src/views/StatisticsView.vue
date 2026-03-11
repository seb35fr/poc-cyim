<template>
  <div class="stats-app">
    <header class="stats-header">
      <div class="header-left">
        <h1>{{ eventName || "Statistiques" }}</h1>
        <span v-if="stats" class="delegate-count">{{ stats.global.totalDelegatesCount }} inscrits</span>
      </div>
      <div class="header-right">
        <button v-if="stats" class="btn-export" @click="exportPdf">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M8 10L5 7M8 10l3-3M2 12v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Export PDF
        </button>
        <button class="btn-reload" @click="reload" :disabled="loading">↻</button>
      </div>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Chargement des données… {{ progress }}</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Erreur : {{ error }}</p>
      <button class="btn-export" @click="reload">Réessayer</button>
    </div>

    <template v-else-if="stats">
      <nav class="tabs-nav">
        <button v-for="tab in tabs" :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id">
          {{ tab.label }}
        </button>
      </nav>

      <div id="pdf-content" class="tab-content">
        <OverviewTab v-if="activeTab === 'overview'" :stats="stats" />
        <DemographicsTab v-if="activeTab === 'demographics'" :stats="stats" />
        <RegistrationsTab v-if="activeTab === 'registrations'" :stats="stats" />
        <TemporalTab v-if="activeTab === 'temporal'" :stats="stats" />
        <BadgesTab v-if="activeTab === 'badges'" :stats="stats" />
        <DayOfTab v-if="activeTab === 'dayof'" :stats="stats" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRoute } from "vue-router";
import { useStatistics } from "../composables/useStatistics.js";
import { useExportPdf } from "../composables/useExportPdf.js";
import OverviewTab from "../components/tabs/OverviewTab.vue";
import DemographicsTab from "../components/tabs/DemographicsTab.vue";
import RegistrationsTab from "../components/tabs/RegistrationsTab.vue";
import TemporalTab from "../components/tabs/TemporalTab.vue";
import DayOfTab from "../components/tabs/DayOfTab.vue";
import BadgesTab from "../components/tabs/BadgesTab.vue";

const route = useRoute();
const eventId = route.params.eventId;
const { loading, error, progress, stats, eventName, reload } = useStatistics(eventId);
const { exportPdf } = useExportPdf();

const activeTab = ref("overview");
const tabs = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "demographics", label: "Démographie" },
  { id: "registrations", label: "Inscriptions" },
  { id: "temporal", label: "Dynamique" },
  { id: "badges", label: "Badges" },
  { id: "dayof", label: "Jour J" },
];
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6fa; color: #1a1a2e; }

.stats-app { max-width: 1200px; margin: 0 auto; padding: 24px; }

.stats-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb;
}
.header-left h1 { font-size: 22px; color: #0F2D69; }
.delegate-count { font-size: 13px; color: #6b7280; margin-left: 12px; }
.header-right { display: flex; gap: 8px; }

.btn-export {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; background: #0F2D69; color: #fff;
  border: none; border-radius: 6px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background .2s;
}
.btn-export:hover { background: #1a3f8a; }
.btn-reload { padding: 8px 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 16px; }
.btn-reload:disabled { opacity: .5; }

.tabs-nav {
  display: flex; gap: 4px; margin-bottom: 20px;
  border-bottom: 2px solid #e5e7eb; padding-bottom: 0;
}
.tab-btn {
  padding: 10px 20px; border: none; background: none;
  font-size: 13px; font-weight: 500; color: #6b7280;
  cursor: pointer; border-bottom: 2px solid transparent;
  margin-bottom: -2px; transition: all .2s;
}
.tab-btn.active { color: #0F2D69; border-bottom-color: #0F2D69; }
.tab-btn:hover:not(.active) { color: #374151; }

.loading-state, .error-state { text-align: center; padding: 80px 20px; }
.spinner {
  width: 36px; height: 36px; border: 3px solid #e5e7eb;
  border-top-color: #0F2D69; border-radius: 50%;
  animation: spin .8s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Shared card styles */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.kpi-card {
  background: #fff; border-radius: 10px; padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06); border-left: 4px solid #e5e7eb;
}
.kpi-card.blue { border-left-color: #0F2D69; }
.kpi-card.green { border-left-color: #30DD92; }
.kpi-card.orange { border-left-color: #FFA600; }
.kpi-card.red { border-left-color: #E53935; }
.kpi-card.purple { border-left-color: #8b5cf6; }
.kpi-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
.kpi-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
.kpi-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }

.charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.chart-card {
  background: #fff; border-radius: 10px; padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.chart-card h3 { font-size: 14px; color: #374151; margin-bottom: 12px; }

.legend-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; justify-content: center; }
.legend-pill {
  font-size: 11px; padding: 2px 8px; background: #f3f4f6;
  border-radius: 10px; color: #374151;
}

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 8px 12px; background: #f9fafb; color: #6b7280; font-weight: 500; border-bottom: 1px solid #e5e7eb; }
.data-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
.data-table tr:hover td { background: #f9fafb; }

@media (max-width: 768px) {
  .charts-row { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: 1fr 1fr; }
  .tabs-nav { overflow-x: auto; }
}
</style>
