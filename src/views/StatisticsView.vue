<template>
  <div class="layout" :class="{ 'pdf-mode': exporting || exportingPptx }">
    <!-- Sidebar -->
    <aside v-if="stats && !exporting && !exportingPptx" class="sidebar">
      <div class="sidebar-brand">
        <h1 class="sidebar-title">{{ eventName || "Stats" }}</h1>
        <span class="sidebar-count">{{ stats.global.totalDelegatesCount }} inscrits</span>
      </div>

      <nav class="sidebar-nav">
        <template v-for="node in tabs" :key="node.id">
          <!-- Leaf : tab navigable -->
          <button v-if="!node.children"
            :class="['nav-item', { active: activeTab === node.id }]"
            @click="activeTab = node.id">
            <span class="nav-icon" v-html="node.icon"></span>
            <span class="nav-label">{{ node.label }}</span>
          </button>
          <!-- Group : header pliable + enfants indentes -->
          <template v-else>
            <button
              type="button"
              :class="['nav-group-header', { 'is-active': isGroupActive(node), 'is-collapsed': !isExpanded(node.id) }]"
              @click="toggleGroup(node.id)"
            >
              <span class="nav-icon" v-html="node.icon"></span>
              <span class="nav-label">{{ node.label }}</span>
              <span class="nav-chevron" aria-hidden="true">▾</span>
            </button>
            <template v-if="isExpanded(node.id)">
              <button v-for="child in node.children" :key="child.id"
                :class="['nav-item', 'nav-child', { active: activeTab === child.id }]"
                @click="activeTab = child.id">
                <span class="nav-icon" v-html="child.icon"></span>
                <span class="nav-label">{{ child.label }}</span>
              </button>
            </template>
          </template>
        </template>
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
            <div v-for="tab in exportTabs" :key="'pdf-' + tab.id" :data-tab-id="tab.id">
              <div class="pdf-page-break"></div>
              <h2 class="pdf-tab-title">{{ tab.label }}</h2>
              <OverviewTab v-if="tab.id === 'overview'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" :compare-delegates="compareDelegates" :compare-event-name="compareEventName" />
              <DemographicsTab v-if="tab.id === 'demographics'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <RegistrationsTab v-if="tab.id === 'registrations'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <TemporalTab v-if="tab.id === 'temporal'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <BadgesTab v-if="tab.id === 'badges'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <ScansTab v-if="tab.id === 'scans'" />
              <LiveTab v-if="tab.id === 'live'" :delegates="delegates" />
              <LiveComparisonTab
                v-if="tab.id === 'liveCompare'"
                :delegates="delegates"
                :compare-delegates="compareDelegates"
                :event-name="eventName"
                :compare-event-name="compareEventName"
              />
              <ReplayTab v-if="tab.id === 'replay'" :delegates="delegates" />
              <ReplayComparisonTab
                v-if="tab.id === 'replayCompare'"
                :delegates="delegates"
                :compare-delegates="compareDelegates"
                :event-name="eventName"
                :compare-event-name="compareEventName"
              />
              <DataTab v-if="tab.id === 'data'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
              <ComparisonTab
                v-if="tab.id === 'comparison'"
                :stats="stats"
                :delegates="delegates"
                :event-name="eventName"
                :compare-stats="compareStats"
                :compare-delegates="compareDelegates"
                :compare-event-name="compareEventName"
                :compare-loading="false"
                :compare-error="null"
                :compare-progress="{ loaded: 0, total: 0, page: 0 }"
              />
            </div>
          </template>
          <template v-else>
            <OverviewTab v-if="activeTab === 'overview'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" :compare-delegates="compareDelegates" :compare-event-name="compareEventName" />
            <DemographicsTab v-if="activeTab === 'demographics'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <RegistrationsTab v-if="activeTab === 'registrations'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <TemporalTab v-if="activeTab === 'temporal'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <BadgesTab v-if="activeTab === 'badges'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <ScansTab v-if="activeTab === 'scans'" />
            <LiveTab v-if="activeTab === 'live'" :delegates="delegates" />
            <LiveComparisonTab
              v-if="activeTab === 'liveCompare'"
              :delegates="delegates"
              :compare-delegates="compareDelegates"
              :event-name="eventName"
              :compare-event-name="compareEventName"
            />
            <ReplayTab v-if="activeTab === 'replay'" :delegates="delegates" />
            <ReplayComparisonTab
              v-if="activeTab === 'replayCompare'"
              :delegates="delegates"
              :compare-delegates="compareDelegates"
              :event-name="eventName"
              :compare-event-name="compareEventName"
            />
            <DataTab v-if="activeTab === 'data'" :stats="stats" :delegates="delegates" :mobile-app-id="mobileAppId" :event-name="eventName" />
            <ComparisonTab
              v-if="activeTab === 'comparison'"
              :stats="stats"
              :delegates="delegates"
              :event-name="eventName"
              :compare-stats="compareStats"
              :compare-delegates="compareDelegates"
              :compare-event-name="compareEventName"
              :compare-loading="compareLoading"
              :compare-error="compareError"
              :compare-progress="compareProgress"
            />
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
import ComparisonTab from "../components/tabs/ComparisonTab.vue";
import ScansTab from "../components/tabs/ScansTab.vue";
import LiveTab from "../components/tabs/LiveTab.vue";
import LiveComparisonTab from "../components/tabs/LiveComparisonTab.vue";
import ReplayTab from "../components/tabs/ReplayTab.vue";
import ReplayComparisonTab from "../components/tabs/ReplayComparisonTab.vue";

