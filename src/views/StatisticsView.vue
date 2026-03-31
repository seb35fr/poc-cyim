<template>
  <div class="layout" :class="{ 'pdf-mode': exporting || exportingPptx }">
    <!-- Sidebar -->
    <aside v-if="stats && !exporting && !exportingPptx" class="sidebar">
      <div class="sidebar-brand">
        <h1 class="sidebar-title">{{ eventName || "Stats" }}</h1>
        <span class="sidebar-count">{{ stats.global.totalDelegatesCount }} inscrits</span>
      </div>

      <nav class="sidebar-nav">
        <button v-for="tab in tabs" :key="tab.id"
          :class="['nav-item', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id">
          <span class="nav-icon" v-html="tab.icon"></span>
          <span class="nav-label">{{ tab.label }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-actions">
          <button class="btn-side" @click="handleExportPdf" :disabled="exporting || exportingPptx">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M8 10L5 7M8 10l3-3M2 12v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span v-if="exporting" class="spinner-small"></span>
            {{ exporting ? "..." : "PDF" }}
          </button>
          <button class="btn-side btn-side-purple" @click="handleExportPptx" :disabled="exporting || exportingPptx">
            <span v-if="exportingPptx" class="spinner-small"></span>
            {{ exportingPptx ? "..." : "PPTX" }}
          </button>
        </div>
        <div class="sidebar-refresh">
          <button class="btn-side btn-side-ghost" @click="confirmReload" :disabled="loading || refreshing">
            {{ refreshing ? "⏳ Refresh..." : "↻ Rafraichir" }}
          </button>
          <span v-if="!refreshing" class="refresh-timer">{{ nextRefreshLabel }}</span>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p class="loading-label">Chargement des donnees...</p>
        <div v-if="progress.total > 0" class="progress-wrapper">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <p class="progress-text">{{ progress.loaded }} / {{ progress.total }} inscrits (page {{ progress.page }})</p>
        </div>
      </div>

      <div v-else-if="error" class="error-state">
        <p>Erreur : {{ error }}</p>
        <button class="btn-side" @click="reload">Reessayer</button>
      </div>

      <template v-else-if="stats">
        <div v-if="refreshing" class="refresh-bar-wrapper">
          <div class="refresh-bar">
            <div class="refresh-bar-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <p class="refresh-bar-text">
            Rafraichissement... {{ progress.loaded }} / {{ progress.total }}
            ({{ progressPercent }}%)
          </p>
        </div>

        <div id="pdf-content" class="tab-content" :class="{ 'pdf-exporting': exporting || exportingPptx }">
          <template v-if="exporting || exportingPptx">
            <div v-for="tab in tabs" :key="'pdf-' + tab.id" :data-tab-id="tab.id">
              <div class="pdf-page-break"></div>
              <h2 class="pdf-tab-title">{{ tab.label }}</h2>
              <OverviewTab v-if="tab.id === 'overview'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <DemographicsTab v-if="tab.id === 'demographics'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <RegistrationsTab v-if="tab.id === 'registrations'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <TemporalTab v-if="tab.id === 'temporal'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <BadgesTab v-if="tab.id === 'badges'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <DataTab v-if="tab.id === 'data'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            </div>
          </template>
          <template v-else>
            <OverviewTab v-if="activeTab === 'overview'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <DemographicsTab v-if="activeTab === 'demographics'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <RegistrationsTab v-if="activeTab === 'registrations'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <TemporalTab v-if="activeTab === 'temporal'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <BadgesTab v-if="activeTab === 'badges'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <DataTab v-if="activeTab === 'data'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
          </template>
        </div>
      </template>
    </main>
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
import DataTab from "../components/tabs/DataTab.vue";

const route = useRoute();
const eventId = route.params.eventId;
const { loading, refreshing, error, progress, stats, eventName, delegates, mobileAppId, reload, nextRefreshAt } = useStatistics(eventId);

const now = ref(Date.now());
const countdownTimer = setInterval(() => { now.value = Date.now(); }, 10_000);
onUnmounted(() => clearInterval(countdownTimer));

const nextRefreshLabel = computed(() => {
  const remaining = Math.max(0, nextRefreshAt.value - now.value);
  const totalSec = Math.round(remaining / 10_000) * 10;
  if (totalSec <= 0) return "Refresh imminent...";
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
});
const { exporting, exportToPdf } = useExportPdf();
const { exportingPptx, exportToPptx } = useExportPptx();

const registeredCount = computed(() =>
  (delegates.value || []).filter((d) => d.status?.toLowerCase() === "registered").length
);

function confirmReload() {
  if (confirm("Ne me surcharge pas inutilement mes efforts...\nTu es certain de vouloir les toutes dernieres donnees ?")) {
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
  { id: "overview", label: "Vue d'ensemble", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
  { id: "demographics", label: "Demographie", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
  { id: "registrations", label: "Inscriptions", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  { id: "temporal", label: "Dynamique", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
  { id: "badges", label: "Badges & Check-in", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' },
  { id: "data", label: "Donnees", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' },
];
</script>

<style>
/* ═══════════════════════════════════════════
   LAYOUT — sidebar + main
   ═══════════════════════════════════════════ */
.layout {
  display: flex; min-height: 100vh;
}
.layout.pdf-mode { display: block; }

/* ── Sidebar ── */
.sidebar {
  position: sticky; top: 0; height: 100vh;
  width: 220px; min-width: 220px;
  background: var(--primary);
  color: #fff;
  display: flex; flex-direction: column;
  padding: 0; z-index: 30;
  overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent;
}
.sidebar-brand {
  padding: 20px 18px 16px;
  border-bottom: 1px solid rgba(255,255,255,.1);
}
.sidebar-title {
  font-size: 15px; font-weight: 600; line-height: 1.3;
  color: #fff; letter-spacing: -.2px;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.sidebar-count {
  display: inline-block; margin-top: 6px;
  font-size: 11px; font-weight: 500;
  background: rgba(255,255,255,.15); padding: 2px 10px;
  border-radius: 10px; color: rgba(255,255,255,.85);
}

/* ── Nav items ── */
.sidebar-nav { flex: 1; padding: 12px 10px; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 9px 12px;
  border: none; background: none; color: rgba(255,255,255,.6);
  font-size: 12px; font-weight: 500;
  border-radius: 8px; cursor: pointer;
  transition: all .15s; text-align: left;
}
.nav-item:hover { background: rgba(255,255,255,.08); color: rgba(255,255,255,.9); }
.nav-item.active {
  background: rgba(255,255,255,.15); color: #fff; font-weight: 600;
}
.nav-icon {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex-shrink: 0; opacity: .7;
}
.nav-item.active .nav-icon { opacity: 1; }
.nav-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Sidebar footer ── */
.sidebar-footer {
  padding: 12px 10px 16px;
  border-top: 1px solid rgba(255,255,255,.1);
  display: flex; flex-direction: column; gap: 8px;
}
.sidebar-actions { display: flex; gap: 6px; }
.btn-side {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 7px 10px; border: none;
  background: rgba(255,255,255,.12); color: #fff;
  border-radius: 6px; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: background .15s;
}
.btn-side:hover { background: rgba(255,255,255,.2); }
.btn-side:disabled { opacity: .4; cursor: wait; }
.btn-side-purple { background: var(--purple); }
.btn-side-purple:hover { background: #5a35e0; }
.btn-side-ghost {
  background: none; border: 1px solid rgba(255,255,255,.2);
  font-weight: 500; font-size: 11px;
}
.btn-side-ghost:hover { background: rgba(255,255,255,.08); }
.sidebar-refresh { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.refresh-timer { font-size: 9px; color: rgba(255,255,255,.4); }

/* ── Main content ── */
.main-content {
  flex: 1; min-width: 0;
  padding: 20px 28px; overflow-x: hidden;
}

/* ── Loading / Error ── */
.loading-state, .error-state { text-align: center; padding: 80px 20px; }
.loading-label { font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; }
.progress-wrapper { max-width: 360px; margin: 0 auto; }
.progress-bar {
  width: 100%; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
}
.progress-fill {
  height: 100%; background: var(--primary); border-radius: 3px;
  transition: width .3s ease;
}
.progress-text { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.spinner {
  width: 32px; height: 32px; border: 3px solid var(--border);
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin .8s linear infinite; margin: 0 auto 12px;
}
.spinner-small {
  display: inline-block; width: 10px; height: 10px;
  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
  border-radius: 50%; animation: spin .6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Refresh bar ── */
.refresh-bar-wrapper {
  margin-bottom: 16px; padding: 10px 14px;
  background: var(--card); border-radius: 8px; box-shadow: var(--shadow);
}
.refresh-bar {
  width: 100%; height: 4px; background: var(--border);
  border-radius: 2px; overflow: hidden;
}
.refresh-bar-fill {
  height: 100%; background: var(--accent); border-radius: 2px;
  transition: width .3s ease;
}
.refresh-bar-text {
  font-size: 11px; color: var(--text-muted); margin-top: 6px; text-align: center;
}

/* ═══════════════════════════════════════════
   SHARED COMPONENT STYLES (all tabs)
   ═══════════════════════════════════════════ */

/* ── KPI Cards ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px; margin-bottom: 16px;
}
.kpi-card {
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  box-shadow: var(--shadow); border-left: 3px solid var(--border);
}
.kpi-card.blue { border-left-color: var(--primary); }
.kpi-card.green { border-left-color: var(--accent); }
.kpi-card.orange { border-left-color: var(--warning); }
.kpi-card.red { border-left-color: var(--danger); }
.kpi-card.purple { border-left-color: var(--purple); }
.kpi-label {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .5px; margin-bottom: 2px; font-weight: 600;
}
.kpi-value { font-size: 24px; font-weight: 700; color: var(--text); line-height: 1.2; }
.kpi-sub { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

/* ── Chart Cards ── */
.charts-row {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px; margin-bottom: 10px;
}
.chart-card {
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  box-shadow: var(--shadow); margin-bottom: 10px;
}
.charts-row > .chart-card { margin-bottom: 0; }
.chart-card h3 {
  font-size: 12px; color: var(--text); margin-bottom: 8px;
  font-weight: 600; letter-spacing: -.1px;
}
.chart-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.chart-header h3 { margin-bottom: 0; }

/* ── Legends ── */
.legend-row {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-top: 6px; justify-content: center;
}
.legend-pill {
  font-size: 10px; padding: 1px 7px; background: #f3f4f6;
  border-radius: 8px; color: var(--text-secondary);
}

/* ── Data tables (used in demographics, registrations etc.) ── */
.data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.data-table th {
  text-align: left; padding: 5px 8px; background: #f5f6f8;
  color: var(--text-muted); font-weight: 700; font-size: 10px;
  border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: .3px;
}
.data-table td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
.data-table tr:hover td { background: #f4f7fa; }

/* ── Filter banner ── */
.filter-banner {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 7px 12px; margin-bottom: 10px;
  background: #eef6ff; border: 1px solid #bdd8f1; border-radius: 8px;
  font-size: 11px; color: var(--text);
}
.filter-info { font-weight: 600; color: var(--primary); white-space: nowrap; }
.filter-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-tag {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; background: var(--primary); color: #fff;
  border-radius: 10px; font-size: 10px; font-weight: 500;
  cursor: pointer; transition: background .15s;
}
.filter-tag:hover { background: var(--primary-light); }
.filter-clear {
  margin-left: auto; padding: 2px 8px;
  background: none; border: 1px solid #bdd8f1; border-radius: 4px;
  font-size: 10px; color: var(--text-secondary); cursor: pointer;
}
.filter-clear:hover { background: #fff; }

/* ── Period selectors (temporal/badges) ── */
.period-selector {
  display: flex; gap: 3px;
}
.period-selector button {
  font-size: 10px; padding: 3px 10px;
  border: 1px solid var(--border); border-radius: 5px;
  background: var(--card); color: var(--text-secondary);
  cursor: pointer; font-weight: 500; transition: all .12s;
}
.period-selector button.active,
.period-selector button:hover {
  background: var(--primary); color: #fff; border-color: var(--primary);
}

/* ── Empty states ── */
.empty-msg {
  text-align: center; padding: 16px; font-size: 12px;
  color: var(--text-muted); font-style: italic;
}

/* ── PDF Export ── */
.pdf-exporting .pdf-tab-title {
  font-size: 18px; font-weight: 600; color: var(--primary);
  margin-bottom: 16px; padding-bottom: 8px;
  border-bottom: 2px solid var(--primary);
}
.pdf-exporting .pdf-page-break:first-child { display: none; }
.pdf-page-break { page-break-before: always; margin-top: 8px; }
.pdf-mode .main-content { padding: 20px; }

/* ═══════════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════════ */
@media (max-width: 900px) {
  .layout { flex-direction: column; }
  .sidebar {
    position: relative; width: 100%; min-width: 100%; height: auto;
    flex-direction: row; flex-wrap: wrap; align-items: center;
    padding: 10px 16px;
  }
  .sidebar-brand { padding: 0; border-bottom: none; }
  .sidebar-title { font-size: 14px; }
  .sidebar-count { margin-top: 0; margin-left: 8px; }
  .sidebar-nav {
    display: flex; flex-direction: row; gap: 2px;
    padding: 8px 0 0; overflow-x: auto; width: 100%;
    scrollbar-width: none;
  }
  .sidebar-nav::-webkit-scrollbar { display: none; }
  .nav-item { white-space: nowrap; padding: 6px 10px; font-size: 11px; }
  .nav-icon { display: none; }
  .sidebar-footer {
    flex-direction: row; gap: 6px; padding: 8px 0 0;
    border-top: none; width: 100%;
  }
  .sidebar-refresh { flex-direction: row; gap: 6px; }
  .main-content { padding: 16px; }
  .charts-row { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: 1fr 1fr; }
}
</style>
