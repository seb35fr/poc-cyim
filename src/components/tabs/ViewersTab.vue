<template>
  <div>
    <div v-if="loading" class="viewers-state">
      <div class="spinner"></div>
      <p class="loading-label">{{ L.loadingLabel }}</p>
      <p class="viewers-progress">{{ t("viewers.viewsLoaded", { n: fmt(progress.loaded) }) }}</p>
    </div>

    <div v-else-if="error" class="viewers-state error-state">
      <p><strong>{{ t("viewers.esError") }}</strong> {{ error }}</p>
      <p class="viewers-hint">
        {{ t("viewers.esHintPre") }} <code>VITE_ES_URL</code> {{ t("viewers.esHintMid") }}
        <code>{{ L.esIndex }}</code> {{ t("viewers.esHintPost") }}
      </p>
      <button class="btn-side" @click="reload">{{ t("states.retry") }}</button>
    </div>

    <template v-else>
      <div v-if="refreshing" class="refresh-bar-wrapper">
        <div class="refresh-bar">
          <div class="refresh-bar-fill" :style="{ width: '50%' }"></div>
        </div>
        <p class="refresh-bar-text">{{ t("viewers.refreshing") }}</p>
      </div>

      <!-- KPI principal -->
      <div class="kpi-grid">
        <div class="kpi-card green">
          <div class="kpi-label">{{ L.uniqueKpi }}</div>
          <div class="kpi-value">{{ fmt(g.uniqueUsers) }}</div>
          <div class="kpi-sub">{{ L.uniqueKpiSub }}</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-label">{{ L.remoteKpi }}</div>
          <div class="kpi-value">{{ fmt(uniqueUsersWithoutCheckin) }}</div>
          <div class="kpi-sub">
            {{ L.remoteKpiSub }}
            <span v-if="joinStats.unknown > 0">
              {{ t("viewers.kpi.unlinkedViewers", { n: fmt(joinStats.unknown) }) }}
            </span>
          </div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-label">{{ t("viewers.kpi.totalViews") }}</div>
          <div class="kpi-value">{{ fmt(g.totalViews) }}</div>
          <div class="kpi-sub">{{ t("viewers.kpi.distinctSessions", { n: fmt(g.distinctSessions) }) }}</div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-label">{{ t("viewers.kpi.avgDuration") }}</div>
          <div class="kpi-value">{{ formatDuration(g.avgViewDurationSec) }}</div>
          <div class="kpi-sub">{{ t("viewers.kpi.totalDuration", { dur: formatDuration(g.totalDurationSec) }) }}</div>
        </div>
        <!-- "Vues par origine" : doughnut + legende (% et absolu) directement
             dans l'indicateur. Meme format pour Live ET Replay. -->
        <div class="kpi-card blue kpi-origin" v-if="stats.origins && stats.origins.length > 0">
          <div class="kpi-label">{{ t("viewers.charts.byOrigin") }}</div>
          <div class="kpi-origin-body">
            <div class="kpi-origin-pie">
              <DoughnutChart
                :labels="stats.origins.map(o => o.origin)"
                :data="stats.origins.map(o => o.views)"
                :colors="ORIGIN_COLORS"
              />
            </div>
            <div class="kpi-origin-legend">
              <div v-for="(o, i) in stats.origins" :key="o.origin" class="kpi-origin-row">
                <span class="origin-swatch" :style="{ background: ORIGIN_COLORS[i % ORIGIN_COLORS.length] }"></span>
                <span class="kpi-origin-name">{{ o.origin }}</span>
                <strong>{{ fmt(o.views) }}</strong>
                <span class="kpi-origin-pct">{{ pctOf(o.views, totalOriginViews) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Repartition geographique (monde | Europe) des delegues uniques ayant
           consulte (live/replay), rapproches a un delegue avec une adresse pays. -->
      <div class="charts-row" v-if="geoCountries.length > 0">
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("maps.worldTitle") }} <InfoTooltip :text="t('viewers.charts.geoHint')" /></h3>
            <CsvButton
              :filename="`${kind}-delegues-par-pays-monde`"
              :headers="[t('maps.csv.countryCode'), t('viewers.csv.uniqueDelegates')]"
              :rows="geoCountries.map(c => [c.value, c.totalCount])"
            />
          </div>
          <ChoroplethMap :key="`world-${geoCacheKey}`" :countries="geoCountries" scope="world" :show-legend="true" :height="420" />
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("maps.europeTitle") }} <InfoTooltip :text="t('viewers.charts.geoHint')" /></h3>
            <CsvButton
              :filename="`${kind}-delegues-par-pays-europe`"
              :headers="[t('maps.csv.countryCode'), t('viewers.csv.uniqueDelegates')]"
              :rows="geoCountriesEurope.map(c => [c.value, c.totalCount])"
            />
          </div>
          <ChoroplethMap :key="`europe-${geoCacheKey}`" :countries="geoCountries" scope="europe" :show-legend="true" :height="420" />
        </div>
      </div>

      <!-- Delegues uniques par jour (gauche) / par chaine (droite, live) -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ L.byDayTitle }} <InfoTooltip v-if="kind === 'live'" :text="t('viewers.charts.byBadgeTypeClickHint')" /></h3>
            <CsvButton
              :filename="`${kind}-delegues-uniques-par-jour`"
              :headers="kind === 'replay'
                ? [t('viewers.csv.day'), t('viewers.csv.uniqueDelegates'), t('viewers.csv.newDelegates'), t('viewers.csv.cumulDelegates')]
                : [t('viewers.csv.day'), t('viewers.csv.uniqueDelegates'), ...byDayByBadgeType.types.map(viewerTypeLbl)]"
              :rows="kind === 'replay'
                ? stats.uniqueByDay.map((d, i) => [d.day, d.count, stats.newUniqueByDay[i]?.count ?? '', stats.cumulativeUniqueByDay[i]?.count ?? ''])
                : byDayByBadgeType.labels.map((day, i) => [day, byDayByBadgeType.types.reduce((s, t) => s + (byDayByBadgeType.perDayType[i][t] || 0), 0), ...byDayByBadgeType.types.map(t => byDayByBadgeType.perDayType[i][t] || 0)])"
            />
          </div>
          <!-- Live : empile par type de badge (legende). Replay : uniques + cumul.
               Live : clic sur un TYPE DE BADGE dans la legende -> filtre le tableau
               de detail ci-dessous (legende-filtre, pas de toggle de visibilite). -->
          <StackedBarChart
            v-if="kind === 'live' && byDayByBadgeType.labels.length > 0"
            :labels="byDayByBadgeType.labels"
            :datasets="byDayByBadgeType.datasets"
            :show-total="true"
            :height="300"
            :legend-selectable="true"
            :active-legend="selectedBadgeType"
            @select-legend="onBadgeTypeSelect"
          />
          <div v-else-if="stats.uniqueByDay.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="byDayChart" :options="byDayOptions" />
          </div>
          <p v-else class="empty-msg">{{ L.byDayEmpty }}</p>
          <div v-if="kind === 'live' && selectedBadgeType" class="filter-active-bar">
            {{ t("viewers.charts.filterActive") }} <strong>{{ selectedBadgeType }}</strong>
            <button class="filter-clear" @click="selectedBadgeType = null">{{ t("viewers.charts.clearFilter") }}</button>
          </div>
        </div>
        <div class="chart-card" v-if="kind === 'live' && byDayChannel.channels.length > 0">
          <div class="chart-header">
            <h3>{{ t("viewers.charts.byDayChannel") }} <InfoTooltip :text="t('viewers.charts.byDayChannelHintPre') + ' channel_id ' + t('viewers.charts.byDayChannelHintPost')" /></h3>
            <CsvButton
              filename="live-delegues-uniques-par-jour-chaine"
              :headers="[t('viewers.csv.day'), ...byDayChannel.channels.map(c => `${c.label} (${c.id})`)]"
              :rows="byDayChannel.days.map(d => [d, ...byDayChannel.channels.map(c => byDayChannel.byDay[d]?.[c.id] || 0)])"
            />
          </div>
          <div :style="{ position: 'relative', height: '300px' }">
            <Bar :data="byDayChannelChart" :options="byDayChannelOptions" />
          </div>
        </div>
        <!-- Replay : vues par jour (barres) + vues cumulées (courbe) a droite
             des delegues uniques par jour. -->
        <div class="chart-card" v-else-if="kind === 'replay'">
          <div class="chart-header">
            <h3>{{ t("viewers.charts.replayViewsByDay") }}</h3>
            <CsvButton
              filename="replay-vues-par-jour"
              :headers="[t('viewers.csv.day'), t('viewers.csv.views'), t('viewers.csv.cumulViews')]"
              :rows="replayViewsByDay.map((d, i) => [d.day, d.count, stats.cumulativeViewsByDay[i]?.count ?? ''])"
            />
          </div>
          <div v-if="replayViewsByDay.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="replayViewsByDayChart" :options="replayViewsByDayOptions" />
          </div>
          <p v-else class="empty-msg">{{ t("viewers.charts.replayViewsByDayEmpty") }}</p>
        </div>
      </div>

      <!-- Présents physiques qui consultent du replay (replay uniquement) :
           évolution journalière (délégués uniques + vues) à gauche, cumul des
           délégués distincts à droite. -->
      <div class="charts-row" v-if="kind === 'replay'">
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("viewers.charts.physicalReplayDaily") }} <InfoTooltip :text="t('viewers.charts.physicalReplayHint')" /></h3>
            <span class="viewers-hint" style="margin-left: auto">
              {{ t("viewers.charts.physicalReplaySummary", { delegates: fmt(physicalReplayTotals.uniqueDelegates), views: fmt(physicalReplayTotals.views) }) }}
            </span>
            <CsvButton
              filename="replay-presents-physiques-par-jour"
              :headers="[t('viewers.csv.day'), t('viewers.csv.physicalUniqueDelegates'), t('viewers.csv.replayViews'), t('viewers.csv.replayCumulViews')]"
              :rows="physicalReplayDaily.map((d, i, arr) => [d.day, d.uniqueDelegates, d.views, arr.slice(0, i + 1).reduce((s, x) => s + x.views, 0)])"
            />
          </div>
          <div v-if="physicalReplayDaily.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="physicalReplayChart" :options="physicalReplayOptions" />
          </div>
          <p v-else class="empty-msg">{{ t("viewers.charts.physicalReplayEmpty") }}</p>
        </div>
        <!-- Vues en replay par jour pour les PRESENTS PHYSIQUES (barres) +
             vues cumulees (courbe), a droite des presents physiques par jour. -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("viewers.charts.physicalReplayViews") }}</h3>
            <CsvButton
              filename="replay-vues-par-jour-presents-physiques"
              :headers="[t('viewers.csv.day'), t('viewers.csv.viewsPhysical'), t('viewers.csv.cumulViews')]"
              :rows="physicalReplayDaily.map((d, i, arr) => [d.day, d.views, arr.slice(0, i + 1).reduce((s, x) => s + x.views, 0)])"
            />
          </div>
          <div v-if="physicalReplayDaily.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="physicalReplayViewsChart" :options="replayViewsByDayOptions" />
          </div>
          <p v-else class="empty-msg">{{ t("viewers.charts.physicalReplayViewsEmpty") }}</p>
        </div>
      </div>

      <!-- Delegues uniques par tranche de 30 min de session_end (live uniquement —
           le pipeline VOD ne suit pas le timing live des sessions). -->
      <div class="chart-card" v-if="kind === 'live' && stats.uniqueBy30min">
        <div class="chart-header">
          <h3>{{ t("viewers.charts.by30min") }}</h3>
          <CsvButton
            filename="live-delegues-uniques-30min"
            :headers="[t('viewers.csv.slot'), t('viewers.csv.uniqueDelegates')]"
            :rows="stats.uniqueBy30min.map(s => [s.slot, s.count])"
          />
        </div>
        <div v-if="stats.uniqueBy30min.length > 0" :style="{ position: 'relative', height: '320px' }">
          <Bar :data="by30minChart" :options="by30minOptions" />
        </div>
        <p v-else class="empty-msg">{{ t("viewers.charts.by30minEmpty") }}</p>
      </div>

      <!-- Replay : cumul des délégués distincts ayant consulté du replay
           (déplacé depuis la Vue d'ensemble), au-dessus du top sessions. -->
      <div class="chart-card" v-if="kind === 'replay' && replayCumulByDay.length > 0">
        <div class="chart-header">
          <h3>{{ t("viewers.charts.replayCumul") }} <InfoTooltip :text="t('viewers.charts.replayCumulHint')" /></h3>
          <CsvButton
            filename="replay-cumul-delegues"
            :headers="[t('viewers.csv.day'), t('viewers.csv.cumulDelegates')]"
            :rows="replayCumulByDay.map(d => [d.day, d.count])"
          />
        </div>
        <div :style="{ position: 'relative', height: '260px' }">
          <Bar :data="replayCumulChart" :options="replayCumulOptions" />
        </div>
      </div>

      <!-- Type de session (1/3, cliquable) cote a cote avec Top sessions par
           delegues uniques (2/3). Le camembert filtre detail + top sessions. -->
      <div
        :class="(stats.sessionTypes && stats.sessionTypes.length > 0) ? 'charts-row cols-1-2' : ''"
        v-if="topSessions.length > 0 || (stats.sessionTypes && stats.sessionTypes.length > 0)"
      >
        <div class="chart-card" v-if="stats.sessionTypes && stats.sessionTypes.length > 0">
          <div class="chart-header">
            <h3>{{ t("viewers.charts.bySessionType") }}</h3>
            <CsvButton
              :filename="`${kind}-par-session-type`"
              :headers="[t('viewers.csv.type'), t('viewers.csv.views'), t('viewers.csv.uniqueDelegates')]"
              :rows="stats.sessionTypes.map(st => [st.type, st.views, st.uniqueUsers])"
            />
          </div>
          <div class="origin-pie-wrap">
            <div class="origin-pie">
              <DoughnutChart
                :labels="stats.sessionTypes.map(t => t.type)"
                :data="stats.sessionTypes.map(t => t.views)"
                :colors="ORIGIN_COLORS"
                :active-label="selectedSessionType"
                @select="onSessionTypeSelect"
              />
            </div>
            <div class="origin-legend">
              <div v-for="(t, i) in stats.sessionTypes" :key="t.type"
                :class="['origin-legend-row', 'clickable', { active: selectedSessionType === t.type }]"
                @click="onSessionTypeSelect(t.type)">
                <span class="origin-swatch" :style="{ background: ORIGIN_COLORS[i % ORIGIN_COLORS.length] }"></span>
                <span class="origin-name">{{ t.type }}</span>
                <strong>{{ fmt(t.views) }}</strong>
                <span class="origin-sub">{{ pctOf(t.views, totalSessionTypeViews) }}</span>
              </div>
            </div>
          </div>
          <div v-if="selectedSessionType" class="filter-active-bar">
            {{ t("viewers.charts.filterActive") }} <strong>{{ selectedSessionType }}</strong>
            <button class="filter-clear" @click="selectedSessionType = null">{{ t("viewers.charts.clearFilter") }}</button>
          </div>
        </div>
        <div class="chart-card" v-if="topSessions.length > 0">
          <div class="chart-header">
            <h3>
              {{ L.topSessionsTitle }}
              <span v-if="selectedSessionType">{{ t("viewers.charts.filtered") }}</span>
            </h3>
            <CsvButton
              :filename="`${kind}-top-sessions`"
              :headers="[t('viewers.csv.session'), t('viewers.csv.uniqueDelegates'), t('viewers.csv.views'), t('viewers.csv.avgDurationS')]"
              :rows="topSessions.slice(0, topN).map(s => [s.title, s.uniqueUsers, s.views, Math.round(s.avgDuration)])"
            />
          </div>
          <HBarChart
            :labels="topSessions.slice(0, topN).map(s => truncate(s.title, 60))"
            :data="topSessions.slice(0, topN).map(s => s.uniqueUsers)"
            :height="Math.max(220, Math.min(topN, topSessions.length) * 22 + 40)"
            color="#6F45FF"
          />
        </div>
      </div>

      <!-- Replay : top sessions par vues (pleine largeur, sous le couple type/top). -->
      <div class="chart-card" v-if="kind === 'replay' && topSessions.length > 0">
        <div class="chart-header">
          <h3>
            {{ t("viewers.charts.topSessionsViews") }}
            <span v-if="selectedSessionType">{{ t("viewers.charts.filtered") }}</span>
          </h3>
          <CsvButton
            filename="replay-top-sessions-vues"
            :headers="[t('viewers.csv.session'), t('viewers.csv.views'), t('viewers.csv.uniqueDelegates'), t('viewers.csv.avgDurationS')]"
            :rows="topSessionsByViews.slice(0, topN).map(s => [s.title, s.views, s.uniqueUsers, Math.round(s.avgDuration)])"
          />
        </div>
        <HBarChart
          :labels="topSessionsByViews.slice(0, topN).map(s => truncate(s.title, 60))"
          :data="topSessionsByViews.slice(0, topN).map(s => s.views)"
          :height="Math.max(220, Math.min(topN, topSessionsByViews.length) * 22 + 40)"
          color="#1E4E66"
        />
      </div>

      <!-- Engagement : standalone (live ET replay) — en replay la colonne droite
           des "présents physiques par jour" porte désormais les vues par jour. -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ L.engagementTitle }}</h3>
          <CsvButton
            :filename="`${kind}-engagement`"
            :headers="[t('viewers.csv.bucket'), t('viewers.csv.delegates')]"
            :rows="Object.entries(stats.sessionsPerUserBuckets).map(([k, v]) => [k, v])"
          />
        </div>
        <div :style="{ position: 'relative', height: '220px' }">
          <Bar :data="engagementChart" :options="engagementOptions" />
        </div>
      </div>

      <!-- Tableau detaille -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>
            {{ L.detailTitle(filteredItems.length) }}
            <span v-if="selectedSessionType || (kind === 'live' && selectedBadgeType)">{{ t("viewers.charts.filtered") }}</span>
          </h3>
          <CsvButton
            :filename="`${kind}-detail`"
            :headers="detailCsvHeaders"
            :rows="filteredItems.map(detailCsvRow)"
          />
        </div>
        <div v-if="filteredItems.length > 0" class="viewers-table-wrap">
          <table class="data-table viewers-detail-table">
            <thead>
              <tr>
                <th>{{ t("viewers.table.delegate") }}</th>
                <th>{{ t("viewers.table.email") }}</th>
                <th>{{ t("viewers.table.sessionId") }}</th>
                <th>{{ t("viewers.table.session") }}</th>
                <th v-if="kind === 'live'">{{ t("viewers.table.type") }}</th>
                <th v-if="kind === 'live'">{{ t("viewers.table.sessionStart") }}</th>
                <th v-if="kind === 'replay'">{{ t("viewers.table.origin") }}</th>
                <th>{{ kind === 'live' ? t("viewers.table.timestampView") : t("viewers.table.timestamp") }}</th>
                <th>{{ t("viewers.table.duration") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in pagedItems" :key="it.id">
                <td>{{ it.fullName }}</td>
                <td>{{ it.email || '—' }}</td>
                <td class="mono">{{ it.sessionId || '—' }}</td>
                <td>{{ it.sessionTitle || '—' }}</td>
                <td v-if="kind === 'live'">{{ it.sessionType || '—' }}</td>
                <td v-if="kind === 'live'">{{ formatTimestamp(it.sessionStart) || '—' }}</td>
                <td v-if="kind === 'replay'"><span class="origin-pill">{{ it.origin }}</span></td>
                <td>{{ formatTimestamp(it.timestamp) || '—' }}</td>
                <td>{{ formatDuration(it.duration) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredItems.length > pageSize" class="viewers-hint">
            {{ t("viewers.pageHint", { size: pageSize, total: fmt(filteredItems.length) }) }}
          </p>
        </div>
        <p v-else class="empty-msg">{{ L.detailEmpty }}</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";
import ChoroplethMap from "../charts/ChoroplethMap.vue";
import CsvButton from "../CsvButton.vue";
import InfoTooltip from "../InfoTooltip.vue";
import { parisDateParts, toEpochMs } from "../../utils/parisTime.js";
import { fmt } from "@/utils/formatters.js";
import { getTypeColor } from "@/utils/typeColors.js";
import { COUNTRY_CONTINENTS } from "@/utils/countries.js";
import { delegateBadgeType } from "@/utils/checkinByType.js";
import { buildDelegateLookup } from "@/utils/viewerJoin.js";
import { debug } from "@/utils/debug.js";
import { buildPhysicalReplayByDay } from "@/utils/physicalReplay.js";

const props = defineProps({
  // 'live' | 'replay' — pilote labels + variations de template (30min/sessionType pie
  // sont live-only, colonne origine en detail est replay-only, code couleur du
  // chart par jour change). Les stats elles-memes ont la meme shape.
  kind: { type: String, required: true, validator: (v) => v === "live" || v === "replay" },
  delegates: { type: Array, default: () => [] },
  // Instance composable proprietee par StatisticsView (useLive ou useReplay).
  viewerApi: { type: Object, required: true },
  // true quand le filtre global type de badge est actif : on masque alors le
  // segment "Inscrit non reconnu" du chart "Délégués uniques par jour" (on ne
  // veut voir que le(s) type(s) sélectionné(s)).
  badgeFilterActive: { type: Boolean, default: false },
});

const { t } = useI18n();

// Metadonnees techniques non traduisibles par kind (nom d'index ES, couleur du
// chart par jour, tag de log debug). Les libelles textuels viennent d'i18n.
const META = {
  live: {
    esIndex: "stats_user__live-view-duration-per-user-per-session",
    byDayColor: "#30DD92",
    debugTag: "[Live]",
  },
  replay: {
    esIndex: "stats_user__vod-view-per-user-per-session-per-origin",
    byDayColor: "#6F45FF",
    debugTag: "[Replay]",
  },
};

// Labels affiches : composes depuis i18n (cles viewers.<kind>.*) + META technique.
// API identique a l'ancien LABELS (L.xxx + L.detailTitle(n)) pour ne pas toucher
// le template.
// Libelle d'affichage d'un type de badge cote viewers : cle canonique "Inscrit
// non reconnu" localisee, sinon valeur reelle (donnee libre). Garde les cles
// internes (data/couleur) intactes.
const viewerTypeLbl = (type) =>
  type === "Inscrit non reconnu" ? t("viewers.datasets.unrecognized") : type;

const L = computed(() => {
  const k = props.kind;
  return {
    loadingLabel: k === "live" ? t("viewers.loadingLive") : t("viewers.loadingReplay"),
    esIndex: META[k].esIndex,
    uniqueKpi: t(`viewers.${k}.uniqueKpi`),
    uniqueKpiSub: t(`viewers.${k}.uniqueKpiSub`),
    remoteKpi: t(`viewers.${k}.remoteKpi`),
    remoteKpiSub: t(`viewers.${k}.remoteKpiSub`),
    byDayTitle: t(`viewers.${k}.byDayTitle`),
    byDayEmpty: t(`viewers.${k}.byDayEmpty`),
    topSessionsTitle: t(`viewers.${k}.topSessionsTitle`),
    engagementTitle: t(`viewers.${k}.engagementTitle`),
    detailTitle: (n) => t(`viewers.${k}.detailTitle`, { n: fmt(n) }),
    detailEmpty: t(`viewers.${k}.detailEmpty`),
    byDayColor: META[k].byDayColor,
    debugTag: META[k].debugTag,
  };
});

const { loading, refreshing, error, progress, stats, reload } = props.viewerApi;

const g = computed(() => stats.value.global);
const topN = 15;
const pageSize = 200;

// --- Top sessions par VUES (replay) : même liste que topSessions mais triée
// par nombre de vues (s.views) au lieu des délégués uniques. Affiché à droite
// du "Top sessions par délégués uniques". ---
// Derive de `topSessions` (et non de stats brut) pour heriter du filtre type de
// session : selectionner un type filtre aussi "Top sessions VOD par vues".
const topSessionsByViews = computed(() =>
  [...topSessions.value].sort((a, b) => b.views - a.views),
);

// --- Cumul des délégués distincts ayant consulté du replay (déplacé depuis la
// Vue d'ensemble). Chaque délégué compté 1× au jour de sa 1ʳᵉ consultation. ---
const replayCumulByDay = computed(() => stats.value.cumulativeUniqueByDay || []);
const replayCumulChart = computed(() => ({
  labels: replayCumulByDay.value.map((d) => d.day),
  datasets: [{
    type: "line",
    label: t("viewers.charts.replayCumul"),
    data: replayCumulByDay.value.map((d) => d.count),
    borderColor: "#6F45FF",
    backgroundColor: "rgba(111,69,255,0.10)",
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2.5,
  }],
}));
const replayCumulOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => t("viewers.tooltip.cumulDelegates", { n: ctx.raw.toLocaleString("fr-FR") }) },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 }, precision: 0 }, beginAtZero: true },
  },
};