const route = useRoute();
const eventId = route.params.eventId;
const compareEventId = route.query.compareWith || null;
const { loading, refreshing, error, progress, stats, eventName, delegates, mobileAppId, reload, nextRefreshAt } = useStatistics(eventId);

// Event de comparaison : chargement one-shot, sans auto-refresh.
const compareApi = compareEventId
  ? useStatistics(compareEventId, { autoRefresh: false })
  : null;
const compareLoading = computed(() => compareApi?.loading.value || false);
const compareError = computed(() => compareApi?.error.value || null);
const compareStats = computed(() => compareApi?.stats.value || null);
const compareEventName = computed(() => compareApi?.eventName.value || "");
const compareDelegates = computed(() => compareApi?.delegates.value || []);
const compareProgress = computed(() => compareApi?.progress.value || { loaded: 0, total: 0, page: 0 });

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

async function waitForCharts() {
  // Laisse Vue monter tous les tabs, puis attend que Chart.js ait fini de
  // rendre (resize listener + animations). 1500ms couvre le pire cas
  // (changement de layout pdf-mode + animation par défaut ~1000ms).
  await nextTick();
  await new Promise((r) => setTimeout(r, 1500));
}

async function handleExportPdf() {
  await waitForCharts();
  const el = document.getElementById("pdf-content");
  await exportToPdf(
    el, exportTabs.value, stats.value, registeredCount.value, eventName.value,
    compareStats.value, compareEventName.value,
    delegates.value, compareDelegates.value,
  );
}

async function handleExportPptx() {
  await waitForCharts();
  const el = document.getElementById("pdf-content");
  await exportToPptx(
    el, exportTabs.value, stats.value, registeredCount.value, eventName.value,
    compareStats.value, compareEventName.value,
    delegates.value, compareDelegates.value,
  );
}

const progressPercent = computed(() =>
  progress.value.total > 0 ? Math.round((progress.value.loaded / progress.value.total) * 100) : 0
);
const activeTab = ref("overview");

// Icones SVG des onglets — un fichier centralise serait plus propre, on garde
// inline pour ne pas multiplier les imports.
const ICONS = {
  overview: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  demographics: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  registration: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  registrations: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  temporal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  badges: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  data: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  comparison: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
  scans: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
  live: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  replay: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
};

