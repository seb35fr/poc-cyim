<template>
  <div class="layout">
    <!-- Top header bar : branding event (logo + nom + meta) -->
    <header v-if="stats" class="topbar">
      <div class="topbar-logo">
        <img v-if="eventLogo && !logoError" :src="eventLogo" :alt="eventName" @error="logoError = true" />
        <span v-else class="topbar-logo-initials">{{ eventInitials }}</span>
      </div>
      <div class="topbar-titles">
        <span class="topbar-name">{{ eventName || t("topbar.fallbackName") }}</span>
        <span class="topbar-meta">{{ stats.global.registeredCount }} {{ t("topbar.registered") }}<template v-if="compareEventName"> · {{ t("common.comparedTo") }} {{ compareEventName }}</template></span>
      </div>
      <LanguageToggle class="topbar-lang" />
      <button
        class="topbar-info"
        type="button"
        :title="t('dataSources.buttonTitle')"
        :aria-label="t('dataSources.buttonTitle')"
        @click="showDataSources = true"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14a9 3 0 0 0 18 0V5" />
          <path d="M3 12a9 3 0 0 0 18 0" />
        </svg>
      </button>
    </header>

    <DataSourcesInfo v-if="showDataSources" @close="showDataSources = false" />


    <div class="layout-body">
    <!-- Sidebar -->
    <aside v-if="stats" class="sidebar">
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
          <button class="btn-side btn-side-accent" @click="handleExportMarkdown" :disabled="exportingMd" :title="t('exportBtn.tooltip')">
            <svg v-if="!exportingMd" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M8 10L5 7M8 10l3-3M2 12v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span v-if="exportingMd" class="spinner-small"></span>
            {{ exportingMd ? t("exportBtn.loading") : t("exportBtn.label") }}
          </button>
        </div>
        <div class="sidebar-refresh">
          <button class="btn-side btn-side-ghost" @click="confirmReload" :disabled="loading || refreshing">
            {{ refreshing ? t("refresh.refreshing") : t("refresh.refresh") }}
          </button>
          <label class="auto-refresh-toggle" :title="autoRefreshEnabled ? t('refresh.autoOff') : t('refresh.autoOn')">
            <input
              type="checkbox"
              :checked="autoRefreshEnabled"
              @change="toggleAutoRefresh"
            />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label">{{ t("refresh.autoLabel") }}</span>
          </label>
          <span v-if="!refreshing" class="refresh-timer">{{ nextRefreshLabel }}</span>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <div v-if="loading" class="loading-state">
        <div class="loading-card">
          <div v-if="eventName" class="loading-event">
            <img v-if="eventLogo && !logoError" :src="eventLogo" :alt="eventName" class="loading-logo" @error="logoError = true" />
            <span class="loading-event-name">{{ eventName }}</span>
          </div>
          <div class="spinner"></div>
          <p class="loading-label">{{ t("states.loading") }}</p>
          <p class="loading-sub">{{ t("states.loadingSub") }}</p>

          <div v-if="progress.total > 0" class="progress-wrapper">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <p class="progress-text">{{ t("states.progress", { loaded: progress.loaded, total: progress.total, page: progress.page }) }}</p>
          </div>

          <!-- Sources chargees en parallele (delegues GraphQL + index ES). -->
          <ul class="loading-sources">
            <li v-for="src in loadingSources" :key="src.key" :class="{ done: !src.loading }">
              <span class="ls-icon">
                <span v-if="src.loading" class="spinner-tiny"></span>
                <span v-else class="ls-check">✓</span>
              </span>
              <span class="ls-label">{{ src.label }}</span>
              <span v-if="src.detail" class="ls-detail">{{ src.detail }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ t("states.error", { message: error }) }}</p>
        <button class="btn-side" @click="reload">{{ t("states.retry") }}</button>
      </div>

      <template v-else-if="stats">
        <div v-if="refreshing" class="refresh-bar-wrapper">
          <div class="refresh-bar">
            <div class="refresh-bar-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <p class="refresh-bar-text">
            {{ t("states.refreshingProgress", { loaded: progress.loaded, total: progress.total, percent: progressPercent }) }}
          </p>
        </div>

        <!-- Filtres GLOBAUX : persistent sur tous les onglets. -->
        <div class="global-filters">
          <div class="gf-dates">
            <span class="gf-title" :title="t('filters.dateTooltip')">{{ t("filters.dateTitle") }}</span>
            <label class="gf-field">
              <span>{{ t("filters.from") }}</span>
              <input type="date" v-model="startYMD" :max="endYMD" />
            </label>
            <label class="gf-field">
              <span>{{ t("filters.to") }}</span>
              <input type="date" v-model="endYMD" :min="startYMD" />
            </label>
            <button v-if="!isDateDefault" class="gf-reset" @click="resetDateRange" :title="t('filters.resetTooltip')">↺</button>
          </div>
          <BadgeTypeFilter
            v-if="allBadgeTypes.length > 0"
            :types="allBadgeTypes"
            :selected="selectedBadgeTypes"
            @toggle="toggleBadgeType"
            @clear="clearBadgeTypes"
            @select="setBadgeTypes"
          />
        </div>

        <div class="tab-content">
            <OverviewTab
              v-if="activeTab === 'overview'"
              :stats="stats"
              :delegates="pageDelegates"
              :mobile-app-id="mobileAppId"
              :event-name="eventName"
              :compare-delegates="pageCompareDelegates"
              :compare-event-name="compareEventName"
              :live-api="liveApi"
              :replay-api="replayApi"
              :compare-live-api="compareLiveApi"
              :compare-replay-api="compareReplayApi"
              :scans-api="scansApi"
              :compare-scans-api="compareScansApi"
              :badge-filter="badgeFilter"
              :date-range="effectiveDateRange"
            />
            <DemographicsTab v-if="activeTab === 'demographics'" :stats="pageStats" :delegates="pageDelegates" :mobile-app-id="mobileAppId" :event-name="eventName" :date-range="effectiveDateRange" />
            <RegistrationsTab v-if="activeTab === 'registrations'" :stats="pageStats" :delegates="pageDelegates" :mobile-app-id="mobileAppId" :event-name="eventName" :date-range="effectiveDateRange" />
            <TemporalTab v-if="activeTab === 'temporal'" :stats="pageStats" :delegates="pageDelegates" :mobile-app-id="mobileAppId" :event-name="eventName" :date-range="effectiveDateRange" />
            <BadgesTab v-if="activeTab === 'badges'" :stats="pageStats" :delegates="pageDelegates" :mobile-app-id="mobileAppId" :event-name="eventName" :date-range="effectiveDateRange" :badge-filter="badgeFilter" />
            <ScansTab
              v-if="activeTab === 'scans'"
              :scans-api="scansApi"
              :compare-scans-api="compareScansApi"
              :delegates="delegates"
              :event-name="eventName"
              :compare-event-name="compareEventName"
            />
            <ViewersTab v-if="activeTab === 'live'" kind="live" :delegates="pageDelegates" :viewer-api="liveApi" :badge-filter-active="selectedBadgeTypes.size > 0" />
            <ViewersComparisonTab
              v-if="activeTab === 'liveCompare'"
              kind="live"
              :delegates="pageDelegates"
              :compare-delegates="pageCompareDelegates"
              :event-name="eventName"
              :compare-event-name="compareEventName"
              :viewer-api="liveApi"
              :compare-viewer-api="compareLiveApi"
            />
            <ViewersTab v-if="activeTab === 'replay'" kind="replay" :delegates="pageDelegates" :viewer-api="replayApi" />
            <ViewersComparisonTab
              v-if="activeTab === 'replayCompare'"
              kind="replay"
              :delegates="pageDelegates"
              :compare-delegates="pageCompareDelegates"
              :event-name="eventName"
              :compare-event-name="compareEventName"
              :viewer-api="replayApi"
              :compare-viewer-api="compareReplayApi"
            />
            <DataTab v-if="activeTab === 'data'" :stats="pageStats" :delegates="pageDelegates" :mobile-app-id="mobileAppId" :event-name="eventName" :date-range="effectiveDateRange" />
            <ExportsTab
              v-if="activeTab === 'exports'"
              :delegates="pageDelegates"
              :event-name="eventName"
              :live-api="liveApi"
              :replay-api="replayApi"
              :scans-api="scansApi"
            />
            <ComparisonTab
              v-if="activeTab === 'comparison'"
              :stats="stats"
              :delegates="pageDelegates"
              :event-name="eventName"
              :compare-stats="compareStats"
              :compare-delegates="pageCompareDelegates"
              :compare-event-name="compareEventName"
              :compare-loading="compareLoading"
              :compare-error="compareError"
              :compare-progress="compareProgress"
              :badge-filter="badgeFilter"
              :date-range="effectiveDateRange"
            />
        </div>
      </template>
    </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useStatistics } from "@/composables/useStatistics.js";
