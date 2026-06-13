<template>
  <div>
    <!-- Etat : chargement / erreur / refresh -->
    <div v-if="loading" class="scans-state">
      <div class="spinner"></div>
      <p class="loading-label">{{ t("scans.loading") }}</p>
      <p class="scans-progress">
        {{ t("scans.progress", { audience: fmt(progress.audience), checkin: fmt(progress.checkin), zone: fmt(progress.zone) }) }}
      </p>
    </div>

    <div v-else-if="error" class="scans-state error-state">
      <p><strong>{{ t("scans.esError") }}</strong> {{ error }}</p>
      <p class="scans-hint">
        {{ t("scans.esHintPre") }} <code>VITE_ES_URL</code> {{ t("scans.esHintMid") }} <code>/api/es</code> {{ t("scans.esHintPost") }}
      </p>
      <button class="btn-side" @click="reload">{{ t("states.retry") }}</button>
    </div>

    <template v-else>
      <div v-if="refreshing" class="refresh-bar-wrapper">
        <div class="refresh-bar">
          <div class="refresh-bar-fill" :style="{ width: '50%' }"></div>
        </div>
        <p class="refresh-bar-text">{{ t("scans.refreshing") }}</p>
      </div>

      <!-- KPI -->
      <div class="kpi-grid">
        <div class="kpi-card blue">
          <div class="kpi-label">{{ t("scans.kpi.roomViews") }}</div>
          <div class="kpi-value">{{ fmt(g.audienceUniqueDelegateSessions) }}</div>
          <div class="kpi-sub">{{ t("scans.kpi.roomViewsSub") }}</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">{{ t("scans.kpi.uniqueScanned") }}</div>
          <div class="kpi-value">{{ fmt(g.uniqueDelegatesAll) }}</div>
          <div class="kpi-sub">
            {{ t("scans.kpi.subRoom", { n: fmt(g.uniqueAudienceDelegates) }) }}<template v-if="g.totalCheckinScans > 0">{{ t("scans.kpi.subEntrance", { n: fmt(g.uniqueCheckinDelegates) }) }}</template><span v-else class="entree-note" :title="t('scans.kpi.noEntranceTitle')">{{ t("scans.kpi.subNoEntrance") }}</span>
          </div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-label">{{ t("scans.kpi.sessionsScanned") }}</div>
          <div class="kpi-value">{{ fmt(g.distinctSessions) }}</div>
          <div class="kpi-sub">{{ t("scans.kpi.sessionsScannedSub", { n: fmt(g.distinctRooms) }) }}</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-label">{{ t("scans.kpi.distinctZones") }}</div>
          <div class="kpi-value">{{ fmt(g.distinctZones) }}</div>
        </div>
      </div>

      <!-- Comparaison d'events : grille KPI A | Δ | B (si ?compareWith=) -->
      <div v-if="hasCompare" class="chart-card scans-compare-card">
        <div class="chart-header">
          <h3>{{ t("scans.compareTitle", { a: eventName, b: compareEventName }) }}</h3>
        </div>
        <div v-if="compareLoading" class="empty-msg">{{ t("scans.compareLoading") }}</div>
        <div v-else-if="!gB" class="empty-msg">{{ t("scans.compareUnavailable") }}</div>
        <KpiCompareGrid
          v-else
          :kpis="compareKpis"
          :event-name="eventName"
          :compare-event-name="compareEventName"
        />
      </div>

      <!-- Delegues uniques scannes par jour (gauche) / Scans par zone (droite) -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("scans.byDayTitle") }} <InfoTooltip :text="t('scans.byDayHint')" /></h3>
            <CsvButton
              filename="delegues-uniques-par-jour"
              :headers="[t('scans.csv.day'), t('scans.csv.uniqueTotal'), t('scans.csv.ofAudience'), t('scans.csv.ofEntrance'), t('scans.csv.ofZones'), ...uniqueByDay.badgeTypes]"
              :rows="uniqueByDay.rows"
            />
          </div>
          <StackedBarChart
            v-if="uniqueByDay.labels.length > 0"
            :labels="uniqueByDay.labels"
            :datasets="uniqueByDay.chartData.datasets"
            :height="320"
            show-total
          />
          <p v-else class="empty-msg">{{ t("scans.empty.noTimestamped") }}</p>
        </div>

        <!-- Scans de zone par jour : 1 barre / jour, empilee par zone. -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("scans.byZoneTitle") }} <InfoTooltip :text="t('scans.byZoneHint')" /></h3>
            <CsvButton
              filename="scans-par-zone-par-jour"
              :headers="zoneByDay.csvHeaders"
              :rows="zoneByDay.rows"
            />
          </div>
          <StackedBarChart
            v-if="zoneByDay.labels.length > 0"
            :labels="zoneByDay.labels"
            :datasets="zoneByDay.datasets"
            :height="320"
            show-total
            legend-position="bottom"
          />
          <p v-else class="empty-msg">{{ t("scans.empty.noZone") }}</p>
        </div>
      </div>

      <!-- Repartition geographique des delegues scannes (monde + Europe). -->
      <div class="charts-row" v-if="geoCountries.length > 0">
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("maps.worldTitle") }} <InfoTooltip :text="t('scans.geoHint')" /></h3>
            <CsvButton
              filename="scans-pays-monde"
              :headers="[t('overview.csv.countryCode'), t('scans.csv.uniqueDelegates')]"
              :rows="geoCountries.map(c => [c.value, c.totalCount])"
            />
          </div>
          <ChoroplethMap :key="`scans-world-${geoCacheKey}`" :countries="geoCountries" scope="world" :show-legend="true" :height="420" />
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("maps.europeTitle") }} <InfoTooltip :text="t('scans.geoHint')" /></h3>
            <CsvButton
              filename="scans-pays-europe"
              :headers="[t('overview.csv.countryCode'), t('scans.csv.uniqueDelegates')]"
              :rows="geoCountriesEurope.map(c => [c.value, c.totalCount])"
            />
          </div>
          <ChoroplethMap :key="`scans-europe-${geoCacheKey}`" :countries="geoCountries" scope="europe" :show-legend="true" :height="420" />
        </div>
      </div>

      <!-- Type de session (1/3, cliquable) cote a cote avec Top sessions (2/3). -->
      <div :class="audienceSessionTypes.length > 0 ? 'charts-row cols-1-2' : ''">
      <!-- Presence par type de session (salle), cliquable -> filtre Top sessions -->
      <div class="chart-card" v-if="audienceSessionTypes.length > 0">
        <div class="chart-header">
          <h3>{{ t("scans.sessionTypeTitle") }} <InfoTooltip :text="t('scans.sessionTypeHint')" /></h3>
          <CsvButton
            filename="presence-par-type-session"
            :headers="[t('scans.csv.type'), t('scans.csv.scans'), t('scans.csv.uniqueDelegates')]"
            :rows="audienceSessionTypes.map(st => [st.type, st.scans, st.uniqueDelegates])"
          />
        </div>
        <div class="origin-pie-wrap">
          <div class="origin-pie">
            <DoughnutChart
              :labels="audienceSessionTypes.map(st => st.type)"
              :data="audienceSessionTypes.map(st => st.scans)"
              :colors="audienceSessionTypes.map(st => getTypeColor(st.type))"
              :active-label="selectedSessionType"
              @select="onSessionTypeSelect"
            />
          </div>
          <div class="origin-legend">
            <div v-for="st in audienceSessionTypes" :key="st.type"
              :class="['origin-legend-row', 'clickable', { active: selectedSessionType === st.type }]"
              @click="onSessionTypeSelect(st.type)">
              <span class="origin-swatch" :style="{ background: getTypeColor(st.type) }"></span>
              <span class="origin-name">{{ st.type }}</span>
              <strong>{{ fmt(st.scans) }}</strong>
              <span class="origin-sub">{{ pctOf(st.scans, totalSessionTypeScans) }}</span>
            </div>
          </div>
        </div>
        <div v-if="selectedSessionType" class="filter-active-bar">
          {{ t("scans.sessionTypeFilterActive") }} <strong>{{ selectedSessionType }}</strong>
          <button class="filter-clear" @click="selectedSessionType = null">{{ t("viewers.charts.clearFilter") }}</button>
        </div>
      </div>

      <!-- Toutes les sessions (tri décroissant), scroll, hauteur = carte type voisine. -->
      <div class="chart-card session-list-card">
        <div class="chart-header">
          <h3>
            {{ t("scans.topSessionsTitle") }} <InfoTooltip :text="t('scans.topSessionsHint')" />
            <span v-if="selectedSessionType" class="muted">{{ t("viewers.charts.filtered") }}</span>
          </h3>
          <CsvButton
            filename="sessions-audience"
            :headers="[t('scans.csv.session'), t('scans.csv.scans'), t('scans.csv.uniqueDelegates')]"
            :rows="topSessions.map(s => [s.label, s.count, s.uniqueDelegates])"
          />
        </div>
        <div class="session-scroll-host">
          <div class="session-scroll">
            <HBarChart
              v-if="topSessions.length > 0"
              :labels="topSessions.map(s => truncate(sessionLabel(s), 60))"
              :data="topSessions.map(s => s.count)"
              :height="Math.max(160, topSessions.length * 22 + 40)"
              color="#1E4E66"
            />
            <p v-else class="empty-msg">{{ t("scans.empty.noAudience") }}</p>
          </div>
        </div>
      </div>
      </div>

      <!-- Engagement : repartition des delegues par nombre de sessions salle suivies -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("scans.engagementTitle") }} <InfoTooltip :text="t('scans.engagementHint')" /></h3>
          <div style="display: flex; gap: 8px; margin-left: auto;">
            <CsvButton
              filename="engagement-distribution"
              :headers="[t('scans.csv.bucket'), t('scans.csv.delegates')]"
              :rows="engagement.buckets.map(b => [b.label, b.count])"
            />
            <CsvButton
              filename="engagement-detail-delegues"
              :headers="['delegateId', 'fullName', 'email', 'badgeType', t('scans.csv.sessionsFollowed')]"
              :rows="engagement.perDelegate.map(d => [d.delegateId, d.fullName, d.email, d.badgeType, d.sessions])"
            />
          </div>
        </div>
        <div v-if="engagement.total > 0" :style="{ position: 'relative', height: '240px' }">
          <Bar :data="engagementChart" :options="engagementOptions" />
        </div>
        <p v-else class="empty-msg">{{ t("scans.empty.noAudience") }}</p>
      </div>

      <!-- Timeline tri-source -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("scans.flowTitle") }} <InfoTooltip :text="t('scans.flowHint')" /></h3>
          <CsvButton
            filename="flux-scans-par-heure"
            :headers="[t('scans.csv.dayHour'), t('scans.csv.audienceRoom'), t('scans.csv.checkinEntrance'), t('scans.csv.zones')]"
            :rows="timeline.rows"
          />
        </div>
        <LineChart
          v-if="timeline.labels.length > 0"
          :labels="timeline.labels"
          :datasets="timeline.datasets"
          :height="260"
        />
        <p v-else class="empty-msg">{{ t("scans.empty.noTimestamped") }}</p>
      </div>

      <!-- Tableau détaillé (table + filtres + pagination + modal détail). -->
      <ScanDetailTable
        :scans="stats.all"
        :delegates="delegates"
        :zone-names="zoneNames"
        :recovered="stats.global.recoveredScans"
        :unmatched="stats.global.unmatchedScans"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import ChoroplethMap from "../charts/ChoroplethMap.vue";