// --- Filtre par session_type (live uniquement) ---
const selectedSessionType = ref(null);
function onSessionTypeSelect(type) {
  selectedSessionType.value = selectedSessionType.value === type ? null : type;
}

// --- Filtre par type de badge (live uniquement) : clic sur un item de la legende
// du chart "Délégués uniques en live par jour" (empile par type de badge) ->
// filtre le tableau de detail sur ce type. On compare sur le MEME libelle que la
// legende (viewerTypeLbl applique au type derive du delegue rapproche). ---
const selectedBadgeType = ref(null);
function onBadgeTypeSelect(label) {
  selectedBadgeType.value = selectedBadgeType.value === label ? null : label;
}
// Libelle de type de badge d'une vue, identique a la logique de byDayByBadgeType
// (delegue rapproche -> delegateBadgeType, sinon "Inscrit non reconnu"), puis
// localise via viewerTypeLbl pour matcher exactement le label de la legende.
function liveItemBadgeType(it) {
  const entry = delegateLookup.value.get(it.userId);
  const badgeT = entry?.delegate ? delegateBadgeType(entry.delegate) : "Inconnu";
  const raw = badgeT === "Inconnu" ? "Inscrit non reconnu" : badgeT;
  return viewerTypeLbl(raw);
}

const filteredItems = computed(() => {
  let items = stats.value.items;
  // Filtre type de session (camembert "Vues par type de session") — live ET replay.
  if (selectedSessionType.value) {
    items = items.filter((it) => (it.sessionType || "Non renseigné") === selectedSessionType.value);
  }
  // Filtre type de badge (legende du chart par jour) — live uniquement.
  if (props.kind === "live" && selectedBadgeType.value) {
    items = items.filter((it) => liveItemBadgeType(it) === selectedBadgeType.value);
  }
  return items;
});
const pagedItems = computed(() => filteredItems.value.slice(0, pageSize));

