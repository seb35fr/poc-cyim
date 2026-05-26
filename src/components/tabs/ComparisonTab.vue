<template>
  <div>
    <!-- Header -->
    <div class="cmp-header">
      <div class="cmp-event cmp-event--current">
        <span class="cmp-event-dot" :style="{ background: COLORS.current }"></span>
        <div>
          <div class="cmp-event-label">Événement sélectionné</div>
          <div class="cmp-event-name">{{ eventName || "—" }}</div>
        </div>
      </div>
      <div class="cmp-vs">vs</div>
      <div class="cmp-event cmp-event--compare">
        <span class="cmp-event-dot" :style="{ background: COLORS.compare }"></span>
        <div>
          <div class="cmp-event-label">Événement comparé</div>
          <div class="cmp-event-name">{{ compareEventName || "—" }}</div>
        </div>
      </div>
    </div>

    <!-- Filtre global page par type de badge — etat partage avec
         Overview/Badges (cf. useBadgeTypeFilter dans StatisticsView). -->
    <BadgeTypeFilter
      v-if="compareStats && availableBadgeTypes.length > 0"
      :types="availableBadgeTypes"
      :selected="selectedBadgeTypes"
      @toggle="toggleBadgeType"
      @clear="clearBadgeTypes"
    />

    <div v-if="compareLoading" class="cmp-loading">
      <div class="spinner"></div>
      <p class="loading-label">Chargement de l'événement de comparaison...</p>
      <div v-if="compareProgress?.total > 0" class="progress-wrapper">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: compareProgressPercent + '%' }"></div>
        </div>
        <p class="progress-text">
          {{ compareProgress.loaded }} / {{ compareProgress.total }} inscrits
        </p>
      </div>
    </div>

    <div v-else-if="compareError" class="cmp-error">
      Erreur sur l'événement comparé : {{ compareError }}
    </div>

    <template v-else-if="compareStats">
      <!-- KPIs : grille 3 colonnes (A | Δ | B), valeur dominante -->
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
              <div class="kpi-side-sub">{{ kpi.a.sub || " " }}</div>
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
              <div class="kpi-side-sub">{{ kpi.b.sub || " " }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Taux de conversion (gauche) / Mix des types d'inscriptions (droite) -->
      <div class="charts-row">
        <div class="chart-card">
          <h3>Taux de conversion (% des registered)</h3>
          <div :style="{ position: 'relative', height: '220px' }">
            <Bar :data="conversionChartData" :options="conversionOptions" />
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>Mix des types d'inscriptions (présents confirmés)</h3>
            <span class="cmp-axis-hint">Population : <code>status = registered</code> ET <code>checkedInDate</code>.</span>
          </div>
          <div v-if="typesMixChart.datasets.length > 0" :style="{ position: 'relative', height: typesMixHeight + 'px' }">
            <Bar :data="typesMixChart" :options="typesMixOptions" />
          </div>
          <p v-else class="empty-msg">Aucun type d'inscription comparable</p>
        </div>
      </div>

      <!-- Répartition par région française : 2 cartes superposables (echelle partagee) -->
      <div class="charts-row" v-if="frRegionsCurrent.length > 0 || frRegionsCompare.length > 0">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Régions françaises — {{ shortName(eventName) }}</h3>
            <span class="cmp-axis-hint">Métropole · échelle partagée</span>
          </div>
          <FrenchRegionMap
            :regions="frRegionsCurrentMetro"
            :region-codes="METRO_REGION_CODES_ARR"
            :global-max="frGlobalMax"
            :height="320"
            :show-legend="false"
            :key="`fr-cmp-cur-${badgeFilterKey}`"
          />
          <div v-if="frRegionsCurrentOverseas.length > 0" class="dom-bar">
            <span class="dom-bar-label">Outre-mer :</span>
            <span v-for="r in frRegionsCurrentOverseas" :key="r.code" class="dom-pill">
              {{ REGION_NAMES[r.code] || r.code }} <strong>{{ r.count }}</strong>
            </span>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>Régions françaises — {{ shortName(compareEventName) }}</h3>
            <span class="cmp-axis-hint">Métropole · échelle partagée</span>
          </div>
          <FrenchRegionMap
            :regions="frRegionsCompareMetro"
            :region-codes="METRO_REGION_CODES_ARR"
            :global-max="frGlobalMax"
            :height="320"
            :show-legend="false"
            :key="`fr-cmp-cmp-${badgeFilterKey}`"
          />
          <div v-if="frRegionsCompareOverseas.length > 0" class="dom-bar">
            <span class="dom-bar-label">Outre-mer :</span>
            <span v-for="r in frRegionsCompareOverseas" :key="r.code" class="dom-pill">
              {{ REGION_NAMES[r.code] || r.code }} <strong>{{ r.count }}</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Progression du check-in par type de badge (registered vs check-in) -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Progression du check-in par type — {{ shortName(eventName) }}</h3>
            <span class="cmp-axis-hint">Couleur pleine = check-in · estompée = restants · couleur = type</span>
          </div>
          <div v-if="checkinByTypeCurrent.labels.length > 0"
            :style="{ position: 'relative', height: checkinByTypeCurrent.height + 'px' }">
            <Bar :data="checkinByTypeCurrent.chartData" :options="checkinByTypeOptions" :plugins="[checkinByTypeTotalsPlugin]" />
          </div>
          <p v-else class="empty-msg">Aucun délégué registered</p>
        </div>
        <div class="chart-card">
          <div class="chart-header">
            <h3>Progression du check-in par type — {{ shortName(compareEventName) }}</h3>
            <span class="cmp-axis-hint">Couleur pleine = check-in · estompée = restants · couleur = type</span>
          </div>
          <div v-if="checkinByTypeCompare.labels.length > 0"
            :style="{ position: 'relative', height: checkinByTypeCompare.height + 'px' }">
            <Bar :data="checkinByTypeCompare.chartData" :options="checkinByTypeOptions" :plugins="[checkinByTypeTotalsPlugin]" />
          </div>
          <p v-else class="empty-msg">Aucun délégué registered</p>
        </div>
      </div>

      <!-- Performance de check-in 15 min — deux events cote a cote -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Performance de check-in — {{ shortName(eventName) }}</h3>
            <span class="cmp-axis-hint">Créneaux de 15 min</span>
          </div>
          <div v-if="checkinPerfCurrent.labels.length > 0" :style="{ position: 'relative', height: '260px' }">
            <Bar :data="checkinPerfCurrent.chartData" :options="checkinPerfOptions" />
          </div>
          <div v-if="checkinPerfCurrent.labels.length > 0" class="perf-summary">
            <span><strong>Moyenne :</strong> {{ checkinPerfCurrent.avg }} / 15 min</span>
            <span><strong>Max :</strong> {{ checkinPerfCurrent.max }} / 15 min</span>
            <span><strong>≈ {{ checkinPerfCurrent.max * 4 }} / h</strong></span>
          </div>
          <p v-else class="empty-msg">Aucun check-in</p>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3>Performance de check-in — {{ shortName(compareEventName) }}</h3>
            <span class="cmp-axis-hint">Créneaux de 15 min</span>
          </div>
          <div v-if="checkinPerfCompare.labels.length > 0" :style="{ position: 'relative', height: '260px' }">
            <Bar :data="checkinPerfCompare.chartData" :options="checkinPerfOptions" />
          </div>
          <div v-if="checkinPerfCompare.labels.length > 0" class="perf-summary">
            <span><strong>Moyenne :</strong> {{ checkinPerfCompare.avg }} / 15 min</span>
            <span><strong>Max :</strong> {{ checkinPerfCompare.max }} / 15 min</span>
            <span><strong>≈ {{ checkinPerfCompare.max * 4 }} / h</strong></span>
          </div>
          <p v-else class="empty-msg">Aucun check-in</p>
        </div>
      </div>

      <!-- Histogrammes J0 côte à côte : Check-in (gauche) / Badges (droite) -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Check-in par jour (J0 = 1er check-in)</h3>
            <span class="cmp-axis-hint">Axe X : décalage en jours depuis le 1er check-in de chaque event</span>
          </div>
          <div v-if="checkinByDayBarChart.labels.length > 0" :style="{ position: 'relative', height: '260px' }">
            <Bar :data="checkinByDayBarChart" :options="dayHistogramOptions" />
          </div>
          <p v-else class="empty-msg">Aucun check-in enregistré sur l'un ou l'autre des événements</p>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3>Badges imprimés par jour (J0 = 1er badge)</h3>
            <span class="cmp-axis-hint">Axe X : décalage en jours depuis le 1er badge imprimé de chaque event</span>
          </div>
          <div v-if="badgesByDayBarChart.labels.length > 0" :style="{ position: 'relative', height: '260px' }">
            <Bar :data="badgesByDayBarChart" :options="dayHistogramOptions" />
          </div>
          <p v-else class="empty-msg">Aucun badge délivré sur l'un ou l'autre des événements</p>
        </div>
      </div>

      <!-- Performance 15 min superposee (cumul par time-of-day) — check-in + badges côte à côte -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-header">
            <h3>Performance de check-in (créneaux de 15 min, cumul time-of-day)</h3>
            <span class="cmp-axis-hint">Toutes les journées de chaque event sont agrégées par heure de la journée.</span>
          </div>
          <LineChart
            v-if="checkin15minChart.labels.length > 0"
            :labels="checkin15minChart.labels"
            :datasets="checkin15minChart.datasets"
            :height="280"
          />
          <p v-else class="empty-msg">Aucune donnée de check-in</p>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3>Performance de distribution (créneaux de 15 min, cumul time-of-day)</h3>
            <span class="cmp-axis-hint">Toutes les journées de chaque event sont agrégées par heure de la journée.</span>
          </div>
          <LineChart
            v-if="perf15minChart.labels.length > 0"
            :labels="perf15minChart.labels"
            :datasets="perf15minChart.datasets"
            :height="280"
          />
          <p v-else class="empty-msg">Aucune donnée de distribution</p>
        </div>
      </div>

      <!-- Pré-inscription cumulée (J-N relatif au 1er check-in) -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Pré-inscription cumulée (% des inscrits)</h3>
          <span class="cmp-axis-hint">Axe X : jours avant le 1ᵉʳ check-in de chaque event (J0 = ouverture). Compare la dynamique commerciale.</span>
        </div>
        <LineChart
          v-if="preRegChart.labels.length > 0"
          :labels="preRegChart.labels"
          :datasets="preRegChart.datasets"
          :height="260"
          :y-begin-at-zero="true"
        />
        <p v-else class="empty-msg">Données insuffisantes pour tracer la pré-inscription</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Bar } from "vue-chartjs";