import KpiCompareGrid from "../charts/KpiCompareGrid.vue";
import CsvButton from "../CsvButton.vue";
import InfoTooltip from "../InfoTooltip.vue";
import ScanDetailTable from "../ScanDetailTable.vue";
import { COUNTRY_CONTINENTS } from "../../utils/countries.js";
import { parisDateParts, toEpochMs, sessionDateShort } from "../../utils/parisTime.js";
import { fmt } from "@/utils/formatters.js";
import { getTypeColor } from "@/utils/typeColors.js";

const { t } = useI18n();

const props = defineProps({
  // Instance useRoomScans proprietee par StatisticsView (mutualisee avec ExportsTab + export MD).
  scansApi: { type: Object, required: true },
  // Scans de l'event compare (?compareWith=) — null si pas de comparaison.
  compareScansApi: { type: Object, default: null },
  // Delegues complets (avec badges) pour le modal "Details" : on resout le
  // delegate + son badge a partir du delegateId du scan.
  delegates: { type: Array, default: () => [] },
  eventName: { type: String, default: "" },
  compareEventName: { type: String, default: "" },
});

const { loading, refreshing, error, progress, stats, reload, zoneNames } = props.scansApi;

const g = computed(() => stats.value.global);
const audience = computed(() => stats.value.audience);