// Top sessions recalcule a partir des items filtres par le type de session
// selectionne (live) : selectionner un type dans "Vues par type de session"
// restreint aussi "Top sessions par delegues uniques" a ce type. Meme agregation
// que computeLiveStats (sessionsById -> uniques/vues/duree, tri par uniques).
// Hors selection (ou en replay), on reutilise le top sessions deja calcule.
function buildTopSessions(items) {
  const byId = new Map();
  for (const it of items) {
    if (!it.sessionId) continue;
    if (!byId.has(it.sessionId)) {
      byId.set(it.sessionId, {
        id: it.sessionId,
        title: it.sessionTitle || it.sessionId,
        users: new Set(),
        views: 0,
        totalDuration: 0,
      });
    }
    const s = byId.get(it.sessionId);
    if (it.userId) s.users.add(it.userId);
    s.views++;
    s.totalDuration += it.duration || 0;
  }
  return [...byId.values()]
    .map((s) => ({
      id: s.id,
      title: s.title,
      uniqueUsers: s.users.size,
      views: s.views,
      avgDuration: s.views > 0 ? s.totalDuration / s.views : 0,
    }))
    .sort((a, b) => b.uniqueUsers - a.uniqueUsers);
}
// Top sessions filtre par le type de session selectionne — LIVE ET REPLAY.
// Selectionner un type dans "Vues par type de session" restreint "Top sessions
// par delegues uniques" (live + replay) ET "Top sessions VOD par vues" (replay,
// via topSessionsByViews qui derive de ce computed).
const topSessions = computed(() => {
  if (selectedSessionType.value) {
    const items = stats.value.items.filter(
      (it) => (it.sessionType || "Non renseigné") === selectedSessionType.value,
    );
    return buildTopSessions(items);
  }
  return stats.value.topSessions || [];
});

