<template>
  <div>
    <div v-if="loading" class="live-state">
      <div class="spinner"></div>
      <p class="loading-label">Chargement des vues live...</p>
      <p class="live-progress">{{ fmt(progress.loaded) }} vues chargees</p>
    </div>

    <div v-else-if="error" class="live-state error-state">
      <p><strong>Erreur Elasticsearch :</strong> {{ error }}</p>
      <p class="live-hint">
        Verifier que <code>VITE_ES_URL</code> est configure et que l'index
        <code>stats_user__live-view-duration-per-user-per-session</code> est accessible.
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
          <div class="kpi-label">Delegues uniques (live)</div>
          <div class="kpi-value">{{ fmt(g.uniqueUsers) }}</div>
          <div class="kpi-sub">ayant consulte au moins une session en live</div>
        </div>
        <div class="kpi-card orange">
          <div class="kpi-label">Live sans présence physique</div>
          <div class="kpi-value">{{ fmt(uniqueLiveUsersWithoutCheckin) }}</div>
          <div class="kpi-sub">
            délégués de l'event ayant regardé en live mais sans check-in
            <span v-if="liveJoinStats.unknown > 0">
              · {{ fmt(liveJoinStats.unknown) }} viewers non liés à la registration
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
          <div class="kpi-sub">{{ formatDuration(g.totalDurationSec) }} cumulees</div>
        </div>
      </div>

      <!-- Origine (camembert) gauche / Delegues uniques par jour droite -->
      <div class="charts-row">
        <div class="chart-card" v-if="stats.origins && stats.origins.length > 0">
          <div class="chart-header">
            <h3>Vues totales par origine</h3>
            <CsvButton
              filename="live-par-origine"
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
            <h3>Délégués uniques en live par jour</h3>
            <CsvButton
              filename="live-delegues-uniques-par-jour"
              :headers="['Jour', 'Delegues uniques']"
              :rows="stats.uniqueByDay.map(d => [d.day, d.count])"
            />
          </div>
          <div v-if="stats.uniqueByDay.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="byDayChart" :options="byDayOptions" />
          </div>
          <p v-else class="empty-msg">Aucun horodatage exploitable dans les vues live</p>
        </div>
      </div>

      <!-- Delegues uniques par tranche de 30 min de session_end -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Délégués uniques par tranche de 30 min</h3>
          <span class="chart-hint" style="margin: 0;">Bucketé sur la fin de session (heure de Paris)</span>
          <CsvButton
            filename="live-delegues-uniques-30min"
            :headers="['Créneau', 'Délégués uniques']"
            :rows="stats.uniqueBy30min.map(s => [s.slot, s.count])"
          />
        </div>
        <div v-if="stats.uniqueBy30min.length > 0" :style="{ position: 'relative', height: '320px' }">
          <Bar :data="by30minChart" :options="by30minOptions" />
        </div>
        <p v-else class="empty-msg">Aucune date de fin de session exploitable</p>
      </div>

      <!-- Camembert vues par session_type (cliquable -> filtre tableau) -->
      <div class="chart-card" v-if="stats.sessionTypes && stats.sessionTypes.length > 0">
        <div class="chart-header">
          <h3>Vues par type de session</h3>
          <span class="chart-hint" style="margin: 0;">Cliquez sur un segment pour filtrer le détail ci-dessous</span>
          <CsvButton
            filename="live-par-session-type"
            :headers="['Type', 'Vues', 'Délégués uniques']"
            :rows="stats.sessionTypes.map(t => [t.type, t.views, t.uniqueUsers])"
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
          Filtre actif sur le tableau : <strong>{{ selectedSessionType }}</strong>
          <button class="filter-clear" @click="selectedSessionType = null">✕ Effacer</button>
        </div>
      </div>

      <!-- Top sessions live par audience unique -->
      <div class="chart-card" v-if="stats.topSessions.length > 0">
        <div class="chart-header">
          <h3>Top sessions live par délégués uniques</h3>
          <CsvButton
            filename="live-top-sessions"
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

      <!-- Engagement : repartition par nombre de sessions consultees -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Engagement — nombre de sessions consultées par délégué</h3>
          <CsvButton
            filename="live-engagement"
            :headers="['Tranche', 'Délégués']"
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
          <h3>Détail des vues live ({{ fmt(filteredItems.length) }}{{ selectedSessionType ? ' · filtré' : '' }})</h3>
          <CsvButton
            filename="live-detail"
            :headers="['Délégué', 'Email', 'Session ID', 'Session', 'Type session', 'Début session', 'Horodatage vue', 'Durée (s)']"
            :rows="filteredItems.map(it => [it.fullName, it.email, it.sessionId || '', it.sessionTitle, it.sessionType, formatTimestamp(it.sessionStart) || '', formatTimestamp(it.timestamp) || '', Math.round(it.duration)])"
          />
        </div>
        <div v-if="filteredItems.length > 0" class="live-table-wrap">
          <table class="data-table live-detail-table">
            <thead>
              <tr>
                <th>Délégué</th>
                <th>Email</th>
                <th>Session ID</th>
                <th>Session</th>
                <th>Type</th>
                <th>Début session</th>
                <th>Horodatage vue</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in pagedItems" :key="it.id">
                <td>{{ it.fullName }}</td>
                <td>{{ it.email || '—' }}</td>
                <td class="mono">{{ it.sessionId || '—' }}</td>
                <td>{{ it.sessionTitle || '—' }}</td>
                <td>{{ it.sessionType || '—' }}</td>
                <td>{{ formatTimestamp(it.sessionStart) || '—' }}</td>
                <td>{{ formatTimestamp(it.timestamp) || '—' }}</td>
                <td>{{ formatDuration(it.duration) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredItems.length > pageSize" class="live-hint">
            Affichage des {{ pageSize }} premières vues (sur {{ fmt(filteredItems.length) }}). Utilisez le CSV pour tout exporter.
          </p>
        </div>
        <p v-else class="empty-msg">Aucune vue live enregistrée</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import CsvButton from "../CsvButton.vue";
import { useLive } from "../../composables/useLive.js";
import { parisDateParts } from "../../utils/parisTime.js";

const props = defineProps({
  // delegates de l'event (passes par StatisticsView) : utilise pour cross-matcher
  // user_id ES avec checkedInDate et identifier les spectateurs live a distance.
  delegates: { type: Array, default: () => [] },
});

const route = useRoute();
const eventId = route.params.eventId;
const { loading, refreshing, error, progress, stats, reload } = useLive(eventId);

const g = computed(() => stats.value.global);
const topN = 15;
const pageSize = 200;

// Filtre par session_type (declenche par clic sur le camembert ou la legende).
// null = pas de filtre.
const selectedSessionType = ref(null);

function onSessionTypeSelect(type) {
  selectedSessionType.value = selectedSessionType.value === type ? null : type;
}

const filteredItems = computed(() => {
  if (!selectedSessionType.value) return stats.value.items;
  return stats.value.items.filter(
    (it) => (it.sessionType || "Non renseigné") === selectedSessionType.value,
  );
});

const pagedItems = computed(() => filteredItems.value.slice(0, pageSize));

const totalSessionTypeViews = computed(() =>
  (stats.value.sessionTypes || []).reduce((s, t) => s + t.views, 0),
);

// On considere un delegate comme "checke" uniquement si checkedInDate contient
// une VRAIE date parsable. Truthy seul ne suffit pas : un champ string vide ou
// invalide doit etre traite comme non-checke.
function hasValidCheckin(d) {
  if (!d?.checkedInDate) return false;
  const t = Date.parse(d.checkedInDate);
  return Number.isFinite(t);
}

// --- Jointure ES live <-> delegates de la registration ---
// On indexe chaque delegate sous TOUS ses identifiants candidats (id, contactId,
// externalContactId, externalId, externalIds[].value) -> on garde son statut
// check-in (booleen). Cle = l'id sous lequel le delegate peut etre trouve
// dans les hits live (user_id OU delegate_id).
const delegateLookup = computed(() => {
  const map = new Map();
  for (const d of props.delegates || []) {
    const checkedIn = hasValidCheckin(d);
    const keys = [
      d.id,
      d.contactId,
      d.externalContactId,
      d.externalId,
    ];
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

// Classifie chaque hit live en : "checked-in" / "no-checkin" / "unknown" (pas
// de delegate matchant). On compte les uniques par categorie a partir d'une
// cle stable (delegateId si fourni par l'index, sinon userId).
const liveJoinStats = computed(() => {
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

const uniqueLiveUsersWithoutCheckin = computed(() => liveJoinStats.value.noCheckin);

// Liste detaillee des delegues live sans check-in physique (pour debug console).
// Construit a partir de la meme jointure : on garde les hits dont le delegate
// matche en registration ET dont le delegate n'a pas de checkedInDate valide.
// Dedupe sur la cle stable (delegateId || userId).
const liveWithoutCheckinList = computed(() => {
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

// Log console (utile pour debug + verifier les jointures). Se redeclenche
// quand la liste change (changement de delegates ou de hits live).
watch(
  liveWithoutCheckinList,
  (list) => {
    if (list.length === 0) return;
    console.log(`[Live] ${list.length} delegues ont regarde du live SANS check-in physique :`);
    console.table(list);
  },
  { immediate: true },
);

// Mediane du nombre de sessions consultees par delegue (utilise les buckets)
const medianSessionsPerUser = computed(() => {
  const buckets = stats.value.sessionsPerUserBuckets;
  const total = buckets["1"] + buckets["2-5"] + buckets["6-10"] + buckets["10+"];
  if (total === 0) return "—";
  let cum = 0;
  const half = total / 2;
  for (const [label, count] of Object.entries(buckets)) {
    cum += count;
    if (cum >= half) return label;
  }
  return "—";
});

const topBucketLabel = computed(() => {
  const buckets = stats.value.sessionsPerUserBuckets;
  const entries = Object.entries(buckets).filter(([, v]) => v > 0);
  if (entries.length === 0) return "—";
  const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return `pic dans la tranche "${top[0]}" (${top[1]} délégués)`;
});

// --- Charts ---
const byDayChart = computed(() => ({
  labels: stats.value.uniqueByDay.map((d) => d.day),
  datasets: [{
    label: "Délégués uniques",
    data: stats.value.uniqueByDay.map((d) => d.count),
    backgroundColor: "#30DD92",
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

// Delegues uniques par tranche de 30 min (session_end).
// Labels : "HH:MM" si tous les slots sont sur le meme jour, sinon "MM-DD HH:MM".
const by30minChart = computed(() => {
  const slots = stats.value.uniqueBy30min;
  const days = new Set(slots.map((s) => s.slot.slice(0, 10)));
  const multiDay = days.size > 1;
  const labels = slots.map((s) => {
    const [day, hm] = s.slot.split(" ");
    return multiDay ? `${day.slice(5)} ${hm}` : hm;
  });
  return {
    labels,
    datasets: [{
      label: "Délégués uniques",
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
      callbacks: { label: (ctx) => `${ctx.raw.toLocaleString("fr-FR")} délégués uniques` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 20, maxRotation: 45 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

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
      barThickness: 60,
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

// --- Helpers ---
const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");

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
  let parsed = ts;
  if (typeof ts === "number" && ts < 10 ** 12) parsed = ts * 1000;
  const p = parisDateParts(parsed);
  if (!p) return String(ts);
  return `${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
</script>

<style scoped>
.live-state { text-align: center; padding: 60px 20px; }
.live-progress { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.live-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
.live-hint code {
  background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
  font-family: "Fira Code", monospace; font-size: 10px;
}

.live-table-wrap { max-height: 600px; overflow: auto; }
.live-table-wrap .data-table th { position: sticky; top: 0; z-index: 2; }
.live-detail-table { min-width: 900px; }

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
  border-radius: 8px; font-size: 12px; color: var(--text);
  display: flex; align-items: center; gap: 12px;
}
.filter-clear {
  margin-left: auto; padding: 3px 8px;
  background: #fff; border: 1px solid #d1d5db; border-radius: 4px;
  cursor: pointer; font-size: 11px; color: #646464;
}
.filter-clear:hover { background: #f3f4f6; }

.live-detail-table .mono {
  font-family: "Fira Code", Consolas, monospace;
  font-size: 10px; color: var(--text-secondary);
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
