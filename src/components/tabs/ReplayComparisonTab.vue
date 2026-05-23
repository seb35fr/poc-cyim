<template>
  <div>
    <div v-if="loading" class="cmp-loading">
      <div class="spinner"></div>
      <p class="loading-label">Chargement des vues replay (2 events)…</p>
    </div>

    <div v-else-if="error" class="cmp-error">
      <p><strong>Erreur :</strong> {{ error }}</p>
    </div>

    <template v-else>
      <!-- En-tête identité des 2 events -->
      <div class="cmp-event-row">
        <div class="cmp-event">
          <span class="cmp-event-dot" :style="{ background: COLORS.current }"></span>
          <strong>{{ shortName(eventName) }}</strong>
          <span class="cmp-event-meta">{{ fmt(liveStatsA.global.totalViews) }} vues · {{ fmt(liveStatsA.global.uniqueUsers) }} delegues</span>
        </div>
        <span class="cmp-vs">vs</span>
        <div class="cmp-event">
          <span class="cmp-event-dot" :style="{ background: COLORS.compare }"></span>
          <strong>{{ shortName(compareEventName) }}</strong>
          <span class="cmp-event-meta">{{ fmt(liveStatsB.global.totalViews) }} vues · {{ fmt(liveStatsB.global.uniqueUsers) }} delegues</span>
        </div>
      </div>

      <!-- KPI compare grid 4 cards -->
      <div class="kpi-compare-grid">
        <div v-for="kpi in kpis" :key="kpi.label" class="kpi-compare-card">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-line">
            <div class="kpi-side">
              <div class="kpi-side-header">
                <span class="kpi-dot" :style="{ background: COLORS.current }"></span>
                <span class="kpi-side-name">{{ shortName(eventName) }}</span>
              </div>
              <div class="kpi-side-value">{{ kpi.a.display }}</div>
              <div class="kpi-side-sub">{{ kpi.a.sub || ' ' }}</div>
            </div>
            <div class="kpi-delta-wrap">
              <span v-if="kpi.delta" class="kpi-delta" :class="kpi.delta.cls">
                {{ kpi.delta.arrow }} {{ kpi.delta.text }}
              </span>
              <span v-else class="kpi-delta kpi-delta--neutral">—</span>
            </div>
            <div class="kpi-side kpi-side--compare">
              <div class="kpi-side-header">
                <span class="kpi-side-name">{{ shortName(compareEventName) }}</span>
                <span class="kpi-dot" :style="{ background: COLORS.compare }"></span>
              </div>
              <div class="kpi-side-value">{{ kpi.b.display }}</div>
              <div class="kpi-side-sub">{{ kpi.b.sub || ' ' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Vues par origine : 2 barres 100% stacked l'une sous l'autre -->
      <div class="chart-card" v-if="allOrigins.length > 0">
        <div class="chart-header">
          <h3>Vues par origine — mix comparé (% du total de chaque event)</h3>
        </div>
        <div class="origin-row">
          <div class="origin-event-label">
            <span class="kpi-dot" :style="{ background: COLORS.current }"></span>
            <span>{{ shortName(eventName) }}</span>
            <span class="origin-volume">{{ fmt(liveStatsA.global.totalViews) }} vues</span>
          </div>
          <div class="origin-stack-bar">
            <div
              v-for="o in originRowA"
              :key="`a-${o.origin}`"
              class="origin-segment"
              :style="{ width: o.pct + '%', background: o.color }"
              :title="`${o.origin} · ${fmt(o.views)} vues (${o.pct.toFixed(1)}%)`"
            >
              <span v-if="o.pct > 6">{{ o.origin }} · {{ o.pct.toFixed(0) }}%</span>
            </div>
          </div>
        </div>
        <div class="origin-row">
          <div class="origin-event-label">
            <span class="kpi-dot" :style="{ background: COLORS.compare }"></span>
            <span>{{ shortName(compareEventName) }}</span>
            <span class="origin-volume">{{ fmt(liveStatsB.global.totalViews) }} vues</span>
          </div>
          <div class="origin-stack-bar">
            <div
              v-for="o in originRowB"
              :key="`b-${o.origin}`"
              class="origin-segment"
              :style="{ width: o.pct + '%', background: o.color }"
              :title="`${o.origin} · ${fmt(o.views)} vues (${o.pct.toFixed(1)}%)`"
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

      <!-- Délégués uniques en replay par jour : grouped bars J0/J1/J2... -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Délégués uniques en replay par jour</h3>
          <span class="cmp-axis-hint">Axe X : décalage en jours depuis le 1<sup>er</sup> visionnage VOD de chaque event (J0)</span>
        </div>
        <div v-if="dailyChart.labels.length > 0" :style="{ position: 'relative', height: '300px' }">
          <Bar :data="dailyChart" :options="dailyChartOptions" />
        </div>
        <p v-else class="empty-msg">Aucune donnée par jour exploitable sur l'un ou l'autre event</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Bar } from "vue-chartjs";
import { useReplay } from "../../composables/useReplay.js";
import {
  buildDelegateLookup,
  getRemoteOnlyDelegateIds,
} from "../../utils/viewerJoin.js";

const props = defineProps({
  delegates: { type: Array, default: () => [] },
  compareDelegates: { type: Array, default: () => [] },
  eventName: { type: String, default: "" },
  compareEventName: { type: String, default: "" },
});

const route = useRoute();
const eventId = route.params.eventId;
const compareEventId = route.query.compareWith || null;

const replayA = useReplay(eventId);
const replayB = compareEventId ? useReplay(compareEventId, { autoRefresh: false }) : null;

const loading = computed(() => replayA.loading.value || (replayB?.loading.value ?? false));
const error = computed(() => replayA.error.value || replayB?.error.value || null);

const liveStatsA = computed(() => replayA.stats.value || { global: {}, items: [], origins: [], uniqueByDay: [] });
const liveStatsB = computed(() => replayB?.stats.value || { global: {}, items: [], origins: [], uniqueByDay: [] });

const COLORS = {
  current: "#27CE71",
  compare: "#9CA3AF",
};

// Palette stable pour les origines (mêmes couleurs sur les 2 barres).
const ORIGIN_PALETTE = ["#1E4E66", "#30DD92", "#6F45FF", "#FF8A3D", "#1FB6D6", "#E07A5F"];

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
function shortName(name) {
  if (!name) return "—";
  return name.length > 38 ? name.slice(0, 36) + "…" : name;
}
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

// --- "Live sans présence physique" (cf. LiveTab) --
const lookupA = computed(() => buildDelegateLookup(props.delegates));
const lookupB = computed(() => buildDelegateLookup(props.compareDelegates));
const liveRemoteA = computed(() => getRemoteOnlyDelegateIds(liveStatsA.value.items, lookupA.value).size);
const liveRemoteB = computed(() => getRemoteOnlyDelegateIds(liveStatsB.value.items, lookupB.value).size);

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
  const ga = liveStatsA.value.global;
  const gb = liveStatsB.value.global;
  return [
    {
      label: "Délégués uniques (replay)",
      a: { display: fmt(ga.uniqueUsers || 0) },
      b: { display: fmt(gb.uniqueUsers || 0) },
      delta: buildDeltaAbs(ga.uniqueUsers || 0, gb.uniqueUsers || 0, "up"),
    },
    {
      label: "Replay sans présence physique",
      a: { display: fmt(liveRemoteA.value) },
      b: { display: fmt(liveRemoteB.value) },
      delta: buildDeltaAbs(liveRemoteA.value, liveRemoteB.value, "up"),
    },
    {
      label: "Vues totales",
      a: { display: fmt(ga.totalViews || 0) },
      b: { display: fmt(gb.totalViews || 0) },
      delta: buildDeltaAbs(ga.totalViews || 0, gb.totalViews || 0, "up"),
    },
    {
      label: "Durée moyenne / vue",
      a: { display: formatDuration(ga.avgViewDurationSec || 0) },
      b: { display: formatDuration(gb.avgViewDurationSec || 0) },
      delta: buildDeltaDuration(ga.avgViewDurationSec || 0, gb.avgViewDurationSec || 0),
    },
  ];
});