// --- Engagement : repartition des delegues par nombre de sessions salle suivies ---
// Tranches calquees sur l'engagement Vue d'ensemble (granularite fine adaptee aux
// congres ou un delegue peut suivre de nombreuses sessions).
const ENGAGEMENT_BUCKETS = ["1", "2-5", "6-10", "11-15", "16-20", "21-25", "26-30", "30+"];
function engagementBucketOf(n) {
  if (n <= 1) return "1";
  if (n <= 5) return "2-5";
  if (n <= 10) return "6-10";
  if (n <= 15) return "11-15";
  if (n <= 20) return "16-20";
  if (n <= 25) return "21-25";
  if (n <= 30) return "26-30";
  return "30+";
}
const engagement = computed(() => {
  const perDelegate = audience.value.sessionsPerDelegate || [];
  const counts = Object.fromEntries(ENGAGEMENT_BUCKETS.map((b) => [b, 0]));
  for (const d of perDelegate) counts[engagementBucketOf(d.sessions)]++;
  return {
    perDelegate,
    total: perDelegate.length,
    buckets: ENGAGEMENT_BUCKETS.map((label) => ({ label, count: counts[label] })),
  };
});
const engagementChart = computed(() => ({
  labels: ENGAGEMENT_BUCKETS,
  datasets: [{
    label: t("scans.csv.delegates"),
    data: engagement.value.buckets.map((b) => b.count),
    backgroundColor: "#1E4E66",
    borderRadius: 4,
  }],
}));
const engagementOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 13 },
    },
    tooltip: {
      callbacks: { label: (ctx) => t("scans.engagementTooltip", { n: ctx.raw.toLocaleString("fr-FR") }) },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } }, title: { display: true, text: t("scans.engagementAxisX"), font: { size: 12 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 }, precision: 0 }, beginAtZero: true },
  },
}));