const totalSessionTypeViews = computed(() =>
  (stats.value.sessionTypes || []).reduce((s, t) => s + t.views, 0),
);

// --- Jointure ES viewer (user_id = keycloak id) <-> delegate Mongo ---
// Mutualise via viewerJoin.buildDelegateLookup : indexe chaque delegue sous
// CHACUN de ses comptes Keycloak (contact.emailAddresses[].source.id type
// ACCOUNT — un contact peut avoir plusieurs emails/comptes). Map<kcId,
// {checkedIn, delegate}>. (Avant : logique inline qui ne prenait que le 1er
// compte, d'ou des "Inscrit non reconnu" pour les delegues multi-comptes.)
const delegateLookup = computed(() =>
  buildDelegateLookup(props.delegates || [], { datasetLabel: props.kind }),
);

// Classifie chaque hit en : checked-in / no-checkin / unknown (pas de delegate matchant).
const joinStats = computed(() => {
  const lookup = delegateLookup.value;
  const checkedIn = new Set();
  const noCheckin = new Set();
  const unknown = new Set();
  for (const it of stats.value.items) {
    const kcId = it.userId;
    if (!kcId) continue;
    const entry = lookup.get(kcId);
    if (!entry) unknown.add(kcId);
    else if (entry.checkedIn) checkedIn.add(kcId);
    else noCheckin.add(kcId);
  }
  return { checkedIn: checkedIn.size, noCheckin: noCheckin.size, unknown: unknown.size };
});