import LineChart from "../charts/LineChart.vue";
import BadgeTypeFilter from "../BadgeTypeFilter.vue";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { getTypeColor } from "../../utils/typeColors.js";
import { computeAllStats } from "../../utils/computeStats.js";
import { zipToRegion, REGION_NAMES } from "../../utils/frenchRegions.js";
import { fmt, pct, shortName as shortNameBase } from "@/utils/formatters.js";
import {
  buildCheckinByType,
  checkinByTypeOptions,
  checkinByTypeTotalsPlugin,
} from "../../utils/checkinByType.js";
import FrenchRegionMap from "../charts/FrenchRegionMap.vue";

const props = defineProps({
  stats: Object,
  delegates: Array,
  eventName: String,
  compareStats: Object,
  compareDelegates: Array,
  compareEventName: String,
  compareLoading: Boolean,
  compareError: String,
  compareProgress: Object,
  // Filtre badge type lifte au niveau StatisticsView (etat partage avec Overview/Badges).
  badgeFilter: { type: Object, required: true },
});

const COLORS = {
  current: "#27CE71", // congrès courant (vert CYIM)
  compare: "#9CA3AF", // event de comparaison (gris neutre)
};

// --- Filtre global badge type : etat partage avec Overview/Badges ---
const {
  selected: selectedBadgeTypes,
  allBadgeTypes: availableBadgeTypes,
  filteredDelegates: effDelegates,
  filteredCompareDelegates: effCompareDelegates,
  toggle: toggleBadgeType,
  clear: clearBadgeTypes,
} = props.badgeFilter;

