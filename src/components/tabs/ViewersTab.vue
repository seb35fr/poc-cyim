<template>
  <div>
    <div v-if="loading" class="viewers-state">
      <div class="spinner"></div>
      <p class="loading-label">{{ L.loadingLabel }}</p>
      <p class="viewers-progress">{{ fmt(progress.loaded) }} vues chargees</p>
    </div>

    <div v-else-if="error" class="viewers-state error-state">
      <p><strong>Erreur Elasticsearch :</strong> {{ error }}</p>
      <p class="viewers-hint">
        Verifier que <code>VITE_ES_URL</code> est configure et que l'index
        <code>{{ L.esIndex }}</code> est accessible.
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
              · {{ fmt(joinStats.unknown) }} viewers non liés à la registration
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
        <div class="kpi-card blue" v-if="stats.origins && stats.origins.length > 0">
          <div class="kpi-label">Vues par origine</div>
          <div class="kpi-value" style="font-size: 22px">{{ originSummary.topOrigin }} · {{ originSummary.topPct }}</div>
          <div class="kpi-sub">{{ originSummary.breakdown }}</div>
        </div>
      </div>

      <!-- Delegues uniques par jour (gauche) / par chaine (droite, live) -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ L.byDayTitle }}</h3>
            <CsvButton
              :filename="`${kind}-delegues-uniques-par-jour`"
              :headers="['Jour', 'Delegues uniques']"
              :rows="stats.uniqueByDay.map(d => [d.day, d.count])"
            />
          </div>
          <div v-if="stats.uniqueByDay.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="byDayChart" :options="byDayOptions" />
          </div>
          <p v-else class="empty-msg">{{ L.byDayEmpty }}</p>
        </div>
        <div class="chart-card" v-if="kind === 'live' && byDayChannel.channels.length > 0">
          <div class="chart-header">
            <h3>Délégués uniques en live par jour et par chaîne</h3>
            <CsvButton
              filename="live-delegues-uniques-par-jour-chaine"
              :headers="['Jour', ...byDayChannel.channels.map(c => `${c.label} (${c.id})`)]"
              :rows="byDayChannel.days.map(d => [d, ...byDayChannel.channels.map(c => byDayChannel.byDay[d]?.[c.id] || 0)])"
            />
          </div>
          <div :style="{ position: 'relative', height: '300px' }">
            <Bar :data="byDayChannelChart" :options="byDayChannelOptions" />
          </div>
          <p class="viewers-hint">
            Une chaîne = un <code>channel_id</code> de diffusion (l'index n'expose pas de libellé,
            d'où les noms « Chaîne N » triés par volume). Audience unique propre à chaque chaîne :
            un délégué ayant suivi plusieurs chaînes le même jour compte dans chacune, donc la
            somme d'un jour peut dépasser le total dédoublonné de gauche.
          </p>
        </div>
        <!-- Replay : l'engagement (sessions consultées par délégué) prend la
             colonne de droite (pas de chart par chaîne en VOD). -->
        <div class="chart-card" v-else-if="kind === 'replay'">
          <div class="chart-header">
            <h3>{{ L.engagementTitle }}</h3>
            <CsvButton
              :filename="`${kind}-engagement`"
              :headers="['Tranche', 'Délégués']"
              :rows="Object.entries(stats.sessionsPerUserBuckets).map(([k, v]) => [k, v])"
            />
          </div>
          <div :style="{ position: 'relative', height: '300px' }">
            <Bar :data="engagementChart" :options="engagementOptions" />
          </div>
        </div>
      </div>

      <!-- Présents physiques qui consultent du replay (replay uniquement) :
           évolution journalière (délégués uniques + vues) à gauche, cumul des
           délégués distincts à droite. -->
      <div class="charts-row" v-if="kind === 'replay'">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Présents physiques ayant consulté du replay — par jour</h3>
            <span class="viewers-hint" style="margin-left: auto">
              {{ fmt(physicalReplayTotals.uniqueDelegates) }} délégués · {{ fmt(physicalReplayTotals.views) }} vues
            </span>
            <CsvButton
              filename="replay-presents-physiques-par-jour"
              :headers="['Jour', 'Délégués uniques (présents physiques)', 'Vues replay']"
              :rows="physicalReplayDaily.map(d => [d.day, d.uniqueDelegates, d.views])"
            />
          </div>
          <div v-if="physicalReplayDaily.length > 0" :style="{ position: 'relative', height: '300px' }">
            <Bar :data="physicalReplayChart" :options="physicalReplayOptions" />
          </div>
          <p v-else class="empty-msg">Aucun délégué physiquement présent n'a (encore) consulté de replay</p>
          <p class="viewers-hint">
            Délégués avec un check-in physique valide qui ont ensuite regardé du replay. Bucketage sur la date de visionnage VOD (heure de Paris).
          </p>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>Présents physiques ayant consulté du replay — cumulé</h3>
            <CsvButton
              filename="replay-presents-physiques-cumul"
              :headers="['Jour', 'Délégués cumulés (présents physiques)']"
              :rows="physicalReplayCumulative.map(d => [d.day, d.count])"
            />
          </div>
          <LineChart
            v-if="physicalReplayCumulative.length > 0"
            :labels="physicalReplayCumulativeLabels"
            :datasets="physicalReplayCumulativeDatasets"
            :height="300"
          />
          <p v-else class="empty-msg">Aucun délégué physiquement présent n'a (encore) consulté de replay</p>
          <p class="viewers-hint">Chaque délégué est compté une seule fois, le jour de sa 1ʳᵉ consultation replay.</p>
        </div>
      </div>

      <!-- Delegues uniques par tranche de 30 min de session_end (live uniquement —
           le pipeline VOD ne suit pas le timing live des sessions). -->
      <div class="chart-card" v-if="kind === 'live' && stats.uniqueBy30min">
        <div class="chart-header">
          <h3>Délégués uniques par tranche de 30 min</h3>
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

      <!-- Camembert vues par session_type cliquable -> filtre tableau (live uniquement). -->
      <div class="chart-card" v-if="kind === 'live' && stats.sessionTypes && stats.sessionTypes.length > 0">
        <div class="chart-header">
          <h3>Vues par type de session</h3>
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

      <!-- Top sessions par audience unique -->
      <div class="chart-card" v-if="stats.topSessions.length > 0">
        <div class="chart-header">
          <h3>{{ L.topSessionsTitle }}</h3>
          <CsvButton
            :filename="`${kind}-top-sessions`"
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

      <!-- Engagement : repartition par nombre de sessions consultees.
           Live uniquement en standalone (en replay il est remonte a droite de
           "Délégués uniques par jour"). -->
      <div class="chart-card" v-if="kind === 'live'">
        <div class="chart-header">
          <h3>{{ L.engagementTitle }}</h3>
          <CsvButton
            :filename="`${kind}-engagement`"
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
          <h3>
            {{ L.detailTitle(filteredItems.length) }}
            <span v-if="kind === 'live' && selectedSessionType"> · filtré</span>
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
                <th>Délégué</th>
                <th>Email</th>
                <th>Session ID</th>
                <th>Session</th>
                <th v-if="kind === 'live'">Type</th>
                <th v-if="kind === 'live'">Début session</th>
                <th v-if="kind === 'replay'">Origine</th>
                <th>{{ kind === 'live' ? 'Horodatage vue' : 'Horodatage' }}</th>
                <th>Durée</th>
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
            Affichage des {{ pageSize }} premières vues (sur {{ fmt(filteredItems.length) }}). Utilisez le CSV pour tout exporter.
          </p>
        </div>
        <p v-else class="empty-msg">{{ L.detailEmpty }}</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import DoughnutChart from "../charts/DoughnutChart.vue";
import CsvButton from "../CsvButton.vue";
import { parisDateParts } from "../../utils/parisTime.js";
import { fmt } from "@/utils/formatters.js";
import { getTypeColor } from "@/utils/typeColors.js";
import { debug } from "@/utils/debug.js";
import LineChart from "../charts/LineChart.vue";
import { buildPhysicalReplayByDay, buildPhysicalReplayCumulative } from "@/utils/physicalReplay.js";

const props = defineProps({
  // 'live' | 'replay' — pilote labels + variations de template (30min/sessionType pie
  // sont live-only, colonne origine en detail est replay-only, code couleur du
  // chart par jour change). Les stats elles-memes ont la meme shape.
  kind: { type: String, required: true, validator: (v) => v === "live" || v === "replay" },
  delegates: { type: Array, default: () => [] },
  // Instance composable proprietee par StatisticsView (useLive ou useReplay).
  viewerApi: { type: Object, required: true },
});

// Labels affiches. Centralises ici, jamais en dur dans le template.
const LABELS = {
  live: {
    loadingLabel: "Chargement des vues live...",
    esIndex: "stats_user__live-view-duration-per-user-per-session",
    uniqueKpi: "Delegues uniques (live)",
    uniqueKpiSub: "ayant consulte au moins une session en live",
    remoteKpi: "Live sans présence physique",
    remoteKpiSub: "délégués de l'event ayant regardé en live mais sans check-in",
    byDayTitle: "Délégués uniques en live par jour",
    byDayEmpty: "Aucun horodatage exploitable dans les vues live",
    topSessionsTitle: "Top sessions live par délégués uniques",
    engagementTitle: "Engagement — nombre de sessions consultées par délégué",
    detailTitle: (n) => `Détail des vues live (${fmt(n)})`,
    detailEmpty: "Aucune vue live enregistrée",
    byDayColor: "#30DD92",
    debugTag: "[Live]",
  },
  replay: {
    loadingLabel: "Chargement des replays VOD...",
    esIndex: "stats_user__vod-view-per-user-per-session-per-origin",
    uniqueKpi: "Delegues uniques (replay)",
    uniqueKpiSub: "ayant consulte au moins une VOD",
    remoteKpi: "Replay sans présence physique",
    remoteKpiSub: "délégués de l'event ayant consulté du replay mais sans check-in",
    byDayTitle: "Délégués uniques en replay par jour",
    byDayEmpty: "Aucun horodatage exploitable dans les vues VOD",
    topSessionsTitle: "Top sessions VOD par délégués uniques",
    engagementTitle: "Engagement — sessions consultées par délégué",
    detailTitle: (n) => `Détail des vues VOD (${fmt(n)} au total)`,
    detailEmpty: "Aucune vue VOD enregistrée",
    byDayColor: "#6F45FF",
    debugTag: "[Replay]",
  },
};
const L = computed(() => LABELS[props.kind]);

const { loading, refreshing, error, progress, stats, reload } = props.viewerApi;

const g = computed(() => stats.value.global);
const topN = 15;
const pageSize = 200;

// --- Filtre par session_type (live uniquement) ---
const selectedSessionType = ref(null);
function onSessionTypeSelect(type) {
  selectedSessionType.value = selectedSessionType.value === type ? null : type;
}
const filteredItems = computed(() => {
  if (props.kind !== "live" || !selectedSessionType.value) return stats.value.items;
  return stats.value.items.filter(
    (it) => (it.sessionType || "Non renseigné") === selectedSessionType.value,
  );
});
const pagedItems = computed(() => filteredItems.value.slice(0, pageSize));
const totalSessionTypeViews = computed(() =>
  (stats.value.sessionTypes || []).reduce((s, t) => s + t.views, 0),
);

// --- Jointure ES viewer (user_id = keycloak id) <-> delegate Mongo ---
// Le user_id ES correspond a un account Keycloak (vu via contact.emailAddresses
// .source.id avec source.type === ACCOUNT). Source la plus fiable d'apres
// l'inspection cote service contacts. (Avant : 5 cles candidates testees a la
// chaine — fragile et peu performant.)
function hasValidCheckin(d) {
  if (!d?.checkedInDate) return false;
  return Number.isFinite(Date.parse(d.checkedInDate));
}
function getKeycloakId(d) {
  const emails = d?.contact?.emailAddresses;
  if (!Array.isArray(emails)) return null;
  return emails.find((e) => e?.source?.type === "ACCOUNT")?.source?.id || null;
}

const delegateLookup = computed(() => {
  const map = new Map(); // keycloakId -> { checkedIn, delegate }
  for (const d of props.delegates || []) {
    const kcId = getKeycloakId(d);
    if (!kcId) continue;
    const checkedIn = hasValidCheckin(d);
    if (map.has(kcId)) {
      const prev = map.get(kcId);
      if (prev.checkedIn !== checkedIn) {
        console.warn(
          `${L.value.debugTag} Collision keycloakId ${kcId} entre 2 delegues avec checkedIn different`,
          { prev: prev.delegate?.email, current: d.email },
        );
      }
      continue;
    }
    map.set(kcId, { checkedIn, delegate: d });
  }
  return map;
});

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
    debug.log(`${L.value.debugTag} ${list.length} delegues ont ${verb} SANS check-in physique :`);
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
// Demande explicite : voir tout ce qui est recupere/agrege cote Live. Rejoue a
// chaque chargement / refresh / changement de filtre. Groupe pour rester lisible.
watch(
  () => stats.value,
  (s) => {
    if (props.kind !== "live" || !s) return;
    const items = s.items || [];
    const rawHits = props.viewerApi.hits?.value || [];
    /* eslint-disable no-console */
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
    /* eslint-enable no-console */
  },
  { immediate: true },
);

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
      label: "Délégués uniques (présents physiques)",
      data: physicalReplayDaily.value.map((d) => d.uniqueDelegates),
      backgroundColor: "#1E4E66",
      borderRadius: 4,
      yAxisID: "y",
      order: 2,
    },
    {
      type: "line",
      label: "Vues replay",
      data: physicalReplayDaily.value.map((d) => d.views),
      borderColor: "#6F45FF",
      backgroundColor: "rgba(111,69,255,0.10)",
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2.5,
      yAxisID: "y1",
      order: 1,
    },
  ],
}));
const physicalReplayOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) =>
          ctx.dataset.yAxisID === "y1"
            ? `${ctx.raw.toLocaleString("fr-FR")} vues`
            : `${ctx.raw.toLocaleString("fr-FR")} délégués uniques`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: {
      position: "left", beginAtZero: true,
      grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 }, precision: 0 },
      title: { display: true, text: "Délégués uniques", font: { size: 10 } },
    },
    y1: {
      position: "right", beginAtZero: true,
      grid: { display: false }, ticks: { font: { size: 11 }, precision: 0 },
      title: { display: true, text: "Vues", font: { size: 10 } },
    },
  },
};