// Structure de navigation hierarchique. Les nodes avec `children` sont des
// groupes (header non cliquable + enfants indentes). Sans `children` = leaf
// navigable. `exportTabs` aplatit pour les exports PDF/PPTX.
const tabs = computed(() => {
  const registrationChildren = [
    { id: "registrations", label: "Inscriptions", icon: ICONS.registrations },
    { id: "temporal", label: "Dynamique", icon: ICONS.temporal },
    { id: "badges", label: "Badges & Check-in", icon: ICONS.badges },
    { id: "data", label: "Données", icon: ICONS.data },
  ];
  if (compareEventId && compareStats.value) {
    registrationChildren.push({ id: "comparison", label: "Comparatif", icon: ICONS.comparison });
  }
  // Live / Replay : leaf simple par defaut, groupe avec sous-onglet Comparatif
  // quand un compareWith est actif et que ses stats sont chargees.
  const hasCompare = compareEventId && compareStats.value;
  const liveNode = hasCompare
    ? {
        id: "live", label: "Live", icon: ICONS.live,
        children: [
          { id: "live", label: "Single", icon: ICONS.live },
          { id: "liveCompare", label: "Comparatif", icon: ICONS.comparison },
        ],
      }
    : { id: "live", label: "Live", icon: ICONS.live };
  const replayNode = hasCompare
    ? {
        id: "replay", label: "Replay", icon: ICONS.replay,
        children: [
          { id: "replay", label: "Single", icon: ICONS.replay },
          { id: "replayCompare", label: "Comparatif", icon: ICONS.comparison },
        ],
      }
    : { id: "replay", label: "Replay", icon: ICONS.replay };
  return [
    { id: "overview", label: "Vue d'ensemble", icon: ICONS.overview },
    { id: "demographics", label: "Démographie", icon: ICONS.demographics },
    { id: "registration", label: "Registration", icon: ICONS.registration, children: registrationChildren },
    liveNode,
    replayNode,
    { id: "scans", label: "SCANS QR", icon: ICONS.scans },
  ];
});

// exportTabs : aplatissement des leaves (Registration n'est pas exporte en tant
// que page — c'est juste un regroupement). Ordre = ordre d'apparition.
const exportTabs = computed(() => {
  const flat = [];
  for (const node of tabs.value) {
    if (node.children) flat.push(...node.children);
    else flat.push(node);
  }
  return flat;
});

function isGroupActive(node) {
  return node.children?.some((c) => c.id === activeTab.value) || false;
}

// Groupes pliables : Set d'ids deplies. Par defaut, on deplie tous les groupes
// qui existent au moment ou l'utilisateur charge la page. Les nouveaux groupes
// (apparus apres l'ajout de compareWith par exemple) sont auto-deplies.
const expandedGroups = ref(new Set());
function isExpanded(groupId) {
  return expandedGroups.value.has(groupId);
}
function toggleGroup(groupId) {
  const next = new Set(expandedGroups.value);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  expandedGroups.value = next;
}
// Au chargement, tous les groupes sont plies. L'utilisateur deplie ceux qu'il
// veut consulter en cliquant sur le header. Pas d'auto-expand a l'apparition
// d'un nouveau groupe (ex: lors de l'activation de compareWith).
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

/* Groupe : header cliquable (toggle plier/deplier), enfants indentes. */
.nav-group-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 12px 4px;
  font-size: 10px; font-weight: 700;
  color: rgba(255,255,255,.45);
  text-transform: uppercase; letter-spacing: .6px;
  user-select: none;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.nav-group-header:hover { color: rgba(255,255,255,.85); }
.nav-group-header.is-active { color: rgba(255,255,255,.75); }
.nav-group-header .nav-icon { width: 14px; height: 14px; opacity: .55; }
.nav-chevron {
  margin-left: auto;
  font-size: 10px;
  transition: transform 0.18s ease;
  opacity: .6;
}
.nav-group-header.is-collapsed .nav-chevron { transform: rotate(-90deg); }

.nav-item.nav-child { padding-left: 26px; }
.nav-item.nav-child .nav-icon { width: 14px; height: 14px; }

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
  .nav-item.nav-child { padding-left: 10px; }
  .nav-group-header {
    padding: 6px 8px; font-size: 9px;
    white-space: nowrap;
  }
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