// Effective stats : recalcul seulement si filtre actif (sinon on garde les
// stats deja calculees dans useStatistics, evite computeAllStats sur tout
// l'event sans raison).
const effStats = computed(() =>
  selectedBadgeTypes.value.size === 0 ? props.stats : computeAllStats(effDelegates.value),
);
const effCompareStats = computed(() =>
  selectedBadgeTypes.value.size === 0 ? props.compareStats : computeAllStats(effCompareDelegates.value),
);

// Cle de cache pour les Choropleth quand la selection change.
const badgeFilterKey = computed(() => [...selectedBadgeTypes.value].sort().join("|") || "all");

// --- Repartition par region francaise (2 cartes superposables) ---
const METRO_REGION_CODES_ARR = ["11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93", "94"];
const METRO_REGION_CODES_SET = new Set(METRO_REGION_CODES_ARR);

function frRegionsFrom(delegates) {
  const counts = new Map();
  for (const d of delegates || []) {
    const addr = d.primaryAddress;
    if (!addr) continue;
    const country = addr.countryCode || addr.country?.code;
    if (country && country !== "FR") continue;
    const region = zipToRegion(addr.zipCode);
    if (!region) continue;
    counts.set(region, (counts.get(region) || 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

const frRegionsCurrent = computed(() => frRegionsFrom(effDelegates.value));
const frRegionsCompare = computed(() => frRegionsFrom(effCompareDelegates.value));
const frRegionsCurrentMetro = computed(() => frRegionsCurrent.value.filter((r) => METRO_REGION_CODES_SET.has(r.code)));
const frRegionsCurrentOverseas = computed(() => frRegionsCurrent.value.filter((r) => !METRO_REGION_CODES_SET.has(r.code)));
const frRegionsCompareMetro = computed(() => frRegionsCompare.value.filter((r) => METRO_REGION_CODES_SET.has(r.code)));
const frRegionsCompareOverseas = computed(() => frRegionsCompare.value.filter((r) => !METRO_REGION_CODES_SET.has(r.code)));
// Max global toutes regions et events confondus -> echelle de couleur partagee.
const frGlobalMax = computed(() => Math.max(
  1,
  ...frRegionsCurrent.value.map((r) => r.count),
  ...frRegionsCompare.value.map((r) => r.count),
));

// ComparisonTab utilise des cards plus etroites que les autres tabs : 26 chars.
const shortName = (n) => shortNameBase(n, 26);

const compareProgressPercent = computed(() => {
  const p = props.compareProgress;
  return p?.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
});

function metricsFor(stats, delegates) {
  const list = delegates || [];
  const registered = list.filter((d) => d.status?.toLowerCase() === "registered").length;
  const total = stats?.global?.totalDelegatesCount || list.length;
  const checkedIn = stats?.global?.checkedInCount || 0;
  const badgesDelivered = stats?.global?.totalBadgesDelivered || 0;
  const remainingNoBadge = list.filter(
    (d) => d.status?.toLowerCase() === "registered" && !d.checkedInDate
  ).length;
  const peakSlot = stats?.badges?.peakSlot || { count: 0, date: "-", time: "-" };
  const peak = {
    count: peakSlot.count || 0,
    time: peakSlot.count > 0 ? `${peakSlot.date} ${peakSlot.time}` : "",
  };
  const peakCheckinSlot = stats?.checkinFlow?.peakSlot || { count: 0, date: "-", time: "-" };
  const peakCheckin = {
    count: peakCheckinSlot.count || 0,
    time: peakCheckinSlot.count > 0 ? `${peakCheckinSlot.date} ${peakCheckinSlot.time}` : "",
  };

  // Engagement post-inscription
  const onboarded = stats?.global?.onboardingCount || 0;
  const mobileApp = stats?.global?.mobileAppCount || 0;

  // Diversite geographique
  const uniqueCountries = stats?.demographics?.uniqueCountries || 0;
  const topCountries = (stats?.demographics?.countries || [])
    .filter((c) => c.value !== "Non renseigne")
    .slice(0, 5);

  return {
    registered,
    total,
    checkedIn,
    badgesDelivered,
    remainingNoBadge,
    peak,
    peakCheckin,
    onboarded,
    mobileApp,
    uniqueCountries,
    topCountries,
  };
}

const currentMetrics = computed(() => metricsFor(effStats.value, effDelegates.value));
const compareMetrics = computed(() => metricsFor(effCompareStats.value, effCompareDelegates.value));

// --- KPIs comparatifs (single-line + Δ) ---
// direction "up" = plus haut est bon, "down" = plus bas est bon, "neutral" = pas de jugement.
function ratePct(num, den) {
  return den > 0 ? (num / den) * 100 : null;
}
function buildDelta(aPct, bPct, direction, unit = "pts") {
  if (aPct == null || bPct == null) return null;
  const diff = aPct - bPct;
  if (Math.abs(diff) < 0.05) return { arrow: "=", text: `0 ${unit}`, cls: "kpi-delta--neutral" };
  let cls = "kpi-delta--neutral";
  if (direction === "up") cls = diff > 0 ? "kpi-delta--good" : "kpi-delta--bad";
  if (direction === "down") cls = diff < 0 ? "kpi-delta--good" : "kpi-delta--bad";
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  return { arrow, text: `${sign}${Math.abs(diff).toFixed(1)} ${unit}`, cls };
}
function buildDeltaAbs(a, b, direction, unit = "") {
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
const kpis = computed(() => {
  const cm = currentMetrics.value;
  const km = compareMetrics.value;
  const list = [];

  // 1. Taux de présence (no-show inverse)
  {
    const ap = ratePct(cm.checkedIn, cm.registered);
    const bp = ratePct(km.checkedIn, km.registered);
    list.push({
      label: "Taux de présence",
      a: { display: ap != null ? `${ap.toFixed(1)}%` : "—", sub: `${fmt(cm.checkedIn)} / ${fmt(cm.registered)}` },
      b: { display: bp != null ? `${bp.toFixed(1)}%` : "—", sub: `${fmt(km.checkedIn)} / ${fmt(km.registered)}` },
      delta: buildDelta(ap, bp, "up"),
    });
  }

  // 2. Pic 15 min — check-in
  list.push({
    label: "Pic check-in / 15 min",
    a: { display: cm.peakCheckin.count > 0 ? fmt(cm.peakCheckin.count) : "—", sub: cm.peakCheckin.time },
    b: { display: km.peakCheckin.count > 0 ? fmt(km.peakCheckin.count) : "—", sub: km.peakCheckin.time },
    delta: buildDeltaAbs(cm.peakCheckin.count, km.peakCheckin.count, "up"),
  });

  // 3. Pic 15 min — badges
  list.push({
    label: "Pic badges / 15 min",
    a: { display: cm.peak.count > 0 ? fmt(cm.peak.count) : "—", sub: cm.peak.time },
    b: { display: km.peak.count > 0 ? fmt(km.peak.count) : "—", sub: km.peak.time },
    delta: buildDeltaAbs(cm.peak.count, km.peak.count, "up"),
  });

  // 4. Restants sans badge (registered sans check-in)
  {
    const ap = ratePct(cm.remainingNoBadge, cm.registered);
    const bp = ratePct(km.remainingNoBadge, km.registered);
    list.push({
      label: "Restants sans badge",
      a: { display: ap != null ? `${ap.toFixed(1)}%` : "—", sub: fmt(cm.remainingNoBadge) },
      b: { display: bp != null ? `${bp.toFixed(1)}%` : "—", sub: fmt(km.remainingNoBadge) },
      delta: buildDelta(ap, bp, "down"),
    });
  }

  // 5. Onboarding connecté
  {
    const ap = ratePct(cm.onboarded, cm.total);
    const bp = ratePct(km.onboarded, km.total);
    list.push({
      label: "Onboarding connecté",
      a: { display: ap != null ? `${ap.toFixed(1)}%` : "—", sub: `${fmt(cm.onboarded)} / ${fmt(cm.total)}` },
      b: { display: bp != null ? `${bp.toFixed(1)}%` : "—", sub: `${fmt(km.onboarded)} / ${fmt(km.total)}` },
      delta: buildDelta(ap, bp, "up"),
    });
  }

  // 6. Mobile app actif (3 derniers mois)
  {
    const ap = ratePct(cm.mobileApp, cm.total);
    const bp = ratePct(km.mobileApp, km.total);
    const hasAny = cm.mobileApp > 0 || km.mobileApp > 0;
    if (hasAny) {
      list.push({
        label: "App mobile active",
        a: { display: ap != null ? `${ap.toFixed(1)}%` : "—", sub: `${fmt(cm.mobileApp)} / ${fmt(cm.total)}` },
        b: { display: bp != null ? `${bp.toFixed(1)}%` : "—", sub: `${fmt(km.mobileApp)} / ${fmt(km.total)}` },
        delta: buildDelta(ap, bp, "up"),
      });
    }
  }

  // 7. Pays uniques
  list.push({
    label: "Diversité géographique",
    a: {
      display: fmt(cm.uniqueCountries),
      sub: cm.topCountries.length > 0 ? `pays · top : ${cm.topCountries.slice(0, 3).map((c) => c.value).join(", ")}` : "pays",
    },
    b: {
      display: fmt(km.uniqueCountries),
      sub: km.topCountries.length > 0 ? `pays · top : ${km.topCountries.slice(0, 3).map((c) => c.value).join(", ")}` : "pays",
    },
    delta: buildDeltaAbs(cm.uniqueCountries, km.uniqueCountries, "up", ""),
  });

  return list;
});

// --- Taux de conversion ---
const conversionChartData = computed(() => ({
  labels: ["Badges délivrés", "Check-in effectués", "Restants sans badge"],
  datasets: [
    {
      label: shortName(props.eventName),
      data: [
        ratio(currentMetrics.value.badgesDelivered, currentMetrics.value.registered),
        ratio(currentMetrics.value.checkedIn, currentMetrics.value.registered),
        ratio(currentMetrics.value.remainingNoBadge, currentMetrics.value.registered),
      ],
      backgroundColor: COLORS.current,
      borderRadius: 4,
      barThickness: 22,
    },
    {
      label: shortName(props.compareEventName),
      data: [
        ratio(compareMetrics.value.badgesDelivered, compareMetrics.value.registered),
        ratio(compareMetrics.value.checkedIn, compareMetrics.value.registered),
        ratio(compareMetrics.value.remainingNoBadge, compareMetrics.value.registered),
      ],
      backgroundColor: COLORS.compare,
      borderRadius: 4,
      barThickness: 22,
    },
  ],
}));

function ratio(a, b) {
  return b > 0 ? +((a / b) * 100).toFixed(1) : 0;
}

const conversionOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "circle" } },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      color: "#414141",
      font: { weight: 600, size: 10 },
      formatter: (v) => v + "%",
    },
    tooltip: {
      callbacks: {
        // Au survol : on affiche le nom COMPLET de l'event (pas le shortName tronque
        // utilise comme label de dataset) + la categorie + la valeur.
        label: (ctx) => {
          const fullName = ctx.datasetIndex === 0
            ? (props.eventName || ctx.dataset.label)
            : (props.compareEventName || ctx.dataset.label);
          return `${fullName} — ${ctx.label} : ${ctx.raw}%`;
        },
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 }, callback: (v) => v + "%" }, beginAtZero: true, max: 110 },
  },
}));