const uniqueUsersWithoutCheckin = computed(() => joinStats.value.noCheckin);

// --- Repartition geographique des delegues uniques ayant consulte ---
// Un delegue par user_id (Keycloak) distinct, rapproche via delegateLookup. Les
// viewers non rapproches (unknown) ou sans adresse pays sont exclus de la carte.
const viewerDelegates = computed(() => {
  const lookup = delegateLookup.value;
  const seen = new Set();
  const list = [];
  for (const it of stats.value.items) {
    if (!it.userId || seen.has(it.userId)) continue;
    seen.add(it.userId);
    const entry = lookup.get(it.userId);
    if (entry?.delegate) list.push(entry.delegate);
  }
  return list;
});
const geoCountries = computed(() => {
  const map = {};
  for (const d of viewerDelegates.value) {
    const code = d.primaryAddress?.countryCode || d.primaryAddress?.country?.code;
    if (!code) continue;
    map[code] = (map[code] || 0) + 1;
  }
  return Object.entries(map)
    .map(([value, totalCount]) => ({ value, totalCount }))
    .sort((a, b) => b.totalCount - a.totalCount);
});
// Sous-ensemble europeen (pour le CSV de la carte Europe ; la carte se recadre
// elle-meme sur l'Europe).
const geoCountriesEurope = computed(() =>
  geoCountries.value.filter((c) => COUNTRY_CONTINENTS[(c.value || "").toUpperCase()] === "Europe"),
);
// Signature qui change avec la population -> force le remount des ChoroplethMap
// (construites au mount, cf. composant).
const geoCacheKey = computed(() => `${props.kind}-${viewerDelegates.value.length}`);

// --- Dumps debug (en dev uniquement, cf. debug.js) ---
const withoutCheckinList = computed(() => {
  const lookup = delegateLookup.value;
  const seen = new Set();
  const list = [];
  for (const it of stats.value.items) {
    const kcId = it.userId;
    if (!kcId || seen.has(kcId)) continue;
    const entry = lookup.get(kcId);
    if (entry && entry.checkedIn === false) {
      seen.add(kcId);
      list.push({
        keycloakId: kcId,
        delegateId: entry.delegate?.id || "",
        fullName: it.fullName,
        email: entry.delegate?.email || it.email,
      });
    }
  }
  return list;
});

watch(
  withoutCheckinList,
  (list) => {
    if (list.length === 0) return;
    const verb = props.kind === "live" ? "regarde du live" : "consulte du replay";
    debug.log(`${L.value.debugTag} ${list.length} délégués ont ${verb} SANS check-in physique :`);
    debug.table(list);
  },
  { immediate: true },
);

watch(
  delegateLookup,
  (map) => {
    if (!map || map.size === 0) return;
    const rows = [];
    for (const [keycloakId, entry] of map.entries()) {
      rows.push({
        keycloakId,
        email: entry.delegate?.email || "",
        fullName: [entry.delegate?.givenName, entry.delegate?.familyName].filter(Boolean).join(" "),
        delegateId: entry.delegate?.id || "",
        checkedIn: entry.checkedIn,
        checkedInDate: entry.delegate?.checkedInDate || "",
      });
    }
    debug.log(`${L.value.debugTag} delegateLookup (${rows.length} entrees, keycloakId -> delegate) :`);
    debug.table(rows);
  },
  { immediate: true },
);

