<template>
  <div class="stats-app">
    <header class="stats-header">
      <div class="header-left">
        <h1>{{ eventName || "Statistiques" }}</h1>
        <span v-if="stats" class="delegate-count">{{ stats.global.totalDelegatesCount }} inscrits</span>
      </div>
      <div class="header-right">
        <button v-if="stats" class="btn-export" @click="handleExportPdf" :disabled="exporting || exportingPptx">
          <svg v-if="!exporting" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M8 10L5 7M8 10l3-3M2 12v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span v-if="exporting" class="spinner-small"></span>
          {{ exporting ? "Export en cours…" : "PDF" }}
        </button>
        <button v-if="stats" class="btn-export btn-export-pptx" @click="handleExportPptx" :disabled="exporting || exportingPptx">
          <span v-if="exportingPptx" class="spinner-small"></span>
          {{ exportingPptx ? "Export en cours…" : "PPTX" }}
        </button>
        <div v-if="stats" class="reload-wrapper">
          <button class="btn-reload" @click="confirmReload" :disabled="loading || refreshing">
            {{ refreshing ? "⏳" : "↻" }}
          </button>
          <span v-if="!refreshing" class="next-refresh">{{ nextRefreshLabel }}</span>
        </div>
      </div>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p class="loading-label">Chargement des données…</p>
      <div v-if="progress.total > 0" class="progress-wrapper">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <p class="progress-text">{{ progress.loaded }} / {{ progress.total }} inscrits (page {{ progress.page }})</p>
      </div>
    </div>

    <div v-else-if="error" class="error-state">
      <p>Erreur : {{ error }}</p>
      <button class="btn-export" @click="reload">Réessayer</button>
    </div>

    <template v-else-if="stats">
      <div v-if="refreshing" class="refresh-bar-wrapper">
        <div class="refresh-bar">
          <div class="refresh-bar-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <p class="refresh-bar-text">
          Rafraîchissement… {{ progress.loaded }} / {{ progress.total }} inscrits
          ({{ progressPercent }}%)
        </p>
      </div>

      <nav class="tabs-nav">
        <button v-for="tab in tabs" :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id">
          {{ tab.label }}
        </button>
      </nav>

      <div id="pdf-content" class="tab-content" :class="{ 'pdf-exporting': exporting || exportingPptx }">
        <template v-if="exporting || exportingPptx">
          <div v-for="tab in tabs" :key="'pdf-' + tab.id" :data-tab-id="tab.id">
            <div class="pdf-page-break"></div>
            <h2 class="pdf-tab-title">{{ tab.label }}</h2>
            <OverviewTab v-if="tab.id === 'overview'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
            <DemographicsTab v-if="tab.id === 'demographics'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
            <RegistrationsTab v-if="tab.id === 'registrations'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
            <TemporalTab v-if="tab.id === 'temporal'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
            <BadgesTab v-if="tab.id === 'badges'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
          </div>
        </template>
        <template v-else>
          <OverviewTab v-if="activeTab === 'overview'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
          <DemographicsTab v-if="activeTab === 'demographics'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
          <RegistrationsTab v-if="activeTab === 'registrations'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
          <TemporalTab v-if="activeTab === 'temporal'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
          <BadgesTab v-if="activeTab === 'badges'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" />
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useStatistics } from "../composables/useStatistics.js";
import { useExportPdf } from "../composables/useExportPdf.js";
import { useExportPptx } from "../composables/useExportPptx.js";
import OverviewTab from "../components/tabs/OverviewTab.vue";
import DemographicsTab from "../components/tabs/DemographicsTab.vue";
import RegistrationsTab from "../components/tabs/RegistrationsTab.vue";
import TemporalTab from "../components/tabs/TemporalTab.vue";
import BadgesTab from "../components/tabs/BadgesTab.vue";

const route = useRoute();
const eventId = route.params.eventId;
const { loading, refreshing, error, progress, stats, eventName, delegates, mobileAppId, reload, nextRefreshAt } = useStatistics(eventId);

// Countdown mis a jour toutes les 10 secondes
const now = ref(Date.now());
const countdownTimer = setInterval(() => { now.value = Date.now(); }, 10_000);
onUnmounted(() => clearInterval(countdownTimer));

const nextRefreshLabel = computed(() => {
  const remaining = Math.max(0, nextRefreshAt.value - now.value);
  const totalSec = Math.round(remaining / 10_000) * 10; // arrondi a 10s
  if (totalSec <= 0) return "Rafraîchissement…";
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `Refresh dans ${min}:${String(sec).padStart(2, "0")}`;
  return `Refresh dans ${sec}s`;
});
const { exporting, exportToPdf } = useExportPdf();
const { exportingPptx, exportToPptx } = useExportPptx();

const registeredCount = computed(() =>
  (delegates.value || []).filter((d) => d.status?.toLowerCase() === "registered").length
);

function confirmReload() {
  if (confirm("Ne me surcharge pas inutilement mes efforts...\nTu es certain de vouloir les toutes dernières données ?")) {
    reload();
  }
}

async function handleExportPdf() {
  await nextTick();
  await new Promise((r) => setTimeout(r, 500));
  const el = document.getElementById("pdf-content");
  const date = new Date().toISOString().split("T")[0];
  const name = (eventName.value || eventId).replace(/[^a-zA-Z0-9-_]/g, "_");
  await exportToPdf(el, `stats-${name}-${date}.pdf`);
}

async function handleExportPptx() {
  await nextTick();
  await new Promise((r) => setTimeout(r, 500));
  const el = document.getElementById("pdf-content");
  await exportToPptx(el, tabs, stats.value, registeredCount.value, eventName.value);
}