// --- Alignement J-N : convertit une serie [{date, count}] en map { dayOffset: count } ---
// On définit la "fenêtre événement" comme l'intervalle entre le 1er et le dernier jour
// atteignant au moins 5% du pic. Ça filtre :
//   - les scans/check-in de test plusieurs jours avant l'event (sinon J0 décalé)
//   - les badges réimprimés / check-ins manuels longtemps après (sinon axe X étiré à J70+)
function toRelativeDayMap(series) {
  if (!series || series.length === 0) return { map: new Map(), max: 0 };
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const peak = sorted.reduce((m, x) => Math.max(m, x.count), 0);
  const threshold = Math.max(1, peak * 0.05);
  const startIdx = sorted.findIndex((x) => x.count >= threshold);
  let endIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].count >= threshold) { endIdx = i; break; }
  }
  if (startIdx < 0 || endIdx < 0) return { map: new Map(), max: 0 };
  const effective = sorted.slice(startIdx, endIdx + 1);
  const day0 = new Date(effective[0].date + "T00:00:00Z");
  const map = new Map();
  let max = 0;
  for (const item of effective) {
    const d = new Date(item.date + "T00:00:00Z");
    const offset = Math.round((d - day0) / 86_400_000);
    map.set(offset, item.count);
    if (offset > max) max = offset;
  }
  return { map, max };
}

