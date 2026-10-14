<template>
  <div>
    <div v-if="loading" class="cmp-loading">
      <div class="spinner"></div>
      <p class="loading-label">{{ t("viewersCompare.loading", { kind: L.kindLabel }) }}</p>
    </div>

    <div v-else-if="error" class="cmp-error">
      <p><strong>{{ t("viewersCompare.error") }}</strong> {{ error }}</p>
    </div>

    <template v-else>
      <!-- En-tête identité des 2 events -->
      <div class="cmp-event-row">
        <div class="cmp-event">
          <span class="cmp-event-dot" :style="{ background: COLORS.current }"></span>
          <strong>{{ shortName(eventName) }}</strong>
          <span class="cmp-event-meta">{{ t("viewersCompare.eventMeta", { views: fmt(statsA.global.totalViews), delegates: fmt(personsA) }) }}</span>
        </div>
        <span class="cmp-vs">{{ t("viewersCompare.vs") }}</span>
        <div class="cmp-event">
          <span class="cmp-event-dot" :style="{ background: COLORS.compare }"></span>
          <strong>{{ shortName(compareEventName) }}</strong>
          <span class="cmp-event-meta">{{ t("viewersCompare.eventMeta", { views: fmt(statsB.global.totalViews), delegates: fmt(personsB) }) }}</span>
        </div>
      </div>

      <!-- KPI compare grid extrait dans KpiCompareGrid. -->
      <KpiCompareGrid
        :kpis="kpis"
        :event-name="eventName"
        :compare-event-name="compareEventName"
        :colors="COLORS"
      />

      <!-- Vues par origine : 2 barres 100% stacked l'une sous l'autre -->
      <div class="chart-card" v-if="allOrigins.length > 0">
        <div class="chart-header">
          <h3>{{ t("viewersCompare.originMixTitle") }}</h3>
        </div>
        <div class="origin-row">
          <div class="origin-event-label">
            <span class="event-dot" :style="{ background: COLORS.current }"></span>
            <span>{{ shortName(eventName) }}</span>
            <span class="origin-volume">{{ t("viewersCompare.originVolume", { n: fmt(statsA.global.totalViews) }) }}</span>
          </div>
          <div class="origin-stack-bar">
            <div
              v-for="o in originRowA"
              :key="`a-${o.origin}`"
              class="origin-segment"
              :style="{ width: o.pct + '%', background: o.color }"
              :title="`${o.origin} · ${t('viewersCompare.originVolume', { n: fmt(o.views) })} (${o.pct.toFixed(1)}%)`"
            >
              <span v-if="o.pct > 6">{{ o.origin }} · {{ o.pct.toFixed(0) }}%</span>
            </div>
          </div>
        </div>
        <div class="origin-row">
          <div class="origin-event-label">
            <span class="event-dot" :style="{ background: COLORS.compare }"></span>
            <span>{{ shortName(compareEventName) }}</span>
            <span class="origin-volume">{{ t("viewersCompare.originVolume", { n: fmt(statsB.global.totalViews) }) }}</span>
          </div>
          <div class="origin-stack-bar">
            <div
              v-for="o in originRowB"
              :key="`b-${o.origin}`"
              class="origin-segment"
              :style="{ width: o.pct + '%', background: o.color }"
              :title="`${o.origin} · ${t('viewersCompare.originVolume', { n: fmt(o.views) })} (${o.pct.toFixed(1)}%)`"
            >
              <span v-if="o.pct > 6">{{ o.origin }} · {{ o.pct.toFixed(0) }}%</span>
            </div>
          </div>
        </div>
        <div class="origin-legend">
          <span v-for="(c, origin) in originColorMap" :key="origin" class="legend-item">
            <span class="swatch" :style="{ background: c }"></span>{{ origin }}
          </span>
        </div>
      </div>

      <!-- Live : Délégués uniques par jour en standalone. -->
      <div v-if="kind !== 'replay'" class="chart-card">
        <div class="chart-header">
          <h3>{{ L.dailyChartTitle }}<InfoTooltip :text="t('viewersCompare.axisX', { hint: L.dailyChartAxisHint })" /></h3>
        </div>
        <div v-if="dailyChart.labels.length > 0" :style="{ position: 'relative', height: '300px' }">
          <Bar :data="dailyChart" :options="dailyChartOptions" />
        </div>
        <p v-else class="empty-msg">{{ t("viewersCompare.dailyEmpty") }}</p>
      </div>

      <template v-else>
        <!-- Rangée 1 : Délégués uniques/jour (+ cumul) | Vues/jour (histo + cumul) -->
        <div class="charts-row">
          <div class="chart-card">
            <div class="chart-header">
              <h3>{{ L.dailyChartTitle }}<InfoTooltip :text="t('viewersCompare.axisX', { hint: L.dailyChartAxisHint })" /></h3>
            </div>
            <div v-if="dailyChart.labels.length > 0" :style="{ position: 'relative', height: '300px' }">
              <Bar :data="dailyChart" :options="dailyChartOptions" />
            </div>
            <p v-else class="empty-msg">{{ t("viewersCompare.dailyEmpty") }}</p>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <h3>{{ t("viewersCompare.replayViewsByDayCompare") }}<InfoTooltip :text="t('viewersCompare.j0Hint')" /></h3>
            </div>
            <div v-if="viewsByDayCompareChart.labels.length > 0" :style="{ position: 'relative', height: '300px' }">
              <Bar :data="viewsByDayCompareChart" :options="viewsByDayCompareOptions" />
            </div>
            <p v-else class="empty-msg">{{ t("viewersCompare.replayViewsEmpty") }}</p>
          </div>
        </div>

        <!-- Rangée 2 : présents physiques — délégués uniques/jour | vues/jour -->
        <div class="charts-row">
          <div class="chart-card">
            <div class="chart-header">
              <h3>{{ t("viewersCompare.physicalUniqueCompare") }}<InfoTooltip :text="t('viewersCompare.j0Hint')" /></h3>
            </div>
            <div v-if="physicalReplayUniqueCompareChart.labels.length > 0" :style="{ position: 'relative', height: '300px' }">
              <Bar :data="physicalReplayUniqueCompareChart" :options="physicalReplayUniqueCompareOptions" />
            </div>
            <p v-else class="empty-msg">{{ t("viewersCompare.physicalUniqueEmpty") }}</p>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <h3>{{ t("viewersCompare.physicalViewsCompare") }}<InfoTooltip :text="t('viewersCompare.j0Hint')" /></h3>
            </div>
            <div v-if="physicalReplayViewsCompareChart.labels.length > 0" :style="{ position: 'relative', height: '300px' }">
              <Bar :data="physicalReplayViewsCompareChart" :options="physicalReplayViewsCompareOptions" />
            </div>
            <p v-else class="empty-msg">{{ t("viewersCompare.physicalViewsEmpty") }}</p>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Bar } from "vue-chartjs";