// Dump console COMPLET des donnees de consultation live (kind === 'live').
// DEBUG DESACTIVE (logs console de debug commentes). Decommenter pour reactiver.
/*
watch(
  () => stats.value,
  (s) => {
    if (props.kind !== "live" || !s) return;
    const items = s.items || [];
    const rawHits = props.viewerApi.hits?.value || [];
    // eslint-disable no-console
    console.groupCollapsed(
      `%c[Live] Données de consultation — ${items.length} vues / ${rawHits.length} hits ES bruts`,
      "color:#1E4E66;font-weight:700",
    );
    console.log("KPIs globaux:", s.global);
    console.log("Hits ES bruts (_source):", rawHits.map((h) => h._source));
    console.log("Vues normalisées (items):", items);
    console.table(
      items.map((it) => ({
        userId: it.userId,
        delegateId: it.delegateId,
        email: it.email,
        fullName: it.fullName,
        sessionId: it.sessionId,
        sessionTitle: it.sessionTitle,
        sessionType: it.sessionType,
        sessionStart: it.sessionStart,
        sessionEnd: it.sessionEnd,
        origin: it.origin,
        channelId: it.channelId,
        channelName: it.channelName,
        timestamp: it.timestamp,
        durationSec: it.duration,
      })),
    );
    console.log("Top sessions (par délégués uniques):", s.topSessions);
    console.log("Vues par origine:", s.origins);
    console.log("Vues par type de session:", s.sessionTypes);
    console.log("Délégués uniques / jour:", s.uniqueByDay);
    console.log("Délégués uniques / jour / chaîne:", s.uniqueByDayByChannel);
    console.log("Délégués uniques / créneau 30 min:", s.uniqueBy30min);
    console.log("Engagement (sessions consultées / délégué):", s.sessionsPerUserBuckets);
    console.groupEnd();

    // --- Dump dedie des viewers classes "Inconnu" (segment du chart par jour) ---
    // Un viewer tombe en "Inconnu" si son user_id (Keycloak) n'est rapproche
    // d'AUCUN delegue, OU s'il est matche mais que le delegue n'a ni badge ni
    // registration (delegateBadgeType -> "Inconnu").
    const lookup = delegateLookup.value;
    const inconnu = new Map(); // userId -> ligne diagnostic
    for (const it of items) {
      if (!it.userId) continue;
      const entry = lookup.get(it.userId);
      const type = entry?.delegate ? delegateBadgeType(entry.delegate) : "Inconnu";
      if (type !== "Inconnu") continue;
      if (inconnu.has(it.userId)) {
        inconnu.get(it.userId).vues++;
        continue;
      }
      const matched = !!entry?.delegate;
      inconnu.set(it.userId, {
        userId: it.userId,
        cause: matched ? "matché SANS badge ni registration" : "NON rapproché (user_id Keycloak introuvable côté délégués)",
        matched,
        email: entry?.delegate?.email || it.email || "—",
        fullName: it.fullName || "—",
        delegateId: entry?.delegate?.id || "—",
        nbBadges: entry?.delegate?.badges?.length ?? "—",
        nbRegistrations: entry?.delegate?.registrations?.length ?? "—",
        exempleSession: it.sessionTitle || it.sessionId || "—",
        vues: 1,
      });
    }
    const rows = [...inconnu.values()];
    const nonMatched = rows.filter((r) => !r.matched).length;
    const matchedNoType = rows.filter((r) => r.matched).length;
    const totalUsers = new Set(items.map((i) => i.userId).filter(Boolean)).size;
    console.groupCollapsed(
      `%c[Live] Segment "Inscrit non reconnu" — ${rows.length}/${totalUsers} viewers uniques ` +
        `(${nonMatched} non rapprochés · ${matchedNoType} matchés sans type)`,
      "color:#b91c1c;font-weight:700",
    );
    console.table(rows);
    console.log(
      `Couverture jointure : ${totalUsers - nonMatched}/${totalUsers} viewers rapprochés à un délégué ` +
        `(${totalUsers > 0 ? (((totalUsers - nonMatched) / totalUsers) * 100).toFixed(1) : 0}%).`,
    );
    console.log("Lookup délégués (taille) :", lookup.size, "délégués avec user_id Keycloak");
    console.groupEnd();
    // eslint-enable no-console
  },
  { immediate: true },
);
*/

// --- Présents physiques qui consultent du replay (replay uniquement) ---
// Funnel "venu sur place PUIS revu en replay". Reutilise delegateLookup (deja
// construit pour les KPI sans presence physique). Double mesure par jour :
// delegues uniques (barres) + vues (courbe sur 2e axe).
const physicalReplayDaily = computed(() =>
  props.kind === "replay" ? buildPhysicalReplayByDay(stats.value.items, delegateLookup.value) : [],
);
const physicalReplayTotals = computed(() => {
  const ids = new Set();
  let views = 0;
  if (props.kind === "replay") {
    for (const it of stats.value.items || []) {
      const entry = delegateLookup.value.get(it.userId);
      if (!entry || !entry.checkedIn) continue;
      if (entry.delegate?.id) ids.add(entry.delegate.id);
      views++;
    }
  }
  return { uniqueDelegates: ids.size, views };
});
const physicalReplayChart = computed(() => ({
  labels: physicalReplayDaily.value.map((d) => d.day),
  datasets: [
    {
      type: "bar",
      label: t("viewers.datasets.physicalUniqueDelegates"),
      data: physicalReplayDaily.value.map((d) => d.uniqueDelegates),
      backgroundColor: "#1E4E66",
      borderRadius: 4,
      yAxisID: "y",
      order: 2,
    },
    {
      type: "line",
      label: t("viewers.datasets.replayCumulViews"),
      // Cumul des vues replay de ces presents physiques, jour apres jour.
      data: (() => {
        let c = 0;
        return physicalReplayDaily.value.map((d) => (c += d.views));
      })(),
      borderColor: "#6F45FF",
      backgroundColor: "rgba(111,69,255,0.10)",
      fill: false,
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2.5,
      yAxisID: "y1",
      order: 1,
    },
  ],
}));
const physicalReplayOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "top", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) =>
          ctx.dataset.yAxisID === "y1"
            ? t("viewers.tooltip.cumulViews", { n: ctx.raw.toLocaleString("fr-FR") })
            : t("viewers.tooltip.uniqueDelegates", { n: ctx.raw.toLocaleString("fr-FR") }),
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    y: {
      position: "left", beginAtZero: true,
      grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 }, precision: 0 },
      title: { display: true, text: t("viewers.axis.uniqueDelegates"), font: { size: 12 } },
    },
    y1: {
      position: "right", beginAtZero: true,
      grid: { display: false }, ticks: { font: { size: 13 }, precision: 0 },
      title: { display: true, text: t("viewers.axis.cumulViews"), font: { size: 12 } },
    },
  },
}));

// Vues en replay par jour POUR LES PRESENTS PHYSIQUES : barres (vues/jour) +
// courbe (vues cumulees), restreint aux delegues avec check-in valide ayant
// consulte du replay (physicalReplayDaily). Reutilise replayViewsByDayOptions.
const physicalReplayViewsChart = computed(() => ({
  labels: physicalReplayDaily.value.map((d) => d.day),
  datasets: [
    {
      type: "bar",
      label: t("viewers.datasets.viewsPerDayPhysical"),
      data: physicalReplayDaily.value.map((d) => d.views),
      backgroundColor: "#6F45FF",
      borderRadius: 4,
      barThickness: Math.max(12, Math.min(40, 500 / (physicalReplayDaily.value.length || 1))),
      yAxisID: "y",
      order: 2,
    },
    {
      type: "line",
      label: t("viewers.datasets.cumulViews"),
      data: (() => {
        let c = 0;
        return physicalReplayDaily.value.map((d) => (c += d.views));
      })(),
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.10)",
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: "#1E4E66",
      borderWidth: 2.5,
      yAxisID: "y1",
      order: 1,
      datalabels: { display: false },
    },
  ],
}));