// Nom lisible d'une zone : zone_id (= location.id) resolu via le gateway
// (cf. useRoomScans.zoneNames). Fallback sur l'id brut si non resolu.
function zoneName(id) {
  if (!id) return "";
  return zoneNames.value.get(id) || id;
}

// --- Presence par type de session (salle) + filtre du Top sessions audience ---
// Cliquer un type dans le camembert restreint "Top sessions par audience" a ce
// type (meme logique que Live/Replay). Le type vient du champ ES session_type.
const selectedSessionType = ref(null);
function onSessionTypeSelect(type) {
  selectedSessionType.value = selectedSessionType.value === type ? null : type;
}
const audienceSessionTypes = computed(() => audience.value.sessionTypes || []);
const totalSessionTypeScans = computed(() =>
  audienceSessionTypes.value.reduce((s, st) => s + st.scans, 0),
);
function pctOf(v, total) {
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(1)}%`;
}
// Top sessions filtre par le type selectionne : recalcule depuis les scans
// audience (qui portent desormais sessionType). Hors selection, on garde le top
// sessions deja calcule par computeAllScanStats. count = scans bruts ; uniqueDelegates
// = delegues distincts (placeholder '-' exclu, cf. isRealDelegateId).
const topSessions = computed(() => {
  if (!selectedSessionType.value) return audience.value.topSessions || [];
  const scans = (audience.value.scans || []).filter(
    (s) => (s.sessionType || "Non renseigné") === selectedSessionType.value,
  );
  const bySession = new Map();
  for (const s of scans) {
    if (!s.sessionId) continue;
    if (!bySession.has(s.sessionId)) {
      bySession.set(s.sessionId, { key: s.sessionId, label: s.sessionTitle || s.sessionId, start: s.sessionStart || null, count: 0, delegates: new Set() });
    }
    const e = bySession.get(s.sessionId);
    e.count++;
    if (s.delegateId && s.delegateId !== "-") e.delegates.add(s.delegateId);
  }
  return [...bySession.values()]
    .map((e) => ({ key: e.key, label: e.label, start: e.start, count: e.count, uniqueDelegates: e.delegates.size }))
    .sort((a, b) => b.count - a.count);
});

// --- Comparaison d'events (optionnelle) ---
// On affiche un KpiCompareGrid A | Δ | B des que compareScansApi est fourni et
// a fini de charger ses 3 index ES. Logique de delta calquee sur ComparisonTab.
const compareLoading = computed(() => props.compareScansApi?.loading?.value ?? false);
const gB = computed(() => props.compareScansApi?.stats?.value?.global || null);
const hasCompare = computed(() => !!props.compareScansApi);

function buildDeltaAbs(a, b, direction = "up") {
  if (a == null || b == null) return null;
  const diff = a - b;
  if (diff === 0) return { arrow: "=", text: "0", cls: "kpi-delta--neutral" };
  let cls = "kpi-delta--neutral";
  if (direction === "up") cls = diff > 0 ? "kpi-delta--good" : "kpi-delta--bad";
  if (direction === "down") cls = diff < 0 ? "kpi-delta--good" : "kpi-delta--bad";
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  return { arrow, text: `${sign}${fmt(Math.abs(diff))}`, cls };
}

const compareKpis = computed(() => {
  const a = g.value;
  const b = gB.value;
  if (!b) return [];
  const mk = (label, key) => ({
    label,
    a: { display: fmt(a[key] || 0) },
    b: { display: fmt(b[key] || 0) },
    delta: buildDeltaAbs(a[key] || 0, b[key] || 0, "up"),
  });
  return [
    mk(t("scans.compareKpi.roomViews"), "audienceUniqueDelegateSessions"),
    mk(t("scans.compareKpi.uniqueScanned"), "uniqueDelegatesAll"),
    mk(t("scans.compareKpi.uniqueRoom"), "uniqueAudienceDelegates"),
    mk(t("scans.compareKpi.sessions"), "distinctSessions"),
    mk(t("scans.compareKpi.rooms"), "distinctRooms"),
    mk(t("scans.compareKpi.zones"), "distinctZones"),
  ];
});

// --- Delegues uniques scannes par jour (toutes sources + detail par source) ---
const uniqueByDay = computed(() => {
  const total = stats.value.combined.uniqueDelegatesByDay || {};
  const audienceMap = stats.value.combined.uniqueDelegatesByDayAudience || {};
  const checkinMap = stats.value.combined.uniqueDelegatesByDayCheckin || {};
  const zoneMap = stats.value.combined.uniqueDelegatesByDayZone || {};
  // { day: { badgeType: count } } — pour empiler chaque barre par type de badge.
  const byType = stats.value.combined.uniqueDelegatesByDayByBadgeType || {};
  const labels = [...new Set([
    ...Object.keys(total),
    ...Object.keys(audienceMap),
    ...Object.keys(checkinMap),
    ...Object.keys(zoneMap),
  ])].sort();

  // Liste des types presents, tries par volume total decroissant (legende
  // stable + segments les plus gros en bas de pile).
  const typeTotals = {};
  for (const day of Object.keys(byType)) {
    for (const [type, count] of Object.entries(byType[day])) {
      typeTotals[type] = (typeTotals[type] || 0) + count;
    }
  }
  const badgeTypes = Object.keys(typeTotals).sort((a, b) => typeTotals[b] - typeTotals[a]);

  const barThickness = Math.max(12, Math.min(40, 500 / (labels.length || 1)));
  const datasets = badgeTypes.map((type) => ({
    label: type,
    data: labels.map((l) => byType[l]?.[type] || 0),
    backgroundColor: getTypeColor(type),
    borderRadius: 3,
    barThickness,
    stack: "delegates",
  }));

  return {
    labels,
    badgeTypes,
    chartData: { labels, datasets },
    rows: labels.map((l) => [
      l,
      total[l] || 0,
      audienceMap[l] || 0,
      checkinMap[l] || 0,
      zoneMap[l] || 0,
      ...badgeTypes.map((t) => byType[l]?.[t] || 0),
    ]),
  };
});

// --- Scans de zone par jour ---
// { day: { zoneId: count } } a partir des scans de zone bruts. 1 barre par jour,
// empilee par zone. On limite aux zones les plus actives (legende lisible) et
// on agrege le reste dans un segment "Autres".
const ZONE_DAY_TOP = 12;
const zoneByDay = computed(() => {
  const scans = stats.value.zone.scans || [];
  const byDay = {}; // day -> { zoneId: count }
  const zoneTotals = {}; // zoneId -> total
  for (const s of scans) {
    if (!s.zoneId) continue;
    const p = parisDateParts(toEpochMs(s.timestamp));
    if (!p) continue;
    const day = p.ymd;
    if (!byDay[day]) byDay[day] = {};
    byDay[day][s.zoneId] = (byDay[day][s.zoneId] || 0) + 1;
    zoneTotals[s.zoneId] = (zoneTotals[s.zoneId] || 0) + 1;
  }

  const labels = Object.keys(byDay).sort();
  const sortedZones = Object.keys(zoneTotals).sort((a, b) => zoneTotals[b] - zoneTotals[a]);
  const topZoneIds = sortedZones.slice(0, ZONE_DAY_TOP);
  const otherZoneIds = sortedZones.slice(ZONE_DAY_TOP);
  const sumOthers = (day) => otherZoneIds.reduce((sum, zid) => sum + (byDay[day]?.[zid] || 0), 0);

  const datasets = topZoneIds.map((zid) => ({
    label: truncate(zoneName(zid), 30),
    data: labels.map((d) => byDay[d]?.[zid] || 0),
    backgroundColor: getTypeColor(zoneName(zid)),
    borderRadius: 3,
    stack: "zones",
  }));
  if (otherZoneIds.length > 0) {
    datasets.push({
      label: t("scans.zoneByDay.others"),
      data: labels.map((d) => sumOthers(d)),
      backgroundColor: "#9CA3AF",
      borderRadius: 3,
      stack: "zones",
    });
  }

  // CSV : 1 ligne par jour, 1 colonne par zone (+ "Autres" si tronquage).
  const csvHeaders = [t("scans.csv.day"), ...topZoneIds.map((zid) => zoneName(zid))];
  if (otherZoneIds.length > 0) csvHeaders.push(t("scans.zoneByDay.others"));
  const rows = labels.map((d) => {
    const row = [d, ...topZoneIds.map((zid) => byDay[d]?.[zid] || 0)];
    if (otherZoneIds.length > 0) row.push(sumOthers(d));
    return row;
  });

  return { labels, datasets, csvHeaders, rows };
});

// Timeline tri-source : on bucke par "YYYY-MM-DD HH" et on aligne les 3 series.
const timeline = computed(() => {
  const audienceMap = flattenByHour(stats.value.audience.byHour);
  const checkinMap = flattenByHour(stats.value.checkin.byHour);
  const zoneMap = flattenByHour(stats.value.zone.byHour);
  const labelsSet = new Set([
    ...audienceMap.keys(),
    ...checkinMap.keys(),
    ...zoneMap.keys(),
  ]);
  const labels = [...labelsSet].sort();
  const audienceData = labels.map((l) => audienceMap.get(l) || 0);
  const checkinData = labels.map((l) => checkinMap.get(l) || 0);
  const zoneData = labels.map((l) => zoneMap.get(l) || 0);
  return {
    labels,
    datasets: [
      {
        label: t("scans.datasets.audienceRoom"),
        data: audienceData,
        borderColor: "#1E4E66",
        backgroundColor: "rgba(30,78,102,0.15)",
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: t("scans.datasets.checkinEntrance"),
        data: checkinData,
        borderColor: "#30DD92",
        backgroundColor: "rgba(48,221,146,0.15)",
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: t("scans.datasets.zones"),
        data: zoneData,
        borderColor: "#6F45FF",
        backgroundColor: "rgba(111,69,255,0.15)",
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
    rows: labels.map((l, i) => [l, audienceData[i], checkinData[i], zoneData[i]]),
  };
});

function flattenByHour(byDayHour) {
  // { day: { hour: count } } -> Map<"day HH", count>
  const map = new Map();
  for (const [day, hours] of Object.entries(byDayHour || {})) {
    for (const [hour, count] of Object.entries(hours)) {
      map.set(`${day} ${hour}h`, count);
    }
  }
  return map;
}

// Lookup delegue par id (pour les cartes geo des delegues scannes).
const delegateById = computed(() => {
  const m = new Map();
  for (const d of props.delegates || []) if (d?.id) m.set(d.id, d);
  return m;
});

// ─── Répartition géographique des délégués SCANNÉS (présence onsite) ─────────
// Délégués distincts scannés (salle/checkin/zone, '-' exclu, delegateId récupéré
// inclus) rapprochés à un pays via leur adresse. Force le remount des cartes
// (construites au mount) via une clé qui suit le volume.
const geoCountries = computed(() => {
  const seen = new Set();
  const map = {};
  for (const s of stats.value.all || []) {
    if (!s.delegateId || s.delegateId === "-" || seen.has(s.delegateId)) continue;
    seen.add(s.delegateId);
    const d = delegateById.value.get(s.delegateId);
    const code = d?.primaryAddress?.countryCode || d?.primaryAddress?.country?.code;
    if (!code) continue;
    map[code] = (map[code] || 0) + 1;
  }
  return Object.entries(map)
    .map(([value, totalCount]) => ({ value, totalCount }))
    .sort((a, b) => b.totalCount - a.totalCount);
});
const geoCountriesEurope = computed(() =>
  geoCountries.value.filter((c) => COUNTRY_CONTINENTS[(c.value || "").toUpperCase()] === "Europe"),
);
const geoCacheKey = computed(() => `${geoCountries.value.length}-${stats.value.all?.length || 0}`);

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
// Libelle d'une session de top : "JJ/MM : titre" (date en prefixe si connue).
function sessionLabel(s) {
  const d = sessionDateShort(s.start);
  return d ? `${d} : ${s.label}` : s.label;
}
</script>

<style scoped>
.scans-state {
  text-align: center; padding: 60px 20px;
}
/* Mention "entree non scannee" : ton attenue pour ne pas alarmer (vs un "0"). */
.entree-note { opacity: 0.6; font-style: italic; }
.scans-progress { font-size: 14px; color: var(--text-muted); margin-top: 8px; }
.scans-hint { font-size: 13px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
.scans-hint code {
  background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
  font-family: "Fira Code", monospace; font-size: 12px;
}

.doughnut-wrap {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.legend-row { justify-content: center; flex-wrap: wrap; gap: 6px; }
.legend-pill {
  display: inline-flex; align-items: center; gap: 4px;
}
.legend-pill .dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
}

.muted { font-size: 12px; color: var(--text-muted); }

/* Camembert "Presence par type de session" + legende cliquable (filtre). */
.origin-pie-wrap {
  display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: center;
}
.origin-pie { width: 200px; }
.origin-legend { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.origin-legend-row {
  display: grid; grid-template-columns: 12px 1fr auto auto;
  align-items: center; gap: 8px;
}
.origin-legend-row.clickable {
  cursor: pointer; padding: 3px 6px; border-radius: 6px; transition: background .15s;
}
.origin-legend-row.clickable:hover { background: #f3f4f6; }
.origin-legend-row.clickable.active { background: rgba(48,221,146,0.12); }
.origin-legend-row.clickable.active strong { color: #047857; }
.origin-swatch { width: 12px; height: 12px; border-radius: 3px; }
.origin-name { color: var(--text); }
.origin-legend-row strong { color: var(--text); font-weight: 700; }
.origin-sub { color: var(--text-muted); font-size: 13px; min-width: 50px; text-align: right; }

.filter-active-bar {
  margin-top: 12px; padding: 8px 12px;
  background: rgba(48,221,146,0.10); border: 1px solid rgba(48,221,146,0.3);
  border-radius: 8px; font-size: 14px; color: var(--text);
  display: flex; align-items: center; gap: 12px;
}
.filter-clear {
  margin-left: auto; padding: 3px 8px;
  background: #fff; border: 1px solid #d1d5db; border-radius: 4px;
  cursor: pointer; font-size: 13px; color: #646464;
}
.filter-clear:hover { background: #f3f4f6; }

@media (max-width: 700px) {
  .origin-pie-wrap { grid-template-columns: 1fr; }
  .origin-pie { width: 160px; margin: 0 auto; }
}
</style>