function buildRelativeDayDatasets(currentSeries, compareSeries) {
  const cur = toRelativeDayMap(currentSeries);
  const cmp = toRelativeDayMap(compareSeries);
  const maxDay = Math.max(cur.max, cmp.max);
  if (cur.map.size === 0 && cmp.map.size === 0) {
    return { labels: [], datasets: [] };
  }
  const labels = [];
  const curData = [];
  const cmpData = [];
  for (let i = 0; i <= maxDay; i++) {
    labels.push(`J${i}`);
    curData.push(cur.map.get(i) ?? 0);
    cmpData.push(cmp.map.get(i) ?? 0);
  }
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: curData,
        borderColor: COLORS.current,
        backgroundColor: COLORS.current + "33",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        borderWidth: 2,
      },
      {
        label: shortName(props.compareEventName),
        data: cmpData,
        borderColor: COLORS.compare,
        backgroundColor: COLORS.compare + "33",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        borderWidth: 2,
      },
    ],
  };
}

// Histogramme : 1 barre par event et par jour, groupées côte à côte
function buildRelativeDayBarDatasets(currentSeries, compareSeries) {
  const cur = toRelativeDayMap(currentSeries);
  const cmp = toRelativeDayMap(compareSeries);
  const maxDay = Math.max(cur.max, cmp.max);
  if (cur.map.size === 0 && cmp.map.size === 0) {
    return { labels: [], datasets: [] };
  }
  const labels = [];
  const curData = [];
  const cmpData = [];
  for (let i = 0; i <= maxDay; i++) {
    labels.push(`J${i}`);
    curData.push(cur.map.get(i) ?? 0);
    cmpData.push(cmp.map.get(i) ?? 0);
  }
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: curData,
        backgroundColor: COLORS.current,
        borderRadius: 3,
        categoryPercentage: 0.75,
        barPercentage: 0.9,
      },
      {
        label: shortName(props.compareEventName),
        data: cmpData,
        backgroundColor: COLORS.compare,
        borderRadius: 3,
        categoryPercentage: 0.75,
        barPercentage: 0.9,
      },
    ],
  };
}