const progressPercent = computed(() =>
  progress.value.total > 0 ? Math.round((progress.value.loaded / progress.value.total) * 100) : 0
);
const activeTab = ref("overview");
const tabs = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "demographics", label: "Démographie" },
  { id: "registrations", label: "Inscriptions" },
  { id: "temporal", label: "Dynamique" },
  { id: "badges", label: "Badges & Check-in" },
];
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6fa; color: var(--text); }

.stats-app { max-width: 1200px; margin: 0 auto; padding: 24px; }

.stats-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--border);
}
.header-left h1 { font-size: 22px; color: var(--primary); }
.delegate-count { font-size: 13px; color: var(--text-secondary); margin-left: 12px; }
.next-refresh {
  font-size: 10px; color: var(--text-muted); white-space: nowrap;
}
.header-right { display: flex; gap: 8px; align-items: flex-start; }
.reload-wrapper { display: flex; flex-direction: column; align-items: center; gap: 4px; }

.btn-export {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; background: var(--primary); color: #fff;
  border: none; border-radius: 6px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background .2s;
}
.btn-export:hover { background: var(--primary-light); }
.btn-export-pptx { background: #6F45FF; }
.btn-export-pptx:hover { background: #5a35e0; }
.btn-reload { padding: 8px 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 16px; }
.btn-reload:disabled { opacity: .5; }

.tabs-nav {
  display: flex; gap: 4px; margin-bottom: 20px;
  border-bottom: 2px solid var(--border); padding-bottom: 0;
}
.tab-btn {
  padding: 10px 20px; border: none; background: none;
  font-size: 13px; font-weight: 500; color: var(--text-secondary);
  cursor: pointer; border-bottom: 2px solid transparent;
  margin-bottom: -2px; transition: all .2s;
}
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab-btn:hover:not(.active) { color: var(--text); }

.loading-state, .error-state { text-align: center; padding: 80px 20px; }
.loading-label { font-size: 15px; color: var(--text); margin-bottom: 16px; }
.progress-wrapper { max-width: 400px; margin: 0 auto; }
.progress-bar {
  width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;
}
.progress-fill {
  height: 100%; background: var(--primary); border-radius: 4px;
  transition: width .3s ease;
}
.progress-text { font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
.spinner {
  width: 36px; height: 36px; border: 3px solid var(--border);
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin .8s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Shared card styles */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.kpi-card {
  background: #fff; border-radius: 10px; padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06); border-left: 4px solid var(--border);
}
.kpi-card.blue { border-left-color: var(--primary); }
.kpi-card.green { border-left-color: #30DD92; }
.kpi-card.orange { border-left-color: #FFA600; }
.kpi-card.red { border-left-color: #E53935; }
.kpi-card.purple { border-left-color: var(--purple); }
.kpi-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
.kpi-value { font-size: 28px; font-weight: 700; color: var(--text); }
.kpi-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

.charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.chart-card {
  background: #fff; border-radius: 10px; padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.chart-card h3 { font-size: 14px; color: var(--text); margin-bottom: 12px; }
.chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.chart-header h3 { margin-bottom: 0; }

.legend-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; justify-content: center; }
.legend-pill {
  font-size: 11px; padding: 2px 8px; background: #f3f4f6;
  border-radius: 10px; color: var(--text);
}

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 8px 12px; background: #f9fafb; color: var(--text-secondary); font-weight: 500; border-bottom: 1px solid var(--border); }
.data-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
.data-table tr:hover td { background: #f9fafb; }

/* Filter banner */
.filter-banner {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px; margin-bottom: 16px;
  background: #eef6ff; border: 1px solid #bdd8f1; border-radius: 8px;
  font-size: 12px; color: var(--text);
}
.filter-info { font-weight: 600; color: var(--primary); white-space: nowrap; }
.filter-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; background: var(--primary); color: #fff;
  border-radius: 12px; font-size: 11px; font-weight: 500;
  cursor: pointer; transition: background .15s;
}
.filter-tag:hover { background: var(--primary-light); }
.filter-clear {
  margin-left: auto; padding: 3px 10px;
  background: none; border: 1px solid #bdd8f1; border-radius: 4px;
  font-size: 11px; color: var(--text-secondary); cursor: pointer;
}
.filter-clear:hover { background: #fff; }

/* Refresh bar */
.refresh-bar-wrapper {
  margin-bottom: 16px; padding: 12px 16px;
  background: #fff; border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.refresh-bar {
  width: 100%; height: 6px; background: var(--border);
  border-radius: 3px; overflow: hidden;
}
.refresh-bar-fill {
  height: 100%; background: var(--accent, #30DD92); border-radius: 3px;
  transition: width .3s ease;
}
.refresh-bar-text {
  font-size: 12px; color: var(--text-secondary); margin-top: 6px; text-align: center;
}

/* Export PDF */
.btn-export:disabled { opacity: .7; cursor: wait; }
.spinner-small {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
  border-radius: 50%; animation: spin .6s linear infinite;
}
.pdf-exporting .pdf-tab-title {
  font-size: 18px; font-weight: 600; color: var(--primary);
  margin-bottom: 16px; padding-bottom: 8px;
  border-bottom: 2px solid var(--primary);
}
.pdf-exporting .pdf-page-break:first-child { display: none; }
.pdf-page-break { page-break-before: always; margin-top: 8px; }

@media (max-width: 768px) {
  .charts-row { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: 1fr 1fr; }
  .tabs-nav { overflow-x: auto; }
}
</style>