import {
  buildDelegateLookup,
  getRemoteOnlyDelegateIds,
  countUniqueViewerPersons,
} from "../../utils/viewerJoin.js";
import { fmt, shortName } from "@/utils/formatters.js";
import { buildPhysicalReplayByDay, buildPhysicalReplayCumulative } from "../../utils/physicalReplay.js";
import KpiCompareGrid from "../charts/KpiCompareGrid.vue";
import InfoTooltip from "../InfoTooltip.vue";

const { t } = useI18n();

const props = defineProps({
  // 'live' | 'replay' — pilote tous les labels affiches a l'utilisateur.
  // La structure des stats est identique entre les 2 sources (cf.
  // computeLiveStats / computeReplayStats : meme shape { global, items,
  // origins, uniqueByDay, ... }).
  kind: { type: String, required: true, validator: (v) => v === "live" || v === "replay" },
  delegates: { type: Array, default: () => [] },
  compareDelegates: { type: Array, default: () => [] },
  eventName: { type: String, default: "" },
  compareEventName: { type: String, default: "" },
  // Instances composable A (event courant) + B (compare). B est null si pas de compareWith.
  // Pour kind='live' : useLive ; pour kind='replay' : useReplay.
  viewerApi: { type: Object, required: true },
  compareViewerApi: { type: Object, default: null },
});

// Labels affiches (live/replay) sources d'i18n. kindLabel ("live"/"replay")
// reste identique dans les 2 langues.
const L = computed(() => {
  const k = props.kind;
  return {
    kindLabel: k,
    uniqueKpi: t(`viewersCompare.${k}.uniqueKpi`),
    remoteKpi: t(`viewersCompare.${k}.remoteKpi`),
    dailyChartTitle: t(`viewersCompare.${k}.dailyChartTitle`),
    dailyChartAxisHint: t(`viewersCompare.${k}.dailyChartAxisHint`),
  };
});

const apiA = props.viewerApi;
const apiB = props.compareViewerApi;