import { useLive } from "@/composables/useLive.js";
import { useReplay } from "@/composables/useReplay.js";
import { useRoomScans } from "@/composables/useRoomScans.js";
import { buildQrDelegateLookup } from "@/utils/computeScanStats.js";
import { useBadgeTypeFilter } from "@/composables/useBadgeTypeFilter.js";
import { useDateRangeFilter } from "@/composables/useDateRangeFilter.js";
import { computeAllStats } from "@/utils/computeStats.js";
import { useExportMarkdown } from "@/composables/useExportMarkdown.js";
import { COUNTDOWN_TICK_MS } from "@/constants.js";
import { fmt } from "@/utils/formatters.js";
import OverviewTab from "../components/tabs/OverviewTab.vue";
import DemographicsTab from "../components/tabs/DemographicsTab.vue";
import RegistrationsTab from "../components/tabs/RegistrationsTab.vue";
import TemporalTab from "../components/tabs/TemporalTab.vue";
import BadgesTab from "../components/tabs/BadgesTab.vue";
import DataTab from "../components/tabs/DataTab.vue";
import ComparisonTab from "../components/tabs/ComparisonTab.vue";
import ScansTab from "../components/tabs/ScansTab.vue";
import ViewersTab from "../components/tabs/ViewersTab.vue";
import ViewersComparisonTab from "../components/tabs/ViewersComparisonTab.vue";
import ExportsTab from "../components/tabs/ExportsTab.vue";
import BadgeTypeFilter from "../components/BadgeTypeFilter.vue";
import LanguageToggle from "../components/LanguageToggle.vue";
import DataSourcesInfo from "../components/DataSourcesInfo.vue";

