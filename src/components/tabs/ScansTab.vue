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

      <!-- Top sessions (filtre par le type de session selectionne ci-dessus) -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>
            {{ t("scans.topSessionsTitle") }} <InfoTooltip :text="t('scans.topSessionsHint')" />
            <span v-if="selectedSessionType" class="muted">{{ t("viewers.charts.filtered") }}</span>
          </h3>
          <CsvButton
            filename="top-sessions"
            :headers="[t('scans.csv.session'), t('scans.csv.scans'), t('scans.csv.uniqueDelegates')]"
            :rows="topSessions.map(s => [s.label, s.count, s.uniqueDelegates])"
          />
        </div>
        <HBarChart
          v-if="topSessions.length > 0"
          :labels="topSessions.map(s => truncate(s.label, 60))"
          :data="topSessions.map(s => s.count)"
          :height="Math.max(220, topSessions.length * 22 + 40)"
          color="#1E4E66"
        />
        <p v-else class="empty-msg">{{ t("scans.empty.noAudience") }}</p>
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

      <!-- Tableau detaille -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("scans.detailTitle", { n: fmt(stats.all.length) }) }} <InfoTooltip :text="t('scans.detailHint')" /></h3>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <div class="period-selector">
              <button
                v-for="opt in kindFilterOptions"
                :key="opt.value"
                :class="['period-btn', { active: kindFilter === opt.value }]"
                @click="kindFilter = opt.value"
              >{{ opt.label }}</button>
            </div>
            <div class="detail-date-filter">
              <label>{{ t("scans.detailDate.from") }}
                <input v-model="detailFrom" type="date" :max="detailTo || undefined" />
              </label>
              <label>{{ t("scans.detailDate.to") }}
                <input v-model="detailTo" type="date" :min="detailFrom || undefined" />
              </label>
              <button
                v-if="hasDetailDateFilter"
                class="detail-date-clear"
                :title="t('scans.detailDate.clear')"
                @click="clearDetailDate"
              >✕</button>
            </div>
            <div class="detail-qr-filter">
              <input
                v-model="qrFilter"
                type="search"
                class="qr-filter-input"
                :placeholder="t('scans.qrFilter.placeholder')"
                :title="t('scans.qrFilter.title')"
              />
              <button
                v-if="hasQrFilter"
                class="detail-date-clear"
                :title="t('scans.qrFilter.clear')"
                @click="clearQrFilter"
              >✕</button>
            </div>
            <CsvButton
              filename="scans-detail"
              :headers="[t('scans.csv.type'), t('scans.csv.timestamp'), t('scans.csv.qrCode'), 'delegateId', 'badgeId', 'fullName', 'email', 'badgeType', 'sessionId', 'sessionTitle', 'sessionStart', 'roomName', 'industryName', t('scans.csv.zone'), t('scans.csv.direction')]"
              :rows="filteredScans.map(s => [s.kind, formatTimestamp(s.timestamp), s.rawQrCode || '', s.delegateId || '', s.badgeId || '', s.fullName, s.email, s.badgeType, s.sessionId || '', s.sessionTitle || '', formatTimestamp(s.sessionStart) || '', s.roomName || '', s.industryName || '', s.kind === 'zone' ? zoneName(s.zoneId) : '', s.direction])"
            />
          </div>
        </div>
        <p
          v-if="stats.global.recoveredScans.total > 0 || stats.global.unmatchedScans.total > 0"
          class="scans-recovery-note"
        >
          {{ t("scans.recoveryNote", {
            recovered: fmt(stats.global.recoveredScans.total),
            unmatched: fmt(stats.global.unmatchedScans.total),
          }) }}
          <InfoTooltip :text="t('scans.recoveryHint')" />
        </p>
        <div v-if="filteredScans.length > 0" class="scans-table-wrap">
          <table class="data-table scans-detail-table">
            <thead>
              <tr>
                <th></th>
                <th>{{ t("scans.csv.type") }}</th>
                <th>{{ t("scans.csv.timestamp") }}</th>
                <th>{{ t("scans.csv.qrCode") }}</th>
                <th>delegateId</th>
                <th>badgeId</th>
                <th>fullName</th>
                <th>email</th>
                <th>badgeType</th>
                <th>sessionId</th>
                <th>sessionTitle</th>
                <th>sessionStart</th>
                <th>roomName</th>
                <th>{{ t("scans.csv.zone") }}</th>
                <th>{{ t("scans.csv.direction") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in pagedScans" :key="s.kind + '-' + s.id">
                <td><button class="detail-btn" type="button" @click="openDetail(s)">{{ t("scans.detailRow.button") }}</button></td>
                <td><span class="kind-pill" :class="'kind-' + s.kind">{{ kindLabel(s.kind) }}</span></td>
                <td>{{ formatTimestamp(s.timestamp) }}</td>
                <td class="mono" :title="s.rawQrCode">{{ s.rawQrCode || '—' }}</td>
                <td :class="['mono', { 'cell-enriched': s.recovered }]" :title="s.recovered ? t('scans.recoveredTag') : null">{{ s.delegateId || '—' }}</td>
                <td :class="['mono', { 'cell-enriched': s.badgeIdEnriched }]" :title="s.badgeId">{{ s.badgeId || '—' }}</td>
                <td :class="{ 'cell-enriched': s.fullNameEnriched }" :title="s.fullName">{{ s.fullName }}</td>
                <td :class="{ 'cell-enriched': s.emailEnriched }" :title="s.email">{{ s.email || '—' }}</td>
                <td :class="{ 'cell-enriched': s.badgeTypeEnriched }">{{ s.badgeType }}</td>
                <td class="mono">{{ s.sessionId || '—' }}</td>
                <td :title="s.sessionTitle">{{ s.sessionTitle || '—' }}</td>
                <td>{{ formatTimestamp(s.sessionStart) || '—' }}</td>
                <td :title="s.roomName">{{ s.roomName || '—' }}</td>
                <td>{{ s.kind === 'zone' ? (zoneName(s.zoneId) || '—') : '—' }}</td>
                <td>{{ directionLabel(s.direction) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredScans.length > pageSize" class="scans-hint">
            {{ t("scans.pageHint", { size: pageSize, total: fmt(filteredScans.length) }) }}
          </p>
        </div>
        <p v-else class="empty-msg">{{ t("scans.empty.noMatch") }}</p>
      </div>
    </template>

    <!-- Modal "Details" d'une ligne de scan : donnees brutes ES + delegue + badge. -->
    <div v-if="detailRow" class="scan-modal-overlay" @click.self="closeDetail">
      <div class="scan-modal" role="dialog" aria-modal="true">
        <div class="scan-modal-head">
          <h3>{{ t("scans.detailRow.title") }}</h3>
          <button class="scan-modal-close" type="button" :title="t('scans.detailRow.close')" @click="closeDetail">✕</button>
        </div>
        <div class="scan-modal-body">
          <!-- Donnees indexees dans l'ES (raw _source du scan) -->
          <section class="scan-modal-section">
            <h4>{{ t("scans.detailRow.esSection") }} <span class="src-pill src-es">ES</span></h4>
            <table class="kv-table">
              <tbody>
                <tr v-for="[k, v] in detailEntries(detailRow.scan.raw)" :key="'es-' + k">
                  <th>{{ k }}</th><td class="mono">{{ fmtVal(v) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Donnees du delegue (registration, via jointure app) -->
          <section class="scan-modal-section">
            <h4>{{ t("scans.detailRow.delegateSection") }} <span class="src-pill src-app">APP</span></h4>
            <p v-if="!detailRow.delegate" class="scan-modal-empty">{{ t("scans.detailRow.delegateNotFound") }}</p>
            <table v-else class="kv-table">
              <tbody>
                <tr><th>id</th><td class="mono">{{ detailRow.delegate.id }}</td></tr>
                <tr><th>givenName</th><td>{{ detailRow.delegate.givenName || '—' }}</td></tr>
                <tr><th>familyName</th><td>{{ detailRow.delegate.familyName || '—' }}</td></tr>
                <tr><th>email</th><td>{{ detailRow.delegate.email || '—' }}</td></tr>
                <tr><th>status</th><td>{{ detailRow.delegate.status || '—' }}</td></tr>
                <tr><th>occupation</th><td>{{ detailRow.delegate.occupation || '—' }}</td></tr>
                <tr><th>company</th><td>{{ detailRow.delegate.company || '—' }}</td></tr>
                <tr><th>country</th><td>{{ detailRow.delegate.primaryAddress?.country?.code || detailRow.delegate.primaryAddress?.countryCode || '—' }}</td></tr>
                <tr><th>checkedInDate</th><td class="mono">{{ detailRow.delegate.checkedInDate || '—' }}</td></tr>
                <tr><th>externalId</th><td class="mono">{{ detailRow.delegate.externalId || '—' }}</td></tr>
                <tr><th>createdAt</th><td class="mono">{{ detailRow.delegate.createdAt || '—' }}</td></tr>
              </tbody>
            </table>
          </section>

          <!-- Donnees du badge correspondant -->
          <section class="scan-modal-section">
            <h4>{{ t("scans.detailRow.badgeSection") }} <span class="src-pill src-app">APP</span></h4>
            <p v-if="!detailRow.badge" class="scan-modal-empty">{{ t("scans.detailRow.badgeNotFound") }}</p>
            <table v-else class="kv-table">
              <tbody>
                <tr><th>id</th><td class="mono">{{ detailRow.badge.id }}</td></tr>
                <tr><th>type</th><td>{{ detailRow.badge.type || '—' }}</td></tr>
                <tr><th>qrCode.value</th><td class="mono">{{ detailRow.badge.qrCode?.value || '—' }}</td></tr>
                <tr><th>qrCode.decodedValue</th><td class="mono">{{ detailRow.badge.qrCode?.decodedValue || '—' }}</td></tr>
                <tr><th>deliveredAt</th><td class="mono">{{ detailRow.badge.deliveredAt || '—' }}</td></tr>
                <tr><th>storage.publicUrl</th><td><a v-if="detailRow.badge.storage?.publicUrl" :href="detailRow.badge.storage.publicUrl" target="_blank" class="mono">PDF</a><span v-else>—</span></td></tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
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
import { COUNTRY_CONTINENTS } from "../../utils/countries.js";
import { parisDateParts } from "../../utils/parisTime.js";
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
      bySession.set(s.sessionId, { key: s.sessionId, label: s.sessionTitle || s.sessionId, count: 0, delegates: new Set() });
    }
    const e = bySession.get(s.sessionId);
    e.count++;
    if (s.delegateId && s.delegateId !== "-") e.delegates.add(s.delegateId);
  }
  return [...bySession.values()]
    .map((e) => ({ key: e.key, label: e.label, count: e.count, uniqueDelegates: e.delegates.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
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
    let parsed = s.timestamp;
    if (typeof parsed === "number" && parsed < 10 ** 12) parsed = parsed * 1000;
    const p = parisDateParts(parsed);
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

// --- Tableau detaille ---
const kindFilter = ref("all");
const kindFilterOptions = computed(() => [
  { value: "all", label: t("scans.kind.all") },
  { value: "audience", label: t("scans.kind.room") },
  { value: "checkin", label: t("scans.kind.entrance") },
  { value: "zone", label: t("scans.kind.zone") },
]);
const pageSize = 200;

// Filtre de date LOCAL au tableau de detail (independant du filtre date global) :
// bornes YMD inclusives, vides = non bornees. Filtre aussi le CSV (meme source).
const detailFrom = ref("");
const detailTo = ref("");
const hasDetailDateFilter = computed(() => !!detailFrom.value || !!detailTo.value);
function clearDetailDate() {
  detailFrom.value = "";
  detailTo.value = "";
}

// Lookup delegue par id (pour le modal "Details").
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

// Modal "Details" d'une ligne de scan : null = ferme, sinon { scan, delegate, badge }.
const detailRow = ref(null);
function openDetail(scan) {
  const delegate = scan.delegateId ? delegateById.value.get(scan.delegateId) || null : null;
  // Badge correspondant : par badge_id ES si dispo, sinon 1er badge dont le QR
  // matche le raw_qr_code, sinon 1er badge du delegue.
  let badge = null;
  if (delegate?.badges?.length) {
    badge =
      (scan.badgeId && delegate.badges.find((b) => b.id === scan.badgeId)) ||
      delegate.badges.find((b) =>
        [b.qrCode?.value, b.qrCode?.decodedValue].some(
          (q) => q && String(q).toLowerCase().replace(/[^a-z0-9]/g, "") ===
            String(scan.rawQrCode || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        ),
      ) ||
      delegate.badges[0];
  }
  detailRow.value = { scan, delegate, badge };
}
function closeDetail() {
  detailRow.value = null;
}
// Entrees du _source ES (triees, valeurs vides en dernier) pour le tableau du modal.
function detailEntries(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).sort((a, b) => a[0].localeCompare(b[0]));
}
// Affichage lisible d'une valeur ES (objets -> JSON, null/undefined -> '—').
function fmtVal(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Filtre par QR code : recherche insensible casse/espaces dans le raw_qr_code
// du scan (contains). Utile pour tracer un badge precis.
const qrFilter = ref("");
const hasQrFilter = computed(() => !!qrFilter.value.trim());
function clearQrFilter() {
  qrFilter.value = "";
}

// Jour Paris (YMD) d'un scan, avec l'heuristique ms/secondes habituelle.
function scanDay(ts) {
  if (!ts) return null;
  let parsed = ts;
  if (typeof ts === "number" && ts < 10 ** 12) parsed = ts * 1000;
  const p = parisDateParts(parsed);
  return p ? p.ymd : null;
}

const filteredScans = computed(() => {
  const all = stats.value.all || [];
  let result = [...all].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  if (kindFilter.value !== "all") result = result.filter((s) => s.kind === kindFilter.value);
  const from = detailFrom.value;
  const to = detailTo.value;
  if (from || to) {
    result = result.filter((s) => {
      const day = scanDay(s.timestamp);
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }
  const qr = qrFilter.value.trim().toLowerCase();
  if (qr) {
    result = result.filter((s) => (s.rawQrCode || "").toLowerCase().includes(qr));
  }
  return result;
});
const pagedScans = computed(() => filteredScans.value.slice(0, pageSize));

function scanTarget(s) {
  if (s.kind === "audience") return s.sessionTitle || s.sessionId || "—";
  if (s.kind === "zone") return s.zoneId || "—";
  return t("scans.kind.congressEntrance");
}
function kindLabel(k) {
  if (k === "audience") return t("scans.kind.room");
  if (k === "checkin") return t("scans.kind.entrance");
  if (k === "zone") return t("scans.kind.zone");
  return k;
}
function directionLabel(d) {
  if (d === "in") return t("scans.direction.in");
  if (d === "out") return t("scans.direction.out");
  return "—";
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function formatTimestamp(ts) {
  if (!ts) return "—";
  let parsed = ts;
  if (typeof ts === "number" && ts < 10 ** 12) parsed = ts * 1000;
  const p = parisDateParts(parsed);
  if (!p) return String(ts);
  return `${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
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

/* Note de re-association client-side (scans '-' rattaches via le QR). */
.scans-recovery-note {
  font-size: 13px; color: var(--text-muted); margin: 0 0 10px;
  display: flex; align-items: center; gap: 6px;
}
/* Cellules dont la valeur est ENRICHIE par l'app (jointure délégué/badge) et ne
   provient PAS de l'index ES : fond vert léger + filet accent à gauche, visible
   mais sobre. */
.cell-enriched {
  background: rgba(48, 221, 146, 0.14);
  box-shadow: inset 2px 0 0 var(--accent, #30dd92);
}

/* Bouton "details" par ligne de scan. */
.detail-btn {
  border: 1px solid var(--border, #d1d5db); background: #fff; border-radius: 4px;
  padding: 1px 8px; font-size: 11px; color: var(--primary, #1e4e66);
  cursor: pointer; white-space: nowrap; font-family: inherit;
}
.detail-btn:hover { background: var(--primary, #1e4e66); color: #fff; border-color: var(--primary, #1e4e66); }

/* Modal "Details" d'une ligne de scan. */
.scan-modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
  padding: 20px;
}
.scan-modal {
  background: #fff; border-radius: 10px; width: 100%; max-width: 640px;
  max-height: 85vh; display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.scan-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #eee;
}
.scan-modal-head h3 { margin: 0; font-size: 16px; color: #254f65; }
.scan-modal-close {
  border: none; background: transparent; font-size: 18px; cursor: pointer;
  color: #646464; line-height: 1; padding: 2px 6px;
}
.scan-modal-close:hover { color: #1e4e66; }
.scan-modal-body { padding: 16px 18px; overflow: auto; }
.scan-modal-section { margin-bottom: 18px; }
.scan-modal-section:last-child { margin-bottom: 0; }
.scan-modal-section h4 {
  margin: 0 0 8px; font-size: 13px; color: #1e4e66; text-transform: uppercase;
  letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px;
}
.src-pill {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  text-transform: none; letter-spacing: 0;
}
.src-pill.src-es { background: #e6eef3; color: #1e4e66; }
.src-pill.src-app { background: #e3f9ee; color: #1a8f5e; }
.scan-modal-empty { font-size: 13px; color: var(--text-muted, #646464); font-style: italic; margin: 0; }
.kv-table { width: 100%; border-collapse: collapse; }
.kv-table th {
  text-align: left; font-weight: 600; color: #646464; font-size: 12px;
  padding: 3px 10px 3px 0; vertical-align: top; white-space: nowrap; width: 1%;
}
.kv-table td { font-size: 12px; color: #414141; padding: 3px 0; word-break: break-word; }

.scans-table-wrap { max-height: 600px; overflow: auto; }
.scans-table-wrap .data-table th {
  position: sticky; top: 0; z-index: 2;
}
.scans-detail-table { min-width: 1400px; }
/* Chaque ligne reste sur une seule ligne : pas de wrap qui fait grandir la
   hauteur de cellule. Le texte long est tronqué (ellipsis), le scroll
   horizontal du wrapper permet de tout voir. */
.scans-detail-table td {
  white-space: nowrap;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scans-detail-table .mono {
  font-family: "Fira Code", Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.kind-pill {
  display: inline-block; padding: 1px 7px;
  font-size: 12px; font-weight: 600;
  border-radius: 8px; color: #fff;
}
.kind-pill.kind-audience { background: #1E4E66; }
.kind-pill.kind-checkin { background: #30DD92; color: #0a3a23; }
.kind-pill.kind-zone { background: #6F45FF; }

.muted { font-size: 12px; color: var(--text-muted); }

.period-selector { display: flex; gap: 3px; }
.period-btn {
  padding: 3px 10px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 12px; cursor: pointer; color: #646464;
  font-weight: 500;
}
.period-btn.active { background: #1E4E66; color: #fff; border-color: #1E4E66; }

.detail-date-filter { display: flex; gap: 6px; align-items: center; }
.detail-date-filter label {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #646464; font-weight: 500;
}
.detail-date-filter input[type="date"] {
  border: 1px solid #d1d5db; border-radius: 4px; padding: 2px 6px;
  font-size: 12px; color: #414141; font-family: inherit;
}
.detail-date-clear {
  border: 1px solid #d1d5db; background: #fff; border-radius: 4px;
  width: 22px; height: 22px; cursor: pointer; color: #646464; font-size: 12px;
  display: inline-flex; align-items: center; justify-content: center;
}
.detail-date-clear:hover { background: #f3f4f6; color: #1E4E66; }
.detail-qr-filter { display: flex; gap: 6px; align-items: center; }
.qr-filter-input {
  border: 1px solid #d1d5db; border-radius: 4px; padding: 3px 8px;
  font-size: 12px; color: #414141; font-family: inherit; min-width: 180px;
}
.qr-filter-input:focus {
  outline: none; border-color: var(--primary, #1e4e66);
}

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