const badgesByDayBarChart = computed(() =>
  buildRelativeDayBarDatasets(
    effStats.value?.badges?.byDay || [],
    effCompareStats.value?.badges?.byDay || []
  )
);

const checkinByDayBarChart = computed(() => {
  const cur = effStats.value?.checkinFlow?.byDayArray
    || Object.entries(effStats.value?.checkinFlow?.byDay || {}).map(([date, count]) => ({ date, count }));
  const cmp = effCompareStats.value?.checkinFlow?.byDayArray
    || Object.entries(effCompareStats.value?.checkinFlow?.byDay || {}).map(([date, count]) => ({ date, count }));
  return buildRelativeDayBarDatasets(cur, cmp);
});

const dayHistogramOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "top",
      labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rect", padding: 12 },
    },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label} : ${ctx.raw}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 18 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

// --- 15min superpose : agrege par time-of-day (HH:MM) sur tout l'event ---
function aggregateByTimeOfDay(per15min) {
  const map = new Map();
  for (const slot of per15min || []) {
    const key = slot.time;
    map.set(key, (map.get(key) || 0) + slot.count);
  }
  return map;
}

const checkin15minChart = computed(() => {
  const curMap = aggregateByTimeOfDay(effStats.value?.checkinFlow?.per15min);
  const cmpMap = aggregateByTimeOfDay(effCompareStats.value?.checkinFlow?.per15min);
  if (curMap.size === 0 && cmpMap.size === 0) return { labels: [], datasets: [] };
  const labels = [...new Set([...curMap.keys(), ...cmpMap.keys()])].sort();
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: labels.map((t) => curMap.get(t) || 0),
        borderColor: COLORS.current,
        backgroundColor: COLORS.current + "33",
        fill: false,
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: shortName(props.compareEventName),
        data: labels.map((t) => cmpMap.get(t) || 0),
        borderColor: COLORS.compare,
        backgroundColor: COLORS.compare + "33",
        fill: false,
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };
});

// --- Mix des types d'inscriptions (100% stacked horizontal) ---
const MAX_TYPES = 8;
const OTHER_COLOR = "#9CA3AF";

// Aggrege les types d'inscription sur la population des PRESENTS CONFIRMES :
// status === "registered" ET checkedInDate != null. C'est la population
// "vendue + venue", la plus comparable entre deux events.
// Note : un delegate avec plusieurs registrations contribue a chaque type
// (pas de dedup par delegate).
function typesMixFor(delegates) {
  const counts = new Map();
  let total = 0;
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!d.checkedInDate) continue;
    for (const r of d.registrations || []) {
      const type = r.type || "Non renseigne";
      counts.set(type, (counts.get(type) || 0) + 1);
      total++;
    }
  }
  return { counts, total };
}