const { t, locale } = useI18n();
const route = useRoute();
const eventId = route.params.eventId;
const compareEventId = route.query.compareWith || null;
const statsApi = useStatistics(eventId);
const {
  loading, configLoading, refreshing, error, progress, stats, eventName, eventLogo, eventConfig, delegates, mobileAppId,
  reload, nextRefreshAt,
} = statsApi;

// Event de comparaison : chargement one-shot, sans auto-refresh.
const compareApi = compareEventId
  ? useStatistics(compareEventId, { autoRefresh: false })
  : null;

const compareLoading = computed(() => compareApi?.loading.value || false);
const compareError = computed(() => compareApi?.error.value || null);
const compareStats = computed(() => compareApi?.stats.value || null);
const compareEventName = computed(() => compareApi?.eventName.value || "");

// Fallback logo : initiales si pas de logoURL ou si l'image casse (@error).
const logoError = ref(false);
const showDataSources = ref(false);
const eventInitials = computed(() => {
  const name = (eventName.value || "").trim();
  if (!name) return "?";
  const alphaWords = name.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (alphaWords.length >= 2) return (alphaWords[0][0] + alphaWords[1][0]).toUpperCase();
  if (alphaWords.length === 1) return alphaWords[0].slice(0, 2).toUpperCase();
  return name.slice(0, 2).toUpperCase();
});
const compareDelegates = computed(() => compareApi?.delegates.value || []);
const compareProgress = computed(() => compareApi?.progress.value || { loaded: 0, total: 0, page: 0 });

// ═══ FILTRES GLOBAUX (badge type + plage de dates) ═══
// Liftes ici et appliques a la SOURCE : tous les onglets/sous-onglets en
// heritent sans avoir a re-selectionner en naviguant. Le badge type filtre la
// POPULATION de delegues ; le filtre date est PER-ACTIVITE (chaque date propre
// — createdAt / checkedInDate / deliveredAt / timestamps ES — testee dans
// computeAllStats et les stats ES). Defaut : debut = inscription la plus
// ancienne, fin = aujourd'hui.
const dateFilter = useDateRangeFilter(() =>
  compareEventId
    ? [...(delegates.value || []), ...(compareDelegates.value || [])]
    : delegates.value,
);
const dateRange = dateFilter.range; // computed { start, end } en ms
// Refs top-level pour auto-unwrap dans le template (toolbar globale).
const { startYMD, endYMD, isDefault: isDateDefault, reset: resetDateRange } = dateFilter;
// Plage EFFECTIVE transmise aux composables ES : null tant que l'utilisateur
// n'a pas touche aux bornes (defaut = aucun filtrage). Evite de masquer toute
// la donnee de consultation quand les items ES n'ont pas de timestamp de vue
// fiable (le bucketage retombe sur session_start/end, parfois hors plage par
// defaut [inscription la plus ancienne -> aujourd'hui]).
const effectiveDateRange = computed(() => (isDateDefault.value ? null : dateRange.value));