const loading = computed(() => apiA.loading.value || (apiB?.loading.value ?? false));
const error = computed(() => apiA.error.value || apiB?.error.value || null);

const EMPTY_STATS = { global: {}, items: [], origins: [], uniqueByDay: [], cumulativeUniqueByDay: [] };
const statsA = computed(() => apiA.stats.value || EMPTY_STATS);
const statsB = computed(() => apiB?.stats.value || EMPTY_STATS);

const COLORS = {
  current: "#27CE71",
  compare: "#9CA3AF",
};

// Palette stable pour les origines (mêmes couleurs sur les 2 barres).
const ORIGIN_PALETTE = ["#1E4E66", "#30DD92", "#6F45FF", "#FF8A3D", "#1FB6D6", "#E07A5F"];

function formatDuration(sec) {
  if (!sec || sec < 0) return "0s";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

// --- "Live/Replay sans présence physique" : delegues matched sur user_id ES
// qui n'ont pas de check-in valide. Exclut les viewers ES non lies a la
// registration (unknown).
const lookupA = computed(() => buildDelegateLookup(props.delegates, { datasetLabel: `${props.kind}-compare-A` }));
const lookupB = computed(() => buildDelegateLookup(props.compareDelegates, { datasetLabel: `${props.kind}-compare-B` }));
// Personnes distinctes (plusieurs comptes d'une meme personne = 1).
const personsA = computed(() => countUniqueViewerPersons(statsA.value.items, lookupA.value));
const personsB = computed(() => countUniqueViewerPersons(statsB.value.items, lookupB.value));
const remoteA = computed(() =>
  getRemoteOnlyDelegateIds(statsA.value.items, lookupA.value, { datasetLabel: `${props.kind}-compare-A` }).size,
);
const remoteB = computed(() =>
  getRemoteOnlyDelegateIds(statsB.value.items, lookupB.value, { datasetLabel: `${props.kind}-compare-B` }).size,
);

// --- KPI deltas ---
function buildDeltaAbs(a, b, direction = "neutral", unit = "") {
  if (a == null || b == null) return null;
  const diff = a - b;
  if (diff === 0) return { arrow: "=", text: `0${unit}`, cls: "kpi-delta--neutral" };
  let cls = "kpi-delta--neutral";
  if (direction === "up") cls = diff > 0 ? "kpi-delta--good" : "kpi-delta--bad";
  if (direction === "down") cls = diff < 0 ? "kpi-delta--good" : "kpi-delta--bad";
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  return { arrow, text: `${sign}${fmt(Math.abs(diff))}${unit}`, cls };
}
function buildDeltaDuration(aSec, bSec) {
  if (aSec == null || bSec == null) return null;
  const diff = aSec - bSec;
  if (Math.abs(diff) < 1) return { arrow: "=", text: "0s", cls: "kpi-delta--neutral" };
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  const cls = diff > 0 ? "kpi-delta--good" : "kpi-delta--bad";
  return { arrow, text: `${sign}${formatDuration(Math.abs(diff))}`, cls };
}

const kpis = computed(() => {
  const ga = statsA.value.global;
  const gb = statsB.value.global;
  return [
    {
      label: L.value.uniqueKpi,
      a: { display: fmt(personsA.value) },
      b: { display: fmt(personsB.value) },
      delta: buildDeltaAbs(personsA.value, personsB.value, "up"),
    },
    {
      label: L.value.remoteKpi,
      a: { display: fmt(remoteA.value) },
      b: { display: fmt(remoteB.value) },
      delta: buildDeltaAbs(remoteA.value, remoteB.value, "up"),
    },
    {
      label: t("viewersCompare.kpi.totalViews"),
      a: { display: fmt(ga.totalViews || 0) },
      b: { display: fmt(gb.totalViews || 0) },
      delta: buildDeltaAbs(ga.totalViews || 0, gb.totalViews || 0, "up"),
    },
    {
      label: t("viewersCompare.kpi.avgDuration"),
      a: { display: formatDuration(ga.avgViewDurationSec || 0) },
      b: { display: formatDuration(gb.avgViewDurationSec || 0) },
      delta: buildDeltaDuration(ga.avgViewDurationSec || 0, gb.avgViewDurationSec || 0),
    },
  ];
});

// --- Origines comparées ---
const allOrigins = computed(() => {
  const set = new Set();
  for (const o of statsA.value.origins || []) if (o.origin) set.add(o.origin);
  for (const o of statsB.value.origins || []) if (o.origin) set.add(o.origin);
  return [...set];
});

const originColorMap = computed(() => {
  const map = {};
  allOrigins.value.forEach((o, i) => (map[o] = ORIGIN_PALETTE[i % ORIGIN_PALETTE.length]));
  return map;
});

function originRow(stats) {
  const total = (stats.origins || []).reduce((s, o) => s + (o.views || 0), 0);
  if (total === 0) return [];
  return allOrigins.value
    .map((origin) => {
      const found = (stats.origins || []).find((o) => o.origin === origin);
      const views = found?.views || 0;
      return {
        origin,
        views,
        pct: (views / total) * 100,
        color: originColorMap.value[origin],
      };
    })
    .filter((o) => o.views > 0)
    .sort((a, b) => b.pct - a.pct);
}

const originRowA = computed(() => originRow(statsA.value));
const originRowB = computed(() => originRow(statsB.value));

// --- Daily chart J0/J1/J2 ---
// Pour chaque event, on prend uniqueByDay [{day:"YYYY-MM-DD", count:N}],
// on calcule l'offset (en jours) depuis le 1er jour avec count > 0 = J0.
function alignDaysOnJ0(uniqueByDay) {
  const days = (uniqueByDay || []).filter((d) => d.count > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (days.length === 0) return { offsets: [], byOffset: {} };
  const day0 = days[0].day;
  const t0 = new Date(day0 + "T00:00:00Z").getTime();
  const byOffset = {};
  for (const d of days) {
    const t = new Date(d.day + "T00:00:00Z").getTime();
    const offset = Math.round((t - t0) / (24 * 3600 * 1000));
    byOffset[offset] = d.count;
  }
  const offsets = Object.keys(byOffset).map(Number).sort((a, b) => a - b);
  return { offsets, byOffset };
}

const dailyChart = computed(() => {
  const a = alignDaysOnJ0(statsA.value.uniqueByDay);
  const b = alignDaysOnJ0(statsB.value.uniqueByDay);
  // Replay : on superpose les courbes de delegues CUMULES (A/B) sur 2e axe
  // (carry-forward, alignees sur le meme J0 que les barres quotidiennes).
  const isReplay = props.kind === "replay";
  const ca = isReplay ? alignDaysOnJ0(statsA.value.cumulativeUniqueByDay) : { offsets: [], byOffset: {} };
  const cb = isReplay ? alignDaysOnJ0(statsB.value.cumulativeUniqueByDay) : { offsets: [], byOffset: {} };
  const lastOffset = (x) => (x.offsets.length > 0 ? x.offsets[x.offsets.length - 1] : -1);
  const maxOffset = Math.max(lastOffset(a), lastOffset(b), lastOffset(ca), lastOffset(cb));
  if (maxOffset < 0) return { labels: [], datasets: [] };
  const labels = [];
  const dataA = [];
  const dataB = [];
  const cumA = [];
  const cumB = [];
  let lastCa = 0;
  let lastCb = 0;
  const dp = t("viewersCompare.dayPrefix");
  for (let i = 0; i <= maxOffset; i++) {
    labels.push(`${dp}${i}`);
    dataA.push(a.byOffset[i] || 0);
    dataB.push(b.byOffset[i] || 0);
    if (ca.byOffset[i] != null) lastCa = ca.byOffset[i];
    if (cb.byOffset[i] != null) lastCb = cb.byOffset[i];
    cumA.push(lastCa);
    cumB.push(lastCb);
  }
  const datasets = [
    { type: "bar", label: shortName(props.eventName), data: dataA, backgroundColor: COLORS.current, borderRadius: 6, yAxisID: "y", order: 3 },
    { type: "bar", label: shortName(props.compareEventName), data: dataB, backgroundColor: COLORS.compare, borderRadius: 6, yAxisID: "y", order: 3 },
  ];
  if (isReplay) {
    datasets.push(
      { type: "line", label: t("viewersCompare.datasets.cumul", { name: shortName(props.eventName) }), data: cumA, borderColor: COLORS.current, backgroundColor: "rgba(39,206,113,0.10)", fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2.5, yAxisID: "y1", order: 1 },
      { type: "line", label: t("viewersCompare.datasets.cumul", { name: shortName(props.compareEventName) }), data: cumB, borderColor: COLORS.compare, backgroundColor: "rgba(156,163,175,0.10)", fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2.5, borderDash: [5, 4], yAxisID: "y1", order: 2 },
    );
  }
  return { labels, datasets };
});

const dailyChartOptions = computed(() => {
  const isReplay = props.kind === "replay";
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.dataset.yAxisID === "y1"
              ? t("viewersCompare.tooltip.cumulDelegates", { label: ctx.dataset.label, n: fmt(ctx.parsed.y) })
              : t("viewersCompare.tooltip.delegatesPerDay", { label: ctx.dataset.label, n: fmt(ctx.parsed.y) }),
        },
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 }, title: isReplay ? { display: true, text: t("viewersCompare.axis.uniquePerDay"), font: { size: 12 } } : { display: false } },
      x: { grid: { display: false } },
    },
  };
  if (isReplay) {
    opts.scales.y1 = {
      position: "right", beginAtZero: true,
      grid: { display: false }, ticks: { precision: 0 },
      title: { display: true, text: t("viewersCompare.axis.cumul"), font: { size: 12 } },
    };
  }
  return opts;
});

