<template>
  <div>
    <div v-if="loading" class="replay-state">
      <div class="spinner"></div>
      <p class="loading-label">Chargement des replays VOD...</p>
      <p class="replay-progress">{{ fmt(progress.loaded) }} vues chargees</p>
    </div>

    <div v-else-if="error" class="replay-state error-state">
      <p><strong>Erreur Elasticsearch :</strong> {{ error }}</p>
      <p class="replay-hint">
        Verifier que <code>VITE_ES_URL</code> est configure et que l'index
        <code>stats_user__vod-view-per-user-per-session-per-origin</code> est accessible.
      </p>
      <button class="btn-side" @click="reload">Reessayer</button>
    </div>

    <template v-else>
      <div v-if="refreshing" class="refresh-bar-wrapper">
        <div class="refresh-bar">
          <div class="refresh-bar-fill" :style="{ width: '50%' }"></div>
        </div>
        <p class="refresh-bar-text">Rafraichissement...</p>
      </div>

      <!-- KPI principal -->
      <div class="kpi-grid">
        <div class="kpi-card green">
          <div class="kpi-label">Delegues uniques (replay)</div>
          <div class="kpi-value">{{ fmt(g.uniqueUsers) }}</div>
          <div class="kpi-sub">ayant consulte au moins une VOD</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-label">Replay sans présence physique</div>
          <div class="kpi-value">{{ fmt(uniqueReplayUsersWithoutCheckin) }}</div>
          <div class="kpi-sub">
            délégués de l'event ayant consulté du replay mais sans check-in
            <span v-if="replayJoinStats.unknown > 0">
              · {{ fmt(replayJoinStats.unknown) }} viewers non liés à la registration
            </span>
          </div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-label">Vues totales</div>
          <div class="kpi-value">{{ fmt(g.totalViews) }}</div>
          <div class="kpi-sub">{{ fmt(g.distinctSessions) }} sessions distinctes</div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-label">Durée moyenne / vue</div>
          <div class="kpi-value">{{ formatDuration(g.avgViewDurationSec) }}</div>
          <div class="kpi-sub">{{ formatDuration(g.totalDurationSec) }} cumulées</div>
        </div>
      </div>

      <!-- Origine (camembert) gauche / Delegues uniques par jour droite -->
      <div class="charts-row">
        <div class="chart-card" v-if="stats.origins.length > 0">
          <div class="chart-header">
            <h3>Vues totales par origine</h3>
            <CsvButton
              filename="replay-par-origine"
              :headers="['Origine', 'Vues', 'Délégués uniques']"
              :rows="stats.origins.map(o => [o.origin, o.views, o.uniqueUsers])"
            />
          </div>
          <div class="origin-pie-wrap">
            <div class="origin-pie">
              <DoughnutChart
                :labels="stats.origins.map(o => o.origin)"
                :data="stats.origins.map(o => o.views)"
                :colors="ORIGIN_COLORS"
              />
            </div>
            <div class="origin-legend">
              <div v-for="(o, i) in stats.origins" :key="o.origin" class="origin-legend-row">
                <span class="origin-swatch" :style="{ background: ORIGIN_COLORS[i % ORIGIN_COLORS.length] }"></span>
                <span class="origin-name">{{ o.origin }}</span>
                <strong>{{ fmt(o.views) }}</strong>
                <span class="origin-sub">{{ pctOf(o.views, totalOriginViews) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>Délégués uniques en replay par jour</h3>
            <CsvButton
              filename="replay-delegues-uniques-par-jour"
              :headers="['Jour', 'Delegues uniques']"
              :rows="stats.uniqueByDay.map(d => [d.day, d.count])"
            />
          </div>
          <div v-if="stats.uniqueByDay.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="byDayChart" :options="byDayOptions" />
          </div>
          <p v-else class="empty-msg">Aucun horodatage exploitable dans les vues VOD</p>
        </div>
      </div>

      <!-- Engagement standalone -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Engagement — sessions consultées par délégué</h3>
          <CsvButton
            filename="replay-engagement"
            :headers="['Tranche', 'Délégués']"
            :rows="Object.entries(stats.sessionsPerUserBuckets).map(([k, v]) => [k, v])"
          />
        </div>
        <div :style="{ position: 'relative', height: '260px' }">
          <Bar :data="engagementChart" :options="engagementOptions" />
        </div>
      </div>

      <!-- Top sessions replay par audience unique -->
      <div class="chart-card" v-if="stats.topSessions.length > 0">
        <div class="chart-header">
          <h3>Top sessions VOD par délégués uniques</h3>
          <CsvButton
            filename="replay-top-sessions"
            :headers="['Session', 'Délégués uniques', 'Vues', 'Durée moyenne (s)']"
            :rows="stats.topSessions.slice(0, topN).map(s => [s.title, s.uniqueUsers, s.views, Math.round(s.avgDuration)])"
          />
        </div>
        <HBarChart
          :labels="stats.topSessions.slice(0, topN).map(s => truncate(s.title, 60))"
          :data="stats.topSessions.slice(0, topN).map(s => s.uniqueUsers)"
          :height="Math.max(220, Math.min(topN, stats.topSessions.length) * 22 + 40)"
          color="#6F45FF"
        />
      </div>

      <!-- Tableau detaille -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Détail des vues VOD ({{ fmt(stats.items.length) }} au total)</h3>
          <CsvButton
            filename="replay-detail"
            :headers="['Délégué', 'Email', 'Session ID', 'Session', 'Origine', 'Horodatage', 'Durée (s)']"
            :rows="stats.items.map(it => [it.fullName, it.email, it.sessionId || '', it.sessionTitle, it.origin, formatTimestamp(it.timestamp) || '', Math.round(it.duration)])"
          />
        </div>
        <div v-if="stats.items.length > 0" class="replay-table-wrap">
          <table class="data-table replay-detail-table">
            <thead>
              <tr>
                <th>Délégué</th>
                <th>Email</th>
                <th>Session ID</th>
                <th>Session</th>
                <th>Origine</th>
                <th>Horodatage</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in pagedItems" :key="it.id">
                <td>{{ it.fullName }}</td>
                <td>{{ it.email || '—' }}</td>
                <td class="mono">{{ it.sessionId || '—' }}</td>
                <td>{{ it.sessionTitle || '—' }}</td>
                <td><span class="origin-pill">{{ it.origin }}</span></td>
                <td>{{ formatTimestamp(it.timestamp) || '—' }}</td>
                <td>{{ formatDuration(it.duration) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="stats.items.length > pageSize" class="replay-hint">
            Affichage des {{ pageSize }} premières vues (sur {{ fmt(stats.items.length) }}). Utilisez le CSV pour tout exporter.
          </p>
        </div>
        <p v-else class="empty-msg">Aucune vue VOD enregistrée</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import CsvButton from "../CsvButton.vue";
import { useReplay } from "../../composables/useReplay.js";
import { parisDateParts } from "../../utils/parisTime.js";

const props = defineProps({
  delegates: { type: Array, default: () => [] },
});

const route = useRoute();
const eventId = route.params.eventId;
const { loading, refreshing, error, progress, stats, reload } = useReplay(eventId);

const g = computed(() => stats.value.global);
const topN = 15;
const pageSize = 200;

const pagedItems = computed(() => stats.value.items.slice(0, pageSize));

// --- Jointure ES replay <-> delegates : meme logique que LiveTab ---
function hasValidCheckin(d) {
  if (!d?.checkedInDate) return false;
  const t = Date.parse(d.checkedInDate);
  return Number.isFinite(t);
}

const delegateLookup = computed(() => {
  const map = new Map();
  for (const d of props.delegates || []) {
    const checkedIn = hasValidCheckin(d);
    const keys = [d.id, d.contactId, d.externalContactId, d.externalId];
    const ext = d.contact?.externalIds;
    if (Array.isArray(ext)) {
      for (const e of ext) if (e?.value) keys.push(e.value);
    }
    for (const k of keys) {
      if (k && !map.has(k)) map.set(k, checkedIn);
    }
  }
  return map;
});

const replayJoinStats = computed(() => {
  const lookup = delegateLookup.value;
  const checkedIn = new Set();
  const noCheckin = new Set();
  const unknown = new Set();
  for (const it of stats.value.items) {
    const key = it.delegateId || it.userId;
    if (!key) continue;
    const matchedCheckin = lookup.has(it.delegateId)
      ? lookup.get(it.delegateId)
      : lookup.has(it.userId)
        ? lookup.get(it.userId)
        : null;
    if (matchedCheckin === null) unknown.add(key);
    else if (matchedCheckin) checkedIn.add(key);
    else noCheckin.add(key);
  }
  return {
    checkedIn: checkedIn.size,
    noCheckin: noCheckin.size,
    unknown: unknown.size,
  };
});

const uniqueReplayUsersWithoutCheckin = computed(() => replayJoinStats.value.noCheckin);

// Liste detaillee pour debug console
const replayWithoutCheckinList = computed(() => {
  const lookup = delegateLookup.value;
  const seen = new Set();
  const list = [];
  for (const it of stats.value.items) {
    const key = it.delegateId || it.userId;
    if (!key || seen.has(key)) continue;
    const matchedCheckin = lookup.has(it.delegateId)
      ? lookup.get(it.delegateId)
      : lookup.has(it.userId)
        ? lookup.get(it.userId)
        : null;
    if (matchedCheckin === false) {
      seen.add(key);
      list.push({
        delegateId: it.delegateId || "",
        userId: it.userId || "",
        fullName: it.fullName,
        email: it.email,
      });
    }
  }
  return list;
});

watch(
  replayWithoutCheckinList,
  (list) => {
    if (list.length === 0) return;
    console.log(`[Replay] ${list.length} delegues ont consulte du replay SANS check-in physique :`);
    console.table(list);
  },
  { immediate: true },
);

const topOriginLabel = computed(() => {
  const top = stats.value.origins[0];
  if (!top) return "—";
  return `top : ${top.origin} (${top.views.toLocaleString("fr-FR")})`;
});

const byDayChart = computed(() => ({
  labels: stats.value.uniqueByDay.map((d) => d.day),
  datasets: [{
    label: "Délégués uniques",
    data: stats.value.uniqueByDay.map((d) => d.count),
    backgroundColor: "#6F45FF",
    borderRadius: 4,
    barThickness: Math.max(12, Math.min(40, 500 / (stats.value.uniqueByDay.length || 1))),
  }],
}));

const byDayOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 11 },
    },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.raw.toLocaleString("fr-FR")} délégués uniques` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

const ORIGIN_COLORS = ["#1E4E66", "#30DD92", "#6F45FF", "#FFA600", "#E53935", "#00BCD4", "#9C27B0", "#A3B86C"];

const totalOriginViews = computed(() =>
  stats.value.origins.reduce((s, o) => s + o.views, 0),
);

function pctOf(v, total) {
  if (!total) return "0%";
  return `${((v / total) * 100).toFixed(1)}%`;
}

const engagementChart = computed(() => {
  const buckets = stats.value.sessionsPerUserBuckets;
  const labels = ["1", "2-5", "6-10", "10+"];
  return {
    labels,
    datasets: [{
      label: "Délégués",
      data: labels.map((l) => buckets[l]),
      backgroundColor: ["#9CA3AF", "#1E4E66", "#30DD92", "#6F45FF"],
      borderRadius: 4,
      barThickness: 50,
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
      color: "#414141", font: { weight: 600, size: 11 },
    },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.raw.toLocaleString("fr-FR")} délégués` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");

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
  let parsed = ts;
  if (typeof ts === "number" && ts < 10 ** 12) parsed = ts * 1000;
  const p = parisDateParts(parsed);
  if (!p) return String(ts);
  return `${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
</script>

<style scoped>
.replay-state { text-align: center; padding: 60px 20px; }
.replay-progress { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.replay-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
.replay-hint code {
  background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
  font-family: "Fira Code", monospace; font-size: 10px;
}

.replay-table-wrap { max-height: 600px; overflow: auto; }
.replay-table-wrap .data-table th { position: sticky; top: 0; z-index: 2; }
.replay-detail-table { min-width: 900px; }
.replay-detail-table .mono {
  font-family: "Fira Code", Consolas, monospace;
  font-size: 10px; color: var(--text-secondary);
}

.origin-pill {
  display: inline-block; padding: 1px 7px;
  font-size: 10px; font-weight: 600;
  border-radius: 8px; background: #6F45FF; color: #fff;
}

.origin-pie-wrap {
  display: grid; grid-template-columns: 200px 1fr; gap: 16px; align-items: center;
}
.origin-pie { width: 200px; }
.origin-legend {
  display: flex; flex-direction: column; gap: 6px; font-size: 12px;
}
.origin-legend-row {
  display: grid; grid-template-columns: 12px 1fr auto auto;
  align-items: center; gap: 8px;
}
.origin-swatch { width: 12px; height: 12px; border-radius: 3px; }
.origin-name { color: var(--text); }
.origin-legend-row strong { color: var(--text); font-weight: 700; }
.origin-sub { color: var(--text-muted); font-size: 11px; min-width: 50px; text-align: right; }

@media (max-width: 700px) {
  .origin-pie-wrap { grid-template-columns: 1fr; }
  .origin-pie { width: 160px; margin: 0 auto; }
}
</style>