const typesMixChart = computed(() => {
  const cur = typesMixFor(effDelegates.value);
  const cmp = typesMixFor(effCompareDelegates.value);
  if (cur.total === 0 && cmp.total === 0) return { labels: [], datasets: [] };

  // Trier les types par poids combine et garder le top N
  const totals = new Map();
  for (const [k, v] of cur.counts) totals.set(k, (totals.get(k) || 0) + v);
  for (const [k, v] of cmp.counts) totals.set(k, (totals.get(k) || 0) + v);
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const topTypes = sorted.slice(0, MAX_TYPES).map(([v]) => v);
  const otherTypes = new Set(sorted.slice(MAX_TYPES).map(([v]) => v));

  function countFor(side, type) {
    if (type === "Autres") {
      let sum = 0;
      for (const [k, v] of side.counts) if (otherTypes.has(k)) sum += v;
      return sum;
    }
    return side.counts.get(type) || 0;
  }
  function pctFor(side, type) {
    if (!side.total) return 0;
    return +((countFor(side, type) / side.total) * 100).toFixed(1);
  }

  const segments = otherTypes.size > 0 ? [...topTypes, "Autres"] : topTypes;
  const datasets = segments.map((type) => ({
    label: type,
    data: [pctFor(cur, type), pctFor(cmp, type)],
    _counts: [countFor(cur, type), countFor(cmp, type)],
    backgroundColor: type === "Autres" ? OTHER_COLOR : getTypeColor(type),
    borderWidth: 0,
    barThickness: 28,
  }));

  return {
    labels: [shortName(props.eventName), shortName(props.compareEventName)],
    datasets,
  };
});

const typesMixHeight = computed(() => {
  const legendH = Math.ceil(typesMixChart.value.datasets.length / 4) * 22 + 30;
  return 120 + legendH;
});

const typesMixOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y",
  plugins: {
    legend: {
      position: "bottom",
      labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rect", padding: 10, boxWidth: 12 },
    },
    datalabels: {
      display: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 6,
      color: "#fff",
      font: { weight: 600, size: 10 },
      formatter: (v) => v + "%",
    },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const count = ctx.dataset._counts?.[ctx.dataIndex] ?? 0;
          return `${ctx.dataset.label} : ${ctx.raw}% (${count.toLocaleString("fr-FR")})`;
        },
      },
    },
  },
  scales: {
    x: { stacked: true, max: 100, ticks: { callback: (v) => v + "%", font: { size: 10 } }, grid: { color: "#f3f4f6" } },
    y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
  },
};

// --- Pre-inscription cumulee : % cumule des inscrits, axe X aligne sur le 1er check-in ---
function parseDayUTC(s) {
  const [Y, M, D] = s.split("-").map(Number);
  return Date.UTC(Y, M - 1, D);
}

function buildPreRegCurve(stats) {
  const daily = stats?.temporal?.dailyRegistrations || [];
  if (daily.length === 0) return [];
  const checkinDays = Object.keys(stats?.checkinFlow?.byDay || {}).sort();
  if (checkinDays.length === 0) return [];
  const j0 = parseDayUTC(checkinDays[0]);
  const total = daily.reduce((s, d) => s + d.count, 0);
  if (total === 0) return [];
  let cum = 0;
  const points = [];
  for (const d of daily) {
    cum += d.count;
    const t = parseDayUTC(d.date);
    const offset = Math.round((t - j0) / 86_400_000);
    if (offset > 0) break; // on s'arrete a l'ouverture du desk
    points.push({ offset, pct: +((cum / total) * 100).toFixed(2) });
  }
  return points;
}

const preRegChart = computed(() => {
  const cur = buildPreRegCurve(effStats.value);
  const cmp = buildPreRegCurve(effCompareStats.value);
  if (cur.length === 0 && cmp.length === 0) return { labels: [], datasets: [] };
  const allOffsets = [...new Set([...cur.map((p) => p.offset), ...cmp.map((p) => p.offset)])]
    .sort((a, b) => a - b);
  // Carry-forward pour les courbes cumulees (monotones) : on prolonge la derniere
  // valeur connue tant qu'il n'y a pas d'autre data plus tot pour cet event.
  function alignedSeries(points) {
    const map = new Map(points.map((p) => [p.offset, p.pct]));
    const first = points.length > 0 ? points[0].offset : null;
    let last = 0;
    return allOffsets.map((o) => {
      if (first == null || o < first) return null;
      if (map.has(o)) last = map.get(o);
      return last;
    });
  }
  const labels = allOffsets.map((o) => (o === 0 ? "J0" : `J${o}`));
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: alignedSeries(cur),
        borderColor: COLORS.current,
        backgroundColor: COLORS.current + "33",
        fill: false,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: true,
      },
      {
        label: shortName(props.compareEventName),
        data: alignedSeries(cmp),
        borderColor: COLORS.compare,
        backgroundColor: COLORS.compare + "33",
        fill: false,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
        spanGaps: true,
      },
    ],
  };
});