// --- Présents physiques qui consultent du replay (replay uniquement) ---
// Funnel "venu sur place PUIS revu en replay", compare A vs B (par jour).

// Chart mixte comparé : barres groupees par jour (A/B, axe y) + courbes cumulees
// (A/B, axe y1), alignees J0. `cumA`/`cumB` (optionnels) = series cumulees
// DEDIEES (ex: cumul de delegues DISTINCTS) reportees a plat (carry-forward) ;
// sinon la cumulee est la somme courante des valeurs journalieres (ok pour des
// vues additives).
function buildCompareDailyMixed(dailyA, dailyB, cumA = null, cumB = null) {
  const a = alignDaysOnJ0(dailyA || []);
  const b = alignDaysOnJ0(dailyB || []);
  const ca = cumA ? alignDaysOnJ0(cumA) : null;
  const cb = cumB ? alignDaysOnJ0(cumB) : null;
  const last = (x) => (x && x.offsets.length > 0 ? x.offsets[x.offsets.length - 1] : -1);
  const maxOffset = Math.max(last(a), last(b), last(ca), last(cb));
  if (maxOffset < 0) return { labels: [], datasets: [] };
  const labels = [];
  const dA = [];
  const dB = [];
  const cumAArr = [];
  const cumBArr = [];
  let sa = 0;
  let sb = 0;
  let lastCa = 0;
  let lastCb = 0;
  const dp = t("viewersCompare.dayPrefix");
  for (let i = 0; i <= maxOffset; i++) {
    labels.push(`${dp}${i}`);
    const va = a.byOffset[i] || 0;
    const vb = b.byOffset[i] || 0;
    dA.push(va);
    dB.push(vb);
    if (ca) {
      if (ca.byOffset[i] != null) lastCa = ca.byOffset[i];
      cumAArr.push(lastCa);
    } else {
      sa += va;
      cumAArr.push(sa);
    }
    if (cb) {
      if (cb.byOffset[i] != null) lastCb = cb.byOffset[i];
      cumBArr.push(lastCb);
    } else {
      sb += vb;
      cumBArr.push(sb);
    }
  }
  return {
    labels,
    datasets: [
      { type: "bar", label: shortName(props.eventName), data: dA, backgroundColor: COLORS.current, borderRadius: 5, yAxisID: "y", order: 3 },
      { type: "bar", label: shortName(props.compareEventName), data: dB, backgroundColor: COLORS.compare, borderRadius: 5, yAxisID: "y", order: 3 },
      { type: "line", label: t("viewersCompare.datasets.cumulSingle", { name: shortName(props.eventName) }), data: cumAArr, borderColor: COLORS.current, backgroundColor: "rgba(39,206,113,0.10)", fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2.5, yAxisID: "y1", order: 1 },
      { type: "line", label: t("viewersCompare.datasets.cumulSingle", { name: shortName(props.compareEventName) }), data: cumBArr, borderColor: COLORS.compare, backgroundColor: "rgba(156,163,175,0.10)", fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2.5, borderDash: [5, 4], yAxisID: "y1", order: 2 },
    ],
  };
}
// unitKind : 'views' | 'delegates' — pilote les libelles de tooltip i18n.
function mixedCompareOptions(perDayTitle, unitKind) {
  const cumulKey = unitKind === "views" ? "cumulViews" : "cumulDelegates";
  const perDayKey = unitKind === "views" ? "viewsPerDay" : "delegatesPerDay";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { font: { size: 12 }, usePointStyle: true, pointStyle: "rectRounded" } },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            t(`viewersCompare.tooltip.${ctx.dataset.yAxisID === "y1" ? cumulKey : perDayKey}`, {
              label: ctx.dataset.label,
              n: fmt(ctx.parsed.y),
            }),
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { position: "left", beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: perDayTitle, font: { size: 12 } } },
      y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { precision: 0 }, title: { display: true, text: t("viewersCompare.axis.cumulSingle"), font: { size: 12 } } },
    },
  };
}