// Variante cumulee : delegues presents physiques distincts ayant deja consulte
// du replay, jour apres jour (chaque delegue compte 1x au jour de sa 1ere vue).
const physicalReplayCumulative = computed(() =>
  props.kind === "replay" ? buildPhysicalReplayCumulative(stats.value.items, delegateLookup.value) : [],
);
const physicalReplayCumulativeDatasets = computed(() => [{
  label: "Délégués cumulés (présents physiques)",
  data: physicalReplayCumulative.value.map((d) => d.count),
  borderColor: "#1E4E66",
  backgroundColor: "rgba(30,78,102,0.10)",
  fill: true,
  tension: 0.3,
  pointRadius: 0,
  borderWidth: 2.5,
}]);
const physicalReplayCumulativeLabels = computed(() =>
  physicalReplayCumulative.value.map((d) => d.day),
);

// --- Charts ---
const byDayChart = computed(() => ({
  labels: stats.value.uniqueByDay.map((d) => d.day),
  datasets: [{
    label: "Délégués uniques",
    data: stats.value.uniqueByDay.map((d) => d.count),
    backgroundColor: L.value.byDayColor,
    borderRadius: 4,
    barThickness: Math.max(12, Math.min(40, 500 / (stats.value.uniqueByDay.length || 1))),
  }],
}));

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
    legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toLocaleString("fr-FR")} délégués uniques` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

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

// --- Helpers de format / detail table ---
const ORIGIN_COLORS = ["#1E4E66", "#30DD92", "#6F45FF", "#FFA600", "#E53935", "#00BCD4", "#9C27B0", "#A3B86C"];

const totalOriginViews = computed(() =>
  (stats.value.origins || []).reduce((s, o) => s + o.views, 0),
);

// Resume des origines reduit a un indicateur (remplace l'ancien camembert) :
// origine dominante + repartition compacte de toutes les origines en sous-ligne.
const originSummary = computed(() => {
  const origins = stats.value.origins || [];
  const total = totalOriginViews.value;
  const top = origins[0];
  return {
    count: origins.length,
    topOrigin: top?.origin || "—",
    topPct: top ? pctOf(top.views, total) : "0%",
    breakdown: origins.map((o) => `${o.origin} ${pctOf(o.views, total)}`).join(" · "),
  };
});

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

// Headers / rows CSV du tableau detaille — varient selon kind.
const detailCsvHeaders = computed(() =>
  props.kind === "live"
    ? ["Délégué", "Email", "Session ID", "Session", "Type session", "Début session", "Horodatage vue", "Durée (s)"]
    : ["Délégué", "Email", "Session ID", "Session", "Origine", "Horodatage", "Durée (s)"]
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
.viewers-progress { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.viewers-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
.viewers-hint code {
  background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
  font-family: "Fira Code", monospace; font-size: 10px;
}

.viewers-table-wrap { max-height: 600px; overflow: auto; }
.viewers-table-wrap .data-table th { position: sticky; top: 0; z-index: 2; }
.viewers-detail-table { min-width: 900px; }
.viewers-detail-table .mono {
  font-family: "Fira Code", Consolas, monospace;
  font-size: 10px; color: var(--text-secondary);
}

.origin-pill {
  display: inline-block; padding: 1px 7px;
  font-size: 10px; font-weight: 600;
  border-radius: 8px; background: #6F45FF; color: #fff;
}

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