// --- Performance check-in 15 min, un chart par event ---
// Bornee au dernier jour significatif (>= 5% du pic journalier) pour eviter
// que les retardataires (saisie manuelle plusieurs jours apres) etalent l'axe X.
function buildCheckinPerf(stats, color) {
  const per15min = stats?.checkinFlow?.per15min || [];
  if (per15min.length === 0) return { labels: [], chartData: { labels: [], datasets: [] }, avg: 0, max: 0 };

  // Detection du dernier jour significatif (meme heuristique que le burndown).
  const byDay = new Map();
  for (const s of per15min) byDay.set(s.date, (byDay.get(s.date) || 0) + s.count);
  const peakDayCount = Math.max(...byDay.values());
  const threshold = Math.max(1, peakDayCount * 0.05);
  const days = [...byDay.keys()].sort();
  let effectiveEndDay = days[days.length - 1];
  for (let i = days.length - 1; i >= 0; i--) {
    if (byDay.get(days[i]) >= threshold) { effectiveEndDay = days[i]; break; }
  }
  const filtered = per15min
    .filter((s) => s.date <= effectiveEndDay)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const labelFor = makeDateLabeler(filtered.map((s) => s.date));
  const labels = filtered.map((s) =>
    new Set(filtered.map((x) => x.date)).size > 1
      ? `${labelFor(s.date)} ${s.time}`
      : s.time
  );
  const data = filtered.map((s) => s.count);
  const max = data.length > 0 ? Math.max(...data) : 0;
  const avg = data.length > 0 ? +(data.reduce((s, x) => s + x, 0) / data.length).toFixed(1) : 0;

  return {
    labels,
    avg,
    max,
    chartData: {
      labels,
      datasets: [{
        label: "Check-in / 15 min",
        data,
        backgroundColor: (ctx) => {
          const v = ctx.raw || 0;
          const ratio = max > 0 ? v / max : 0;
          if (ratio > 0.8) return "#30DD92";
          if (ratio > 0.5) return "#FFA600";
          return color;
        },
        borderRadius: 3,
        categoryPercentage: 0.85,
        barPercentage: 0.75,
      }],
    },
  };
}

// --- Progression du check-in par type de badge (registered vs check-in) ---
// Logique partagee avec BadgesTab via src/utils/checkinByType.js.
const checkinByTypeCurrent = computed(() => buildCheckinByType(effDelegates.value));
const checkinByTypeCompare = computed(() => buildCheckinByType(effCompareDelegates.value));

const checkinPerfCurrent = computed(() => buildCheckinPerf(effStats.value, COLORS.current));
const checkinPerfCompare = computed(() => buildCheckinPerf(effCompareStats.value, COLORS.compare));

const checkinPerfOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.raw} check-in (≈ ${ctx.raw * 4}/h)` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

const perf15minChart = computed(() => {
  const curMap = aggregateByTimeOfDay(effStats.value?.badges?.per15min);
  const cmpMap = aggregateByTimeOfDay(effCompareStats.value?.badges?.per15min);
  if (curMap.size === 0 && cmpMap.size === 0) return { labels: [], datasets: [] };
  const labels = [...new Set([...curMap.keys(), ...cmpMap.keys()])].sort();
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: labels.map((t) => curMap.get(t) || 0),
        borderColor: COLORS.current,
        backgroundColor: COLORS.current + "33",
        fill: false,
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: shortName(props.compareEventName),
        data: labels.map((t) => cmpMap.get(t) || 0),
        borderColor: COLORS.compare,
        backgroundColor: COLORS.compare + "33",
        fill: false,
        tension: 0.25,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };
});
</script>

<style scoped>
.cmp-header {
  display: flex; align-items: center; gap: 12px;
  background: var(--card); border-radius: 10px; padding: 12px 16px;
  box-shadow: var(--shadow); margin-bottom: 12px;
}
.cmp-event { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.cmp-event-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cmp-event-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
.cmp-event-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp-vs { font-size: 11px; color: var(--text-muted); font-weight: 600; }

.dom-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}
.dom-bar-label { font-size: 11px; color: #646464; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
.dom-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px; background: #f3f4f6; border-radius: 12px;
  font-size: 11px; color: #414141;
}
.dom-pill strong { color: #1E4E66; }

.kpi-compare-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 12px; margin-bottom: 12px;
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
.kpi-line {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 12px;
}
.kpi-side { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.kpi-side--compare { align-items: flex-end; text-align: right; }
.kpi-side-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--text-muted); font-weight: 500;
  min-width: 0; max-width: 100%;
}
.kpi-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.kpi-side-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.kpi-side-value {
  font-weight: 700; color: var(--text); font-size: 22px; line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.kpi-side-sub {
  color: var(--text-muted); font-size: 11px; line-height: 1.3;
  min-height: 14px;
  font-variant-numeric: tabular-nums;
}
.kpi-delta-wrap {
  align-self: center; padding-top: 16px;
}
.kpi-delta {
  font-weight: 700; font-size: 11px;
  padding: 4px 10px; border-radius: 12px; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
.kpi-delta--good { color: #047857; background: #d1fae5; }
.kpi-delta--bad { color: #b91c1c; background: #fee2e2; }
.kpi-delta--neutral { color: var(--text-muted); background: #f3f4f6; }

.cmp-axis-hint { font-size: 10px; color: var(--text-muted); font-style: italic; }

.perf-summary {
  display: flex; gap: 16px; margin-top: 10px; padding: 8px 12px;
  background: #f9fafb; border-radius: 8px; font-size: 12px; color: #414141;
  flex-wrap: wrap;
}

.cmp-loading, .cmp-error {
  background: var(--card); border-radius: 10px; padding: 32px 16px;
  box-shadow: var(--shadow); text-align: center;
}
.cmp-error { color: var(--danger); }
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
</style>