// Vues en replay par jour — comparé (tous viewers) : barres/jour + cumul (somme).
const viewsByDayCompareChart = computed(() =>
  props.kind === "replay" ? buildCompareDailyMixed(statsA.value.viewsByDay, statsB.value.viewsByDay) : { labels: [], datasets: [] },
);
const viewsByDayCompareOptions = computed(() => mixedCompareOptions(t("viewersCompare.axis.viewsPerDay"), "views"));

// Vues en replay par jour des PRESENTS PHYSIQUES — comparé : barres/jour + cumul (somme).
const physicalReplayViewsCompareChart = computed(() => {
  if (props.kind !== "replay") return { labels: [], datasets: [] };
  const aD = buildPhysicalReplayByDay(statsA.value.items, lookupA.value).map((d) => ({ day: d.day, count: d.views }));
  const bD = buildPhysicalReplayByDay(statsB.value.items, lookupB.value).map((d) => ({ day: d.day, count: d.views }));
  return buildCompareDailyMixed(aD, bD);
});
const physicalReplayViewsCompareOptions = computed(() => mixedCompareOptions(t("viewersCompare.axis.viewsPerDay"), "views"));

// Délégués uniques PHYSIQUEMENT PRESENTS — comparé : barres/jour + cumul DISTINCT
// (un délégué compté 1x, au jour de sa 1ère vue replay).
const physicalReplayUniqueCompareChart = computed(() => {
  if (props.kind !== "replay") return { labels: [], datasets: [] };
  const aD = buildPhysicalReplayByDay(statsA.value.items, lookupA.value).map((d) => ({ day: d.day, count: d.uniqueDelegates }));
  const bD = buildPhysicalReplayByDay(statsB.value.items, lookupB.value).map((d) => ({ day: d.day, count: d.uniqueDelegates }));
  const aC = buildPhysicalReplayCumulative(statsA.value.items, lookupA.value);
  const bC = buildPhysicalReplayCumulative(statsB.value.items, lookupB.value);
  return buildCompareDailyMixed(aD, bD, aC, bC);
});
const physicalReplayUniqueCompareOptions = computed(() => mixedCompareOptions(t("viewersCompare.axis.delegatesPerDay"), "delegates"));
</script>