const badgeFilter = useBadgeTypeFilter(
  () => delegates.value,
  compareEventId ? () => compareDelegates.value : null,
);
const {
  allBadgeTypes,
  selected: selectedBadgeTypes,
  toggle: toggleBadgeType,
  clear: clearBadgeTypes,
  setSelection: setBadgeTypes,
} = badgeFilter;

// Live / Replay / Scans : instancies UNE fois ici, propages en prop. getDateRange
// branche le filtre date global sur les stats ES (items filtres par timestamp).
// Scans : aussi le filtre badge type (les scans portent un badge_type).
const liveApi = useLive(eventId, { getDateRange: () => effectiveDateRange.value });
const replayApi = useReplay(eventId, { getDateRange: () => effectiveDateRange.value });
// Lookup QR->delegue construit a partir des delegues DEJA charges (badges.qrCode).
// Sert a re-associer client-side les scans dont Flink a ecrit delegate_id = '-'
// alors que le badge/delegue existe en base. Construit sur la population COMPLETE
// (pas badge-filtree) : la recuperation ne doit pas dependre du filtre badge.
const qrLookup = computed(() => buildQrDelegateLookup(delegates.value));
const compareQrLookup = computed(() => buildQrDelegateLookup(compareDelegates.value));

const scansApi = useRoomScans(eventId, {
  getDateRange: () => effectiveDateRange.value,
  getBadgeTypes: () => badgeFilter.selected.value,
  getQrLookup: () => qrLookup.value,
});
const compareLiveApi = compareEventId
  ? useLive(compareEventId, { autoRefresh: false, getDateRange: () => effectiveDateRange.value })
  : null;
const compareReplayApi = compareEventId
  ? useReplay(compareEventId, { autoRefresh: false, getDateRange: () => effectiveDateRange.value })
  : null;
const compareScansApi = compareEventId
  ? useRoomScans(compareEventId, {
      autoRefresh: false,
      getDateRange: () => effectiveDateRange.value,
      getBadgeTypes: () => badgeFilter.selected.value,
      getQrLookup: () => compareQrLookup.value,
    })
  : null;

// Donnees centralisees passees aux onglets : delegues badge-filtres + stats
// badge-filtrees. Le filtre date s'applique au CHECK-IN (perimetre consultation
// + presence) via effectiveDateRange — les autres stats d'inscription (createdAt,
// badges, onboarding, demographie) restent non filtrees par date (cf. computeAllStats).
const pageDelegates = computed(() => badgeFilter.filteredDelegates.value);
const pageCompareDelegates = computed(() => badgeFilter.filteredCompareDelegates.value);
const pageStats = computed(() =>
  computeAllStats(pageDelegates.value, mobileAppId.value, effectiveDateRange.value),
);
const pageCompareStats = computed(() =>
  computeAllStats(pageCompareDelegates.value, mobileAppId.value, effectiveDateRange.value),
);

// Titre de l'onglet navigateur : reflete l'event courant (et l'event compare
// si ?compareWith=). Reactif — se met a jour des que les noms sont resolus via
// GraphQL (config.branding). Fallback sur l'eventId tant que le nom n'est pas
// charge, puis sur un libelle generique.
watch(
  [eventName, compareEventName, () => locale.value],
  ([name, compareName]) => {
    const base = name || eventId || t("topbar.fallbackName");
    document.title = compareName
      ? t("doc.titleCompare", { name: base, compare: compareName })
      : t("doc.titleSingle", { name: base });
  },
  { immediate: true },
);

const now = ref(Date.now());
const countdownTimer = setInterval(() => { now.value = Date.now(); }, COUNTDOWN_TICK_MS);
onUnmounted(() => clearInterval(countdownTimer));

// Auto-refresh global : off par defaut, l'utilisateur l'active manuellement.
// Etat unique pilote par le toggle UI ; setAutoRefresh est appelle sur les 4
// composables principaux. Les compareXxx restent toujours off (chargement one-shot).
const autoRefreshEnabled = ref(false);
function toggleAutoRefresh() {
  const next = !autoRefreshEnabled.value;
  autoRefreshEnabled.value = next;
  statsApi.setAutoRefresh(next);
  liveApi.setAutoRefresh(next);
  replayApi.setAutoRefresh(next);
  scansApi.setAutoRefresh(next);
}

const nextRefreshLabel = computed(() => {
  if (!autoRefreshEnabled.value) return t("refresh.autoPaused");
  const at = nextRefreshAt.value;
  if (!at) return "—";
  const remaining = Math.max(0, at - now.value);
  const totalSec = Math.round(remaining / COUNTDOWN_TICK_MS) * 10;
  if (totalSec <= 0) return t("refresh.imminent");
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
});
const { exportingMd, exportToMarkdown } = useExportMarkdown();