// --- Charts ---
const byDayChart = computed(() => {
  const labels = stats.value.uniqueByDay.map((d) => d.day);
  const datasets = [{
    type: "bar",
    label: t("viewers.datasets.uniqueDelegates"),
    data: stats.value.uniqueByDay.map((d) => d.count),
    backgroundColor: L.value.byDayColor,
    borderRadius: 4,
    barThickness: Math.max(12, Math.min(40, 500 / (stats.value.uniqueByDay.length || 1))),
    yAxisID: "y",
    order: 2,
  }];
  // Replay : courbe des NOUVEAUX delegues par jour (1ere consultation ce
  // jour-la). Meme echelle que les barres (sous-ensemble des uniques du jour)
  // => axe gauche "y". _metric pilote le libelle du tooltip.
  if (props.kind === "replay" && (stats.value.newUniqueByDay || []).length > 0) {
    datasets.push({
      type: "line",
      label: t("viewers.datasets.newDelegates"),
      _metric: "new",
      data: stats.value.newUniqueByDay.map((d) => d.count),
      borderColor: "#FFA600",
      backgroundColor: "rgba(255,166,0,0.10)",
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: "#FFA600",
      borderWidth: 2.5,
      yAxisID: "y",
      order: 1,
      datalabels: { display: false },
    });
  }
  // Replay : courbe de delegues uniques CUMULES (chaque delegue compte 1x au
  // jour de sa 1ere consultation). 2e axe car la courbe croit jusqu'au total.
  if (props.kind === "replay" && (stats.value.cumulativeUniqueByDay || []).length > 0) {
    datasets.push({
      type: "line",
      label: t("viewers.datasets.cumulDelegates"),
      data: stats.value.cumulativeUniqueByDay.map((d) => d.count),
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.10)",
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: "#1E4E66",
      borderWidth: 2.5,
      yAxisID: "y1",
      order: 1,
      datalabels: { display: false },
    });
  }
  return { labels, datasets };
});

// Live : delegues uniques par jour EMPILES PAR TYPE DE BADGE. Le type vient du
// delegue rapproche (lookup user_id keycloak -> delegate -> delegateBadgeType).
// Dedoublonnage par (jour, user) : un delegue compte 1x par jour, dans son type.
// Les viewers non rapproches d'un delegue tombent dans "Inconnu". La somme d'un
// jour egale uniqueByDay. Bucketage sur sessionEnd (comme uniqueByDay live).
const byDayByBadgeType = computed(() => {
  if (props.kind !== "live") return { labels: [], datasets: [], types: [] };
  const lookup = delegateLookup.value;
  const seen = new Map(); // day -> Map<userId, badgeType>
  for (const it of stats.value.items) {
    if (!it.userId) continue;
    const ref = it.sessionEnd || it.sessionStart || it.timestamp;
    if (!ref) continue;
    const p = parisDateParts(ref);
    if (!p) continue;
    if (!seen.has(p.ymd)) seen.set(p.ymd, new Map());
    const dayMap = seen.get(p.ymd);
    if (!dayMap.has(it.userId)) {
      const entry = lookup.get(it.userId);
      // Viewer non rapproche d'un delegue (ou delegue sans type) => cle canonique
      // "Inscrit non reconnu" : il a regarde du live donc il EST inscrit, mais la
      // jointure Keycloak <-> delegue echoue. Anomalie a corriger (cf. ACCOUNT).
      const badgeT = entry?.delegate ? delegateBadgeType(entry.delegate) : "Inconnu";
      const label = badgeT === "Inconnu" ? "Inscrit non reconnu" : badgeT;
      // Filtre badge type actif : on masque les "Inscrit non reconnu" (viewers
      // non rapprochés / hors du/des type(s) sélectionné(s)).
      if (props.badgeFilterActive && label === "Inscrit non reconnu") continue;
      dayMap.set(it.userId, label);
    }
  }
  const days = [...seen.keys()].sort();
  // Types tries par volume total decroissant (legende + ordre des segments).
  const typeTotals = {};
  for (const dayMap of seen.values()) {
    for (const t of dayMap.values()) typeTotals[t] = (typeTotals[t] || 0) + 1;
  }
  const types = Object.keys(typeTotals).sort((a, b) => typeTotals[b] - typeTotals[a]);
  const perDayType = days.map((d) => {
    const byType = {};
    for (const t of seen.get(d).values()) byType[t] = (byType[t] || 0) + 1;
    return byType;
  });
  const datasets = types.map((type) => ({
    label: viewerTypeLbl(type),
    data: perDayType.map((bt) => bt[type] || 0),
    backgroundColor: type === "Inscrit non reconnu" ? "#9CA3AF" : getTypeColor(type),
    borderRadius: 3,
  }));
  return { labels: days, datasets, types, perDayType };
});

// Delegues uniques par jour ET par chaine de diffusion (live uniquement).
// Barres GROUPEES (cote a cote) : 1 dataset par channel_id, couleur
// deterministe sur l'id. Dedoublonnage par (jour, chaine) -> un delegue qui a
// suivi plusieurs chaines apparait dans chacune (pas de repartition d'un total,
// d'ou les barres groupees et non empilees). Les libelles "Chaine N" viennent
// de computeLiveStats (l'index n'expose pas de nom de chaine lisible).
const byDayChannel = computed(() => stats.value.uniqueByDayByChannel || { days: [], channels: [], byDay: {} });
const byDayChannelChart = computed(() => {
  const { days, channels, byDay } = byDayChannel.value;
  return {
    labels: days,
    datasets: channels.map((ch) => ({
      label: ch.label,
      data: days.map((d) => byDay[d]?.[ch.id] || 0),
      backgroundColor: getTypeColor(ch.id),
      borderRadius: 3,
      categoryPercentage: 0.8,
      barPercentage: 0.9,
    })),
  };
});

const byDayChannelOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.dataset.label} : ${t("viewers.tooltip.uniqueDelegates", { n: ctx.raw.toLocaleString("fr-FR") })}` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
};

const byDayOptions = computed(() => {
  const isReplay = props.kind === "replay";
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 18 } },
    plugins: {
      legend: isReplay
        ? { position: "top", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } }
        : { display: false },
      datalabels: {
        display: true, anchor: "end", align: "end", offset: 2, clip: false,
        color: "#414141", font: { weight: 600, size: 13 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const n = ctx.raw.toLocaleString("fr-FR");
            if (ctx.dataset.yAxisID === "y1") return t("viewers.tooltip.cumulDelegates", { n });
            if (ctx.dataset._metric === "new") return t("viewers.tooltip.newDelegates", { n });
            return t("viewers.tooltip.uniqueDelegates", { n });
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 13 } } },
      y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
    },
  };
  if (isReplay) {
    opts.scales.y1 = {
      position: "right", beginAtZero: true,
      grid: { display: false }, ticks: { font: { size: 13 }, precision: 0 },
      title: { display: true, text: t("viewers.axis.cumul"), font: { size: 12 } },
    };
  }
  return opts;
});

// --- Replay : Vues par jour (barres) + vues cumulees (courbe), double axe ---
const replayViewsByDay = computed(() => stats.value.viewsByDay || []);
const replayViewsByDayChart = computed(() => ({
  labels: replayViewsByDay.value.map((d) => d.day),
  datasets: [
    {
      type: "bar",
      label: t("viewers.datasets.viewsPerDay"),
      data: replayViewsByDay.value.map((d) => d.count),
      backgroundColor: "#6F45FF",
      borderRadius: 4,
      barThickness: Math.max(12, Math.min(40, 500 / (replayViewsByDay.value.length || 1))),
      yAxisID: "y",
      order: 2,
    },
    {
      type: "line",
      label: t("viewers.datasets.cumulViews"),
      data: (stats.value.cumulativeViewsByDay || []).map((d) => d.count),
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.10)",
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: "#1E4E66",
      borderWidth: 2.5,
      yAxisID: "y1",
      order: 1,
      datalabels: { display: false },
    },
  ],
}));
const replayViewsByDayOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "top", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 13 },
    },
    tooltip: {
      callbacks: {
        label: (ctx) =>
          ctx.dataset.yAxisID === "y1"
            ? t("viewers.tooltip.cumulViews", { n: ctx.raw.toLocaleString("fr-FR") })
            : t("viewers.tooltip.views", { n: ctx.raw.toLocaleString("fr-FR") }),
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    y: {
      position: "left", beginAtZero: true,
      grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 }, precision: 0 },
      title: { display: true, text: t("viewers.axis.viewsPerDay"), font: { size: 12 } },
    },
    y1: {
      position: "right", beginAtZero: true,
      grid: { display: false }, ticks: { font: { size: 13 }, precision: 0 },
      title: { display: true, text: t("viewers.axis.cumulShort"), font: { size: 12 } },
    },
  },
}));

// 30-min slot chart (live uniquement) — labels HH:MM (ou MM-DD HH:MM si multi-jour).
const by30minChart = computed(() => {
  const slots = stats.value.uniqueBy30min || [];
  const days = new Set(slots.map((s) => s.slot.slice(0, 10)));
  const multiDay = days.size > 1;
  const labels = slots.map((s) => {
    const [day, hm] = s.slot.split(" ");
    return multiDay ? `${day.slice(5)} ${hm}` : hm;
  });
  return {
    labels,
    datasets: [{
      label: t("viewers.datasets.uniqueDelegates"),
      data: slots.map((s) => s.count),
      backgroundColor: "#1E4E66",
      borderRadius: 3,
      categoryPercentage: 0.85,
      barPercentage: 0.85,
    }],
  };
});

const by30minOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => t("viewers.tooltip.uniqueDelegates", { n: ctx.raw.toLocaleString("fr-FR") }) },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 12 }, autoSkip: true, maxTicksLimit: 20, maxRotation: 45 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
};

const engagementChart = computed(() => {
  const buckets = stats.value.sessionsPerUserBuckets;
  const labels = ["1", "2-5", "6-10", "10+"];
  return {
    labels,
    datasets: [{
      label: t("viewers.datasets.delegates"),
      data: labels.map((l) => buckets[l]),
      backgroundColor: ["#9CA3AF", "#1E4E66", "#30DD92", "#6F45FF"],
      borderRadius: 4,
      barThickness: props.kind === "live" ? 60 : 50,
    }],
  };
});

const engagementOptions = {
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
      callbacks: { label: (ctx) => t("viewers.tooltip.delegates", { n: ctx.raw.toLocaleString("fr-FR") }) },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
};

// --- Helpers de format / detail table ---
const ORIGIN_COLORS = ["#1E4E66", "#30DD92", "#6F45FF", "#FFA600", "#E53935", "#00BCD4", "#9C27B0", "#A3B86C"];

const totalOriginViews = computed(() =>
  (stats.value.origins || []).reduce((s, o) => s + o.views, 0),
);

function pctOf(v, total) {
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(1)}%`;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m}min${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const p = parisDateParts(toEpochMs(ts));
  if (!p) return String(ts);
  return `${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

// Headers / rows CSV du tableau detaille — varient selon kind.
const detailCsvHeaders = computed(() =>
  props.kind === "live"
    ? [t("viewers.csv.delegate"), t("viewers.table.email"), t("viewers.table.sessionId"), t("viewers.csv.session"), t("viewers.csv.typeSession"), t("viewers.csv.sessionStart"), t("viewers.csv.timestampView"), t("viewers.csv.durationS")]
    : [t("viewers.csv.delegate"), t("viewers.table.email"), t("viewers.table.sessionId"), t("viewers.csv.session"), t("viewers.csv.origin"), t("viewers.csv.timestamp"), t("viewers.csv.durationS")]
);

function detailCsvRow(it) {
  if (props.kind === "live") {
    return [
      it.fullName, it.email, it.sessionId || "", it.sessionTitle,
      it.sessionType, formatTimestamp(it.sessionStart) || "",
      formatTimestamp(it.timestamp) || "", Math.round(it.duration),
    ];
  }
  return [
    it.fullName, it.email, it.sessionId || "", it.sessionTitle,
    it.origin, formatTimestamp(it.timestamp) || "", Math.round(it.duration),
  ];
}
</script>

<style scoped>
.viewers-state { text-align: center; padding: 60px 20px; }
.viewers-progress { font-size: 14px; color: var(--text-muted); margin-top: 8px; }
.viewers-hint { font-size: 13px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
.viewers-hint code {
  background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
  font-family: "Fira Code", monospace; font-size: 12px;
}

.viewers-table-wrap { max-height: 600px; overflow: auto; }
.viewers-table-wrap .data-table th { position: sticky; top: 0; z-index: 2; }
.viewers-detail-table { min-width: 900px; }
.viewers-detail-table .mono {
  font-family: "Fira Code", Consolas, monospace;
  font-size: 12px; color: var(--text-secondary);
}

.origin-pill {
  display: inline-block; padding: 1px 7px;
  font-size: 12px; font-weight: 600;
  border-radius: 8px; background: #6F45FF; color: #fff;
}

/* Indicateur "Vues totales par origine" (doughnut + legende) en KPI. */
.kpi-origin { grid-column: span 2; }
.kpi-origin-body { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.kpi-origin-pie { width: 84px; height: 84px; flex-shrink: 0; }
.kpi-origin-legend {
  display: flex; flex-direction: column; gap: 3px;
  font-size: 12px; min-width: 0; flex: 1;
}
.kpi-origin-row {
  display: grid; grid-template-columns: 12px 1fr auto auto;
  align-items: center; gap: 6px;
}
.kpi-origin-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-secondary);
}
.kpi-origin-row strong { color: var(--text); font-variant-numeric: tabular-nums; }
.kpi-origin-pct { color: var(--text-muted); min-width: 42px; text-align: right; }

.origin-legend-row.clickable {
  cursor: pointer; padding: 3px 6px; border-radius: 6px;
  transition: background .15s;
}
.origin-legend-row.clickable:hover { background: #f3f4f6; }
.origin-legend-row.clickable.active { background: rgba(48,221,146,0.12); }
.origin-legend-row.clickable.active strong { color: #047857; }

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

.origin-pie-wrap {
  display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: center;
}
.origin-pie { width: 200px; }
.origin-legend {
  display: flex; flex-direction: column; gap: 6px; font-size: 14px;
}
.origin-legend-row {
  display: grid; grid-template-columns: 12px 1fr auto auto;
  align-items: center; gap: 8px;
}
.origin-swatch { width: 12px; height: 12px; border-radius: 3px; }
.origin-name { color: var(--text); }
.origin-legend-row strong { color: var(--text); font-weight: 700; }
.origin-sub { color: var(--text-muted); font-size: 13px; min-width: 50px; text-align: right; }

@media (max-width: 700px) {
  .origin-pie-wrap { grid-template-columns: 1fr; }
  .origin-pie { width: 160px; margin: 0 auto; }
}
</style>