<style scoped>
.cmp-event-row {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 14px; font-size: 15px;
  flex-wrap: wrap;
}
.cmp-event { display: flex; align-items: center; gap: 8px; }
.cmp-event-dot { width: 10px; height: 10px; border-radius: 50%; }
.cmp-event-meta { color: var(--text-muted); font-size: 13px; }
.cmp-vs { font-weight: 700; color: var(--text-muted); }

/* Stacked 100% rows */
.origin-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 14px;
  align-items: center;
  margin: 10px 0;
}
.origin-event-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; color: var(--text);
}
.origin-event-label > span:nth-child(2) { font-weight: 600; }
.event-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.origin-volume { color: var(--text-muted); font-size: 13px; }
.origin-stack-bar {
  display: flex; width: 100%; height: 36px;
  border-radius: 6px; overflow: hidden; background: #f0f0f0;
}
.origin-segment {
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 13px; font-weight: 600;
  overflow: hidden; white-space: nowrap;
  transition: width 0.4s ease;
}
.origin-legend {
  display: flex; flex-wrap: wrap; gap: 12px 18px;
  font-size: 14px; color: var(--text); margin-top: 12px;
}
.origin-legend .legend-item { display: inline-flex; align-items: center; gap: 6px; }
.origin-legend .swatch { width: 11px; height: 11px; border-radius: 3px; }

.cmp-axis-hint { font-size: 12px; color: var(--text-muted); font-style: italic; }
.cmp-loading, .cmp-error {
  background: var(--card); border-radius: 10px; padding: 32px 16px;
  box-shadow: var(--shadow); text-align: center;
}
.cmp-error { color: var(--danger); }
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 15px; }
.spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-label { margin-top: 12px; color: var(--text-muted); }
</style>