function confirmReload() {
  if (confirm(t("refresh.confirm"))) {
    reload();
  }
}

async function handleExportMarkdown() {
  // Pas besoin d'attendre les charts — on lit la data brute, pas le DOM.
  await exportToMarkdown({
    eventId,
    eventName: eventName.value,
    config: eventConfig.value,
    // Référentiel sessions du programme : identique côté live et replay
    // (children SESSION) — on prend le live, repli sur le replay.
    sessions: liveApi.sessions.value?.length ? liveApi.sessions.value : replayApi.sessions.value,
    delegates: pageDelegates.value,
    stats: pageStats.value,
    compareStats: pageCompareStats.value,
    compareEventName: compareEventName.value,
    compareConfig: compareApi?.eventConfig.value || null,
    compareSessions: compareLiveApi?.sessions.value?.length
      ? compareLiveApi.sessions.value
      : compareReplayApi?.sessions.value || [],
    compareDelegates: pageCompareDelegates.value,
    compareLiveStats: compareLiveApi?.stats.value || null,
    compareReplayStats: compareReplayApi?.stats.value || null,
    liveStats: liveApi.stats.value,
    replayStats: replayApi.stats.value,
    scanStats: scansApi.stats.value,
    compareScanStats: compareScansApi?.stats.value || null,
    badgeFilterTypes: [...badgeFilter.selected.value],
  });
}

const progressPercent = computed(() =>
  progress.value.total > 0 ? Math.round((progress.value.loaded / progress.value.total) * 100) : 0
);

// Etat des sources chargees EN PARALLELE pendant l'ecran de chargement, DISSOCIEES
// par recuperation reelle (chaque fetch distinct = une ligne) : GraphQL (config,
// inscriptions, sessions du programme) + Elasticsearch (vues live/replay, scans).
// Les sessions sont un fetch GraphQL a part, partage live+replay.
const loadingSources = computed(() => {
  const sp = scansApi.progress?.value || {};
  const scansLoaded = (sp.audience || 0) + (sp.checkin || 0) + (sp.zone || 0);
  return [
    {
      key: "config",
      label: t("states.sources.config"),
      loading: configLoading.value,
      detail: "",
    },
    {
      key: "delegates",
      label: t("states.sources.delegates"),
      loading: loading.value,
      detail: progress.value.total > 0 ? `${fmt(progress.value.loaded)} / ${fmt(progress.value.total)}` : "",
    },
    {
      key: "sessions",
      label: t("states.sources.sessions"),
      loading: liveApi.sessionsLoading.value || replayApi.sessionsLoading.value,
      detail: "",
    },
    {
      key: "live",
      label: t("states.sources.live"),
      loading: liveApi.viewsLoading.value,
      detail: "",
    },
    {
      key: "replay",
      label: t("states.sources.replay"),
      loading: replayApi.viewsLoading.value,
      detail: "",
    },
    {
      key: "scans",
      label: t("states.sources.scans"),
      loading: scansApi.loading.value,
      detail: scansLoaded > 0 ? t("states.sources.scansCount", { n: fmt(scansLoaded) }) : "",
    },
  ];
});

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
  exports: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

