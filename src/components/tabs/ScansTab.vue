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

      <!-- Delegues uniques scannes par jour -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("scans.byDayTitle") }}</h3>
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

      <!-- Top sessions -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("scans.topSessionsTitle") }}</h3>
          <CsvButton
            filename="top-sessions"
            :headers="[t('scans.csv.session'), t('scans.csv.scans'), t('scans.csv.uniqueDelegates')]"
            :rows="audience.topSessions.map(s => [s.label, s.count, s.uniqueDelegates])"
          />
        </div>
        <HBarChart
          v-if="audience.topSessions.length > 0"
          :labels="audience.topSessions.map(s => truncate(s.label, 60))"
          :data="audience.topSessions.map(s => s.count)"
          :height="Math.max(220, audience.topSessions.length * 22 + 40)"
          color="#1E4E66"
        />
        <p v-else class="empty-msg">{{ t("scans.empty.noAudience") }}</p>
      </div>

      <!-- Timeline tri-source -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("scans.flowTitle") }}</h3>
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
          <h3>{{ t("scans.detailTitle", { n: fmt(stats.all.length) }) }}</h3>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div class="period-selector">
              <button
                v-for="opt in kindFilterOptions"
                :key="opt.value"
                :class="['period-btn', { active: kindFilter === opt.value }]"
                @click="kindFilter = opt.value"
              >{{ opt.label }}</button>
            </div>
            <CsvButton
              filename="scans-detail"
              :headers="[t('scans.csv.type'), t('scans.csv.timestamp'), 'delegateId', 'fullName', 'email', 'badgeType', 'sessionId', 'sessionTitle', 'sessionStart', 'roomName', 'industryName', t('scans.csv.direction')]"
              :rows="filteredScans.map(s => [s.kind, formatTimestamp(s.timestamp), s.delegateId || '', s.fullName, s.email, s.badgeType, s.sessionId || '', s.sessionTitle || '', formatTimestamp(s.sessionStart) || '', s.roomName || '', s.industryName || '', s.direction])"
            />
          </div>
        </div>
        <div v-if="filteredScans.length > 0" class="scans-table-wrap">
          <table class="data-table scans-detail-table">
            <thead>
              <tr>
                <th>{{ t("scans.csv.type") }}</th>
                <th>{{ t("scans.csv.timestamp") }}</th>
                <th>delegateId</th>
                <th>fullName</th>
                <th>email</th>
                <th>badgeType</th>
                <th>sessionId</th>
                <th>sessionTitle</th>
                <th>sessionStart</th>
                <th>roomName</th>
                <th>industryName</th>
                <th>{{ t("scans.csv.direction") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in pagedScans" :key="s.kind + '-' + s.id">
                <td><span class="kind-pill" :class="'kind-' + s.kind">{{ kindLabel(s.kind) }}</span></td>
                <td>{{ formatTimestamp(s.timestamp) }}</td>
                <td class="mono">{{ s.delegateId || '—' }}</td>
                <td>{{ s.fullName }}</td>
                <td>{{ s.email || '—' }}</td>
                <td>{{ s.badgeType }}</td>
                <td class="mono">{{ s.sessionId || '—' }}</td>
                <td>{{ s.sessionTitle || '—' }}</td>
                <td>{{ formatTimestamp(s.sessionStart) || '—' }}</td>
                <td>{{ s.roomName || '—' }}</td>
                <td>{{ s.industryName || '—' }}</td>
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
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";
import KpiCompareGrid from "../charts/KpiCompareGrid.vue";
import CsvButton from "../CsvButton.vue";
import { parisDateParts } from "../../utils/parisTime.js";
import { fmt } from "@/utils/formatters.js";
import { getTypeColor } from "@/utils/typeColors.js";

const { t } = useI18n();

const props = defineProps({
  // Instance useRoomScans proprietee par StatisticsView (mutualisee avec ExportsTab + export MD).
  scansApi: { type: Object, required: true },
  // Scans de l'event compare (?compareWith=) — null si pas de comparaison.
  compareScansApi: { type: Object, default: null },
  eventName: { type: String, default: "" },
  compareEventName: { type: String, default: "" },
});

const { loading, refreshing, error, progress, stats, reload } = props.scansApi;

const g = computed(() => stats.value.global);
const audience = computed(() => stats.value.audience);

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

const filteredScans = computed(() => {
  const all = stats.value.all || [];
  const sorted = [...all].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  if (kindFilter.value === "all") return sorted;
  return sorted.filter((s) => s.kind === kindFilter.value);
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

.scans-table-wrap { max-height: 600px; overflow: auto; }
.scans-table-wrap .data-table th {
  position: sticky; top: 0; z-index: 2;
}
.scans-detail-table { min-width: 1400px; }
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
</style>