// --- Origines comparées ---
const allOrigins = computed(() => {
  const set = new Set();
  for (const o of liveStatsA.value.origins || []) if (o.origin) set.add(o.origin);
  for (const o of liveStatsB.value.origins || []) if (o.origin) set.add(o.origin);
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

const originRowA = computed(() => originRow(liveStatsA.value));
const originRowB = computed(() => originRow(liveStatsB.value));

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
  const a = alignDaysOnJ0(liveStatsA.value.uniqueByDay);
  const b = alignDaysOnJ0(liveStatsB.value.uniqueByDay);
  const maxOffset = Math.max(
    a.offsets.length > 0 ? a.offsets[a.offsets.length - 1] : -1,
    b.offsets.length > 0 ? b.offsets[b.offsets.length - 1] : -1,
  );
  if (maxOffset < 0) return { labels: [], datasets: [] };
  const labels = [];
  const dataA = [];
  const dataB = [];
  for (let i = 0; i <= maxOffset; i++) {
    labels.push(`J${i}`);
    dataA.push(a.byOffset[i] || 0);
    dataB.push(b.byOffset[i] || 0);
  }
  return {
    labels,
    datasets: [
      { label: shortName(props.eventName), data: dataA, backgroundColor: COLORS.current, borderRadius: 6 },
      { label: shortName(props.compareEventName), data: dataB, backgroundColor: COLORS.compare, borderRadius: 6 },
    ],
  };
});

const dailyChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top" },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label} · ${fmt(ctx.parsed.y)} délégués`,
      },
    },
  },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0 } },
    x: { grid: { display: false } },
  },
};
</script>

<style scoped>
.cmp-event-row {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 14px; font-size: 13px;
  flex-wrap: wrap;
}
.cmp-event { display: flex; align-items: center; gap: 8px; }
.cmp-event-dot { width: 10px; height: 10px; border-radius: 50%; }
.cmp-event-meta { color: var(--text-muted); font-size: 11px; }
.cmp-vs { font-weight: 700; color: var(--text-muted); }

/* KPI compare grid (dupliqué depuis ComparisonTab pour styles scoped) */
.kpi-compare-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 12px; margin-bottom: 14px;
}
.kpi-compare-card {
  background: var(--card); border-radius: 10px; padding: 12px 16px 14px;
  box-shadow: var(--shadow);
  display: flex; flex-direction: column;
}
.kpi-compare-card .kpi-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-muted); font-weight: 600;
  padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; margin-bottom: 10px;
}
.kpi-line { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 12px; }
.kpi-side { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.kpi-side--compare { align-items: flex-end; text-align: right; }
.kpi-side-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--text-muted); font-weight: 500;
  min-width: 0; max-width: 100%;
}
.kpi-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.kpi-side-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-side-value { font-weight: 700; color: var(--text); font-size: 22px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.kpi-side-sub { color: var(--text-muted); font-size: 11px; line-height: 1.3; min-height: 14px; }
.kpi-delta-wrap { align-self: center; padding-top: 16px; }
.kpi-delta {
  font-weight: 700; font-size: 11px;
  padding: 4px 10px; border-radius: 12px; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
.kpi-delta--good { color: #047857; background: #d1fae5; }
.kpi-delta--bad { color: #b91c1c; background: #fee2e2; }
.kpi-delta--neutral { color: var(--text-muted); background: #f3f4f6; }

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
  font-size: 13px; color: var(--text);
}
.origin-event-label > span:nth-child(2) { font-weight: 600; }
.origin-volume { color: var(--text-muted); font-size: 11px; }
.origin-stack-bar {
  display: flex; width: 100%; height: 36px;
  border-radius: 6px; overflow: hidden; background: #f0f0f0;
}
.origin-segment {
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 11px; font-weight: 600;
  overflow: hidden; white-space: nowrap;
  transition: width 0.4s ease;
}
.origin-legend {
  display: flex; flex-wrap: wrap; gap: 12px 18px;
  font-size: 12px; color: var(--text); margin-top: 12px;
}
.origin-legend .legend-item { display: inline-flex; align-items: center; gap: 6px; }
.origin-legend .swatch { width: 11px; height: 11px; border-radius: 3px; }

.cmp-axis-hint { font-size: 10px; color: var(--text-muted); font-style: italic; }
.cmp-loading, .cmp-error {
  background: var(--card); border-radius: 10px; padding: 32px 16px;
  box-shadow: var(--shadow); text-align: center;
}
.cmp-error { color: var(--danger); }
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
.spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-label { margin-top: 12px; color: var(--text-muted); }
</style>