// Structure de navigation hierarchique. Les nodes avec `children` sont des
// groupes (header non cliquable + enfants indentes). Sans `children` = leaf
// navigable.
const tabs = computed(() => {
  const registrationChildren = [
    { id: "registrations", label: t("nav.registrations"), icon: ICONS.registrations },
    { id: "temporal", label: t("nav.temporal"), icon: ICONS.temporal },
    { id: "badges", label: t("nav.badges"), icon: ICONS.badges },
    { id: "data", label: t("nav.data"), icon: ICONS.data },
  ];
  if (compareEventId && compareStats.value) {
    registrationChildren.push({ id: "comparison", label: t("nav.comparison"), icon: ICONS.comparison });
  }
  // Live / Replay : leaf simple par defaut, groupe avec sous-onglet Comparatif
  // quand un compareWith est actif et que ses stats sont chargees.
  const hasCompare = compareEventId && compareStats.value;
  const liveNode = hasCompare
    ? {
        id: "live", label: t("nav.live"), icon: ICONS.live,
        children: [
          { id: "live", label: t("nav.single"), icon: ICONS.live },
          { id: "liveCompare", label: t("nav.comparison"), icon: ICONS.comparison },
        ],
      }
    : { id: "live", label: t("nav.live"), icon: ICONS.live };
  const replayNode = hasCompare
    ? {
        id: "replay", label: t("nav.replay"), icon: ICONS.replay,
        children: [
          { id: "replay", label: t("nav.single"), icon: ICONS.replay },
          { id: "replayCompare", label: t("nav.comparison"), icon: ICONS.comparison },
        ],
      }
    : { id: "replay", label: t("nav.replay"), icon: ICONS.replay };
  return [
    { id: "overview", label: t("nav.overview"), icon: ICONS.overview },
    { id: "demographics", label: t("nav.demographics"), icon: ICONS.demographics },
    { id: "registration", label: t("nav.registration"), icon: ICONS.registration, children: registrationChildren },
    liveNode,
    replayNode,
    { id: "scans", label: t("nav.scans"), icon: ICONS.scans },
    { id: "exports", label: t("nav.exports"), icon: ICONS.exports },
  ];
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
  display: flex; flex-direction: column; min-height: 100vh;
}
.layout-body { display: flex; flex: 1; min-height: 0; }

/* ── Top header bar (branding event) ── */
.topbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; gap: 14px;
  padding: 10px 22px;
  background: var(--primary);
  color: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.12);
}
.topbar-logo {
  flex-shrink: 0;
  width: 44px; height: 44px;
  background: #fff; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  padding: 4px; overflow: hidden;
}
.topbar-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.topbar-logo-initials { font-size: 16px; font-weight: 700; color: var(--primary); letter-spacing: .5px; }
.topbar-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.topbar-name {
  font-size: 17px; font-weight: 700; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.topbar-meta { font-size: 12px; font-weight: 500; color: rgba(255,255,255,.7); }
.topbar-lang { margin-left: auto; flex-shrink: 0; }
/* Bouton « base de données » : détail technique des sources (GraphQL + index ES). */
.topbar-info {
  flex-shrink: 0; margin-left: 10px;
  width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid var(--border, #d1d5db); background: #fff;
  color: var(--primary, #1e4e66);
  cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
  display: inline-flex; align-items: center; justify-content: center;
}
.topbar-info:hover {
  background: var(--primary, #1e4e66); color: #fff; border-color: var(--primary, #1e4e66);
}

/* ── Sidebar ── */
.sidebar {
  position: sticky; top: 64px; height: calc(100vh - 64px);
  width: 220px; min-width: 220px;
  background: #fff;
  color: var(--text);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  padding: 0; z-index: 30;
  overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(0,0,0,.15) transparent;
}
.sidebar-brand {
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--border);
}
.sidebar-title {
  font-size: 17px; font-weight: 600; line-height: 1.3;
  color: var(--primary); letter-spacing: -.2px;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.sidebar-count {
  display: inline-block; margin-top: 6px;
  font-size: 13px; font-weight: 500;
  background: #f3f4f6; padding: 2px 10px;
  border-radius: 10px; color: var(--text-secondary);
}

/* ── Nav items ── */
.sidebar-nav { flex: 1; padding: 12px 10px; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 9px 12px;
  border: none; background: none; color: var(--text-secondary);
  font-size: 14px; font-weight: 500;
  border-radius: 8px; cursor: pointer;
  transition: all .15s; text-align: left;
}
.nav-item:hover { background: #f3f4f6; color: var(--text); }
.nav-item.active {
  background: rgba(48,221,146,.18); color: var(--primary); font-weight: 600;
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
  font-size: 14px; font-weight: 500;
  color: var(--text-secondary);
  text-transform: none; letter-spacing: normal;
  user-select: none;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.nav-group-header:hover { color: var(--text); }
.nav-group-header.is-active { color: var(--text); }
.nav-group-header .nav-icon { width: 20px; height: 20px; opacity: .55; }
.nav-chevron {
  margin-left: auto;
  font-size: 12px;
  transition: transform 0.18s ease;
  opacity: .6;
}
.nav-group-header.is-collapsed .nav-chevron { transform: rotate(-90deg); }

.nav-item.nav-child { padding-left: 26px; }
.nav-item.nav-child .nav-icon { width: 14px; height: 14px; }

/* ── Sidebar footer ── */
.sidebar-footer {
  padding: 12px 10px 16px;
  border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 8px;
}
.sidebar-actions { display: flex; gap: 6px; }
.btn-side {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 7px 10px; border: none;
  background: #f3f4f6; color: var(--text);
  border-radius: 6px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: background .15s;
}
.btn-side:hover { background: #e5e7eb; }
.btn-side:disabled { opacity: .4; cursor: wait; }
.btn-side-purple { background: var(--purple); }
.btn-side-purple:hover { background: #5a35e0; }
.btn-side-accent { background: var(--accent); color: #0b3b29; }
.btn-side-accent:hover { background: var(--accent-hover); }
.btn-side-ghost {
  background: none; border: 1px solid var(--border);
  font-weight: 500; font-size: 13px; color: var(--text-secondary);
}
.btn-side-ghost:hover { background: #f3f4f6; }
.sidebar-refresh { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.refresh-timer { font-size: 10px; color: var(--text-muted); }

/* Toggle auto-refresh : switch compact dans le sidebar-footer */
.auto-refresh-toggle {
  display: inline-flex; align-items: center; gap: 7px;
  cursor: pointer; user-select: none;
  font-size: 12px; color: var(--text-secondary);
}
.auto-refresh-toggle input[type="checkbox"] {
  position: absolute; opacity: 0; pointer-events: none;
}
.toggle-track {
  position: relative; display: inline-block;
  width: 28px; height: 14px;
  background: #d1d5db;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  transition: background .18s;
}
.toggle-thumb {
  position: absolute; top: 1px; left: 1px;
  width: 10px; height: 10px;
  background: #fff; border-radius: 50%;
  transition: transform .18s;
}
.auto-refresh-toggle input:checked + .toggle-track {
  background: var(--accent);
  border-color: var(--accent);
}
.auto-refresh-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(14px);
  background: #0b3b29;
}
.auto-refresh-toggle:hover .toggle-track { background: #c4c9d0; }
.auto-refresh-toggle input:checked ~ .toggle-label,
.auto-refresh-toggle:has(input:checked) .toggle-label { color: var(--text); }
.toggle-label { white-space: nowrap; }

/* ── Main content ── */
.main-content {
  flex: 1; min-width: 0;
  padding: 16px 28px 20px; overflow-x: hidden;
}

/* ── Loading / Error ── */
.loading-state, .error-state { text-align: center; padding: 60px 20px; }
.loading-card {
  display: inline-block; min-width: 340px; max-width: 440px;
  padding: 32px 36px; background: var(--card); border-radius: 14px;
  box-shadow: 0 8px 30px rgba(30, 78, 102, .12); border: 1px solid var(--border);
  animation: loading-card-in .3s ease;
}
@keyframes loading-card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.loading-event {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  margin-bottom: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border);
}
.loading-logo { max-height: 56px; max-width: 200px; object-fit: contain; }
.loading-event-name { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.3; }
.loading-label { font-size: 17px; font-weight: 600; color: var(--primary); margin: 0 0 4px; }
.loading-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 18px; }
.progress-wrapper { max-width: 360px; margin: 0 auto; }
.progress-bar {
  width: 100%; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
}
.progress-fill {
  height: 100%; background: var(--primary); border-radius: 3px;
  transition: width .3s ease;
}
.progress-text { font-size: 14px; color: var(--text-muted); margin-top: 8px; }

/* Liste des sources chargees en parallele. */
.loading-sources {
  list-style: none; margin: 18px 0 0; padding: 14px 0 0;
  border-top: 1px solid var(--border); text-align: left;
}
.loading-sources li {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 0; font-size: 13px; color: var(--text-secondary);
  transition: color .2s;
}
.loading-sources li.done { color: var(--text-muted); }
.ls-icon { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ls-check { color: var(--accent, #30dd92); font-weight: 700; font-size: 14px; }
.ls-label { flex: 1; }
.ls-detail { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.spinner-tiny {
  width: 12px; height: 12px; border: 2px solid var(--border);
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin .7s linear infinite;
}
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
  font-size: 13px; color: var(--text-muted); margin-top: 6px; text-align: center;
}

/* ── Filtres globaux (badge type + plage de dates) ── */
.global-filters {
  display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap;
  padding: 10px 16px; margin-bottom: 18px;
  background: var(--card); border-radius: 10px; box-shadow: var(--shadow);
}
.gf-dates { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gf-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-muted); margin-right: 4px; white-space: nowrap;
}
.gf-field {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13px; text-transform: uppercase; letter-spacing: .3px;
  font-weight: 600; color: var(--text-muted);
}
/* Hauteur commune a tous les controles de la barre (dates, reset, badge type)
   pour un alignement horizontal net. */
.global-filters .gf-field input[type="date"],
.global-filters .gf-reset,
.global-filters .bt-trigger {
  height: 32px; box-sizing: border-box;
}
.gf-field input[type="date"] {
  font-family: inherit; font-size: 14px; font-weight: 400; padding: 0 8px;
  border: 1px solid var(--border); border-radius: 6px; color: var(--text);
  background: #fff; cursor: pointer; text-transform: none; letter-spacing: 0;
}
.gf-field input[type="date"]:focus { outline: none; border-color: var(--primary); }
.gf-reset {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; padding: 0; border: 1px solid var(--border); border-radius: 6px;
  background: #fff; color: var(--text-secondary); cursor: pointer; font-size: 16px;
}
.gf-reset:hover { background: #f3f4f6; color: var(--primary); }
/* Le BadgeTypeFilter est concu standalone (margin-bottom) : on neutralise ici.
   Il se place juste a droite de la plage de dates (groupe aligne a gauche). */
.global-filters .badge-type-filter { margin: 0; }

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
  font-size: 16px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .5px; margin-bottom: 2px; font-weight: 600;
}
.kpi-value { font-size: 28px; font-weight: 700; color: #254f65; line-height: 1.2; }
.kpi-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* ── Chart Cards ── */
.charts-row {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px; margin-bottom: 10px;
}
.charts-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
/* Ratio 1/3 (type de session) – 2/3 (liste sessions). `stretch` : les 2 cartes
   ont la même hauteur ; la carte type (gauche) définit la hauteur de la rangée,
   la liste sessions (droite) scrolle dans cette hauteur (cf. .session-list-card). */
.charts-row.cols-1-2 { grid-template-columns: 1fr 2fr; align-items: stretch; }

/* Carte « liste de sessions » : flex colonne, la zone de liste scrolle et est
   positionnée en absolu pour NE PAS gonfler la hauteur de la rangée (c'est la
   carte type de session voisine qui la fixe). */
.session-list-card { display: flex; flex-direction: column; }
/* flex:1 pour remplir la hauteur de la rangée (= carte type) ; min-height plancher
   pour rester visible si la carte n'est PAS appairée (hors grille -> pas de
   hauteur définie, le flex:1 s'effondrerait sinon). */
.session-scroll-host { flex: 1; min-height: 220px; position: relative; }
.session-scroll { position: absolute; inset: 0; overflow-y: auto; }
/* Variante non appairée (pleine largeur) : hauteur plafonnée + scroll. */
.session-scroll-capped { max-height: 520px; overflow-y: auto; }
.chart-card {
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  box-shadow: var(--shadow); margin-bottom: 10px;
}
.charts-row > .chart-card { margin-bottom: 0; }
.chart-card h3 {
  font-size: 16px; color: #254f65; margin-bottom: 8px;
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
  font-size: 12px; padding: 1px 7px; background: #f3f4f6;
  border-radius: 8px; color: var(--text-secondary);
}

/* ── Data tables (used in demographics, registrations etc.) ── */
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  text-align: left; padding: 5px 8px; background: #f5f6f8;
  color: var(--text-muted); font-weight: 700; font-size: 12px;
  border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: .3px;
}
.data-table td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
.data-table tr:hover td { background: #f4f7fa; }

/* ── Filter banner ── */
.filter-banner {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 7px 12px; margin-bottom: 10px;
  background: #eef6ff; border: 1px solid #bdd8f1; border-radius: 8px;
  font-size: 13px; color: var(--text);
}
.filter-info { font-weight: 600; color: var(--primary); white-space: nowrap; }
.filter-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-tag {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; background: var(--primary); color: #fff;
  border-radius: 10px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background .15s;
}
.filter-tag:hover { background: var(--primary-light); }
.filter-clear {
  margin-left: auto; padding: 2px 8px;
  background: none; border: 1px solid #bdd8f1; border-radius: 4px;
  font-size: 12px; color: var(--text-secondary); cursor: pointer;
}
.filter-clear:hover { background: #fff; }

/* ── Period selectors (temporal/badges) ── */
.period-selector {
  display: flex; gap: 3px;
}
.period-selector button {
  font-size: 12px; padding: 3px 10px;
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
  text-align: center; padding: 16px; font-size: 14px;
  color: var(--text-muted); font-style: italic;
}

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
  .sidebar-title { font-size: 16px; }
  .sidebar-count { margin-top: 0; margin-left: 8px; }
  .sidebar-nav {
    display: flex; flex-direction: row; gap: 2px;
    padding: 8px 0 0; overflow-x: auto; width: 100%;
    scrollbar-width: none;
  }
  .sidebar-nav::-webkit-scrollbar { display: none; }
  .nav-item { white-space: nowrap; padding: 6px 10px; font-size: 13px; }
  .nav-item.nav-child { padding-left: 10px; }
  .nav-group-header {
    padding: 6px 8px; font-size: 10px;
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
