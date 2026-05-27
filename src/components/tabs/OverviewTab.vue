<template>
  <div v-if="stats">
    <FilterBanner
      :has-filters="hasFilters"
      :active-filters="activeFilters"
      :filtered-count="filteredCount"
      :total-count="stats.global.totalDelegatesCount"
      @remove="removeFilter"
      @clear="clearFilters"
    />

    <!-- Filtre global page par type de badge — etat partage avec Badges /
         Comparison (cf. useBadgeTypeFilter dans StatisticsView). Le v-if est
         cote parent (pas dans le composant) pour eviter le bug Vue 3 du
         "v-if-at-component-root" qui casse le patch. -->
    <BadgeTypeFilter
      v-if="availableBadgeTypes.length > 0"
      :types="availableBadgeTypes"
      :selected="selectedBadgeTypes"
      @toggle="toggleBadgeType"
      @clear="clearBadgeTypes"
    />

    <div class="kpi-grid kpi-overview">
      <div class="kpi-card blue">
        <div class="kpi-label">Total inscrits</div>
        <div class="kpi-value">{{ fmt(registeredCount) }}</div>
        <div class="kpi-sub">au statut registered</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Check-in</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.checkedInCount, registeredCount) }} des registered</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Onboarding</div>
        <div class="kpi-value">{{ fmt(fs.global.onboardingCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.onboardingCount, registeredCount) }} des registered</div>
      </div>
      <div v-if="props.mobileAppId" class="kpi-card purple">
        <div class="kpi-label">App mobile</div>
        <div class="kpi-value">{{ fmt(fs.global.mobileAppCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.mobileAppCount, registeredCount) }} des registered (&lt; 3 mois)</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Live</div>
        <div class="kpi-value">
          <span v-if="liveLoading" class="kpi-loading">...</span>
          <template v-else>{{ fmt(liveUniqueUsers) }}</template>
        </div>
        <div class="kpi-sub">
          <template v-if="!liveLoading">{{ pct(liveUniqueUsers, registeredCount) }} des registered</template>
          <template v-else>chargement…</template>
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Replay</div>
        <div class="kpi-value">
          <span v-if="replayLoading" class="kpi-loading">...</span>
          <template v-else>{{ fmt(replayUniqueUsers) }}</template>
        </div>
        <div class="kpi-sub">
          <template v-if="!replayLoading">{{ pct(replayUniqueUsers, registeredCount) }} des registered</template>
          <template v-else>chargement…</template>
        </div>
      </div>
    </div>

    <!-- Decomposition visuelle "Total participants" : un meme delegue compte
         1 fois meme s'il a vu live + replay sans venir. -->
    <div class="chart-card participation-card" v-if="!liveLoading && !replayLoading">
      <div class="chart-header">
        <h3>Comment se decompose le "Total participants"</h3>
      </div>

      <div class="participation-formula">
        <div class="formula-chip checkin">
          <span class="formula-label">Check-in physique</span>
          <span class="formula-value">{{ fmt(physicallyCheckedInCount) }}</span>
          <span
            v-if="deltaCheckin"
            class="formula-delta"
            :class="deltaCheckin.cls"
            :title="tooltipCheckin"
          >{{ deltaCheckin.arrow }} {{ deltaCheckin.text }}</span>
        </div>
        <span class="formula-op">+</span>
        <div class="formula-chip live-only">
          <span class="formula-label">Live distanciel uniquement</span>
          <span class="formula-value">{{ fmt(liveOnlyRemoteCount) }}</span>
          <span
            v-if="deltaLiveOnly"
            class="formula-delta"
            :class="deltaLiveOnly.cls"
            :title="tooltipLiveOnly"
          >{{ deltaLiveOnly.arrow }} {{ deltaLiveOnly.text }}</span>
        </div>
        <span class="formula-op">+</span>
        <div class="formula-chip both">
          <span class="formula-label">Live & Replay distanciel</span>
          <span class="formula-value">{{ fmt(bothRemoteCount) }}</span>
          <span
            v-if="deltaBoth"
            class="formula-delta"
            :class="deltaBoth.cls"
            :title="tooltipBoth"
          >{{ deltaBoth.arrow }} {{ deltaBoth.text }}</span>
        </div>
        <span class="formula-op">+</span>
        <div class="formula-chip replay-only">
          <span class="formula-label">Replay distanciel uniquement</span>
          <span class="formula-value">{{ fmt(replayOnlyRemoteCount) }}</span>
          <span
            v-if="deltaReplayOnly"
            class="formula-delta"
            :class="deltaReplayOnly.cls"
            :title="tooltipReplayOnly"
          >{{ deltaReplayOnly.arrow }} {{ deltaReplayOnly.text }}</span>
        </div>
        <span class="formula-op">=</span>
        <div class="formula-chip total">
          <span class="formula-label">Total participants</span>
          <span class="formula-value">{{ fmt(totalParticipants) }}</span>
          <span
            v-if="deltaTotal"
            class="formula-delta"
            :class="deltaTotal.cls"
            :title="tooltipTotal"
          >{{ deltaTotal.arrow }} {{ deltaTotal.text }}</span>
        </div>
      </div>

      <div class="participation-bar" v-if="totalParticipants > 0" :title="`${fmt(totalParticipants)} delegues participants`">
        <div
          class="bar-segment seg-checkin"
          :style="{ width: pctNum(physicallyCheckedInCount, totalParticipants) + '%' }"
          :title="`Check-in physique : ${fmt(physicallyCheckedInCount)} (${pct(physicallyCheckedInCount, totalParticipants)})`"
        >
          <span v-if="physicallyCheckedInCount / totalParticipants > 0.04">{{ fmt(physicallyCheckedInCount) }}</span>
        </div>
        <div
          class="bar-segment seg-live-only"
          :style="{ width: pctNum(liveOnlyRemoteCount, totalParticipants) + '%' }"
          :title="`Live distanciel uniquement : ${fmt(liveOnlyRemoteCount)} (${pct(liveOnlyRemoteCount, totalParticipants)})`"
        >
          <span v-if="liveOnlyRemoteCount / totalParticipants > 0.04">{{ fmt(liveOnlyRemoteCount) }}</span>
        </div>
        <div
          class="bar-segment seg-both"
          :style="{ width: pctNum(bothRemoteCount, totalParticipants) + '%' }"
          :title="`Live & Replay distanciel : ${fmt(bothRemoteCount)} (${pct(bothRemoteCount, totalParticipants)})`"
        >
          <span v-if="bothRemoteCount / totalParticipants > 0.04">{{ fmt(bothRemoteCount) }}</span>
        </div>
        <div
          class="bar-segment seg-replay-only"
          :style="{ width: pctNum(replayOnlyRemoteCount, totalParticipants) + '%' }"
          :title="`Replay distanciel uniquement : ${fmt(replayOnlyRemoteCount)} (${pct(replayOnlyRemoteCount, totalParticipants)})`"
        >
          <span v-if="replayOnlyRemoteCount / totalParticipants > 0.04">{{ fmt(replayOnlyRemoteCount) }}</span>
        </div>
      </div>

      <div class="participation-legend">
        <span class="legend-item"><span class="swatch seg-checkin"></span> Check-in physique <strong>· {{ pct(physicallyCheckedInCount, totalParticipants) }}</strong></span>
        <span class="legend-item"><span class="swatch seg-live-only"></span> Live distanciel uniquement <strong>· {{ pct(liveOnlyRemoteCount, totalParticipants) }}</strong></span>
        <span class="legend-item"><span class="swatch seg-both"></span> Live & Replay distanciel <strong>· {{ pct(bothRemoteCount, totalParticipants) }}</strong></span>
        <span class="legend-item"><span class="swatch seg-replay-only"></span> Replay distanciel uniquement <strong>· {{ pct(replayOnlyRemoteCount, totalParticipants) }}</strong></span>
      </div>

      <p class="participation-note">
        Logique : un delegue physiquement checke compte pour 1 (toutes ses vues live/replay sont absorbees). Pour ceux NON checkes, on regarde s'ils ont vu en live, en replay ou les deux, et chacun ne compte qu'une fois meme s'il a fait les deux.
      </p>
    </div>

    <div class="charts-row" >
      <div class="chart-card" v-if="onboardingDaily.length > 0">
        <div class="chart-header">
          <h3>Evolution des connexions onboarding</h3>
          <CsvButton filename="onboarding" :headers="['Date', 'Connexions']" :rows="onboardingDaily.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="onboardingLabels"
          :datasets="onboardingDatasets"
          :height="220"
        />
      </div>
      <div class="chart-card" v-if="mobileAppDaily.length > 0">
        <div class="chart-header">
          <h3>Utilisation de l'application mobile</h3>
          <CsvButton filename="mobile-app" :headers="['Date', 'Utilisateurs']" :rows="mobileAppDaily.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="mobileAppLabels"
          :datasets="mobileAppDatasets"
          :height="220"
        />
      </div>
    </div>

    <div class="chart-card" v-if="fs.temporal.dailyRegistrations.length > 0" >
      <div class="chart-header">
        <h3>Evolution des inscriptions</h3>
        <CsvButton filename="inscriptions" :headers="['Date', 'Inscriptions']" :rows="allDailyRegs.map(d => [d.date, d.count])" />
      </div>
      <LineChart
        :labels="allDailyLabels"
        :datasets="timelineDatasets"
        :height="220"
      />
    </div>

    <div class="charts-row" >
      <div class="chart-card">
        <div class="chart-header">
          <h3>Répartition par type d'inscription</h3>
          <span class="chart-hint">délégués registered · physique · live/replay seul · aucune participation</span>
          <CsvButton
            filename="types-inscription"
            :headers="['Type', 'Total registered', 'Physique', 'Live/Replay seul', 'Aucune participation']"
            :rows="registeredTypesBreakdown.map(t => [t.value, t.total, t.physical, t.remote, t.none])"
          />
        </div>
        <StackedBarChart
          :labels="registeredTypesBreakdown.slice(0, 8).map(t => t.value)"
          :datasets="participationDatasets(registeredTypesBreakdown.slice(0, 8))"
          :horizontal="true"
          :show-total="true"
          :height="320"
          :active-label="afm.regType"
          @select="onTypeSelect"
        />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>Top 10 catégories</h3>
          <span class="chart-hint">délégués registered · physique · live/replay seul · aucune participation</span>
          <CsvButton
            filename="categories"
            :headers="['Catégorie', 'Total registered', 'Physique', 'Live/Replay seul', 'Aucune participation']"
            :rows="registeredCategoriesBreakdown.map(c => [c.value, c.total, c.physical, c.remote, c.none])"
          />
        </div>
        <StackedBarChart
          :labels="registeredCategoriesBreakdown.slice(0, 10).map(c => c.value)"
          :datasets="participationDatasets(registeredCategoriesBreakdown.slice(0, 10))"
          :horizontal="true"
          :show-total="true"
          :height="380"
          :active-label="afm.category"
          @select="onCategorySelect"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import StackedBarChart from "../charts/StackedBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import BadgeTypeFilter from "../BadgeTypeFilter.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { getTypeColors } from "../../utils/typeColors.js";
import { computeParticipation } from "@/utils/participation.js";
import { fmt, pct } from "@/utils/formatters.js";

const props = defineProps({
  stats: Object,
  delegates: Array,
  mobileAppId: String,
  eventName: String,
  compareDelegates: { type: Array, default: () => [] },
  compareEventName: { type: String, default: "" },
  // Instances live/replay proprietees par StatisticsView (timer + cache mutualises).
  liveApi: { type: Object, required: true },
  replayApi: { type: Object, required: true },
  compareLiveApi: { type: Object, default: null },
  compareReplayApi: { type: Object, default: null },
  // Filtre badge type lifte au niveau StatisticsView (etat partage Overview/Badges/Comparison).
  badgeFilter: { type: Object, required: true },
});

// --- KPIs Live / Replay : instances heritees de StatisticsView (cf. props).
const { loading: liveLoading, stats: liveStats } = props.liveApi;
const { loading: replayLoading, stats: replayStats } = props.replayApi;
const liveB = props.compareLiveApi;
const replayB = props.compareReplayApi;
const hasCompare = !!liveB;

const liveUniqueUsers = computed(() => liveStats.value?.global?.uniqueUsers || 0);
const replayUniqueUsers = computed(() => replayStats.value?.global?.uniqueUsers || 0);

// --- Filtre global badge type : etat partage avec Badges/Comparison via
// StatisticsView (cf. useBadgeTypeFilter). Applique sur les 2 cotes (A et B)
// pour preserver le sens des % d'evolution.
const {
  selected: selectedBadgeTypes,
  allBadgeTypes: availableBadgeTypes,
  filteredDelegates: pageFilteredDelegates,
  filteredCompareDelegates: pageFilteredCompareDelegates,
  toggle: toggleBadgeType,
  clear: clearBadgeTypes,
} = props.badgeFilter;

// --- KPI "Total participants" = check-in physique UNION live distanciel
// UNION replay distanciel, dedupe sur delegate.id Mongo (un meme delegue ne
// compte qu'une fois, meme s'il a vu live + replay sans venir). Logique
// extraite dans utils/participation.js et partagee avec l'export MD. Cf.
// utils/viewerJoin.js pour la jointure ES (user_id keycloak) <-> delegate
// (emailAddresses[].source.id ACCOUNT).
const participation = computed(() =>
  computeParticipation(
    pageFilteredDelegates.value,
    liveStats.value?.items,
    replayStats.value?.items,
    { datasetLabel: "overview-current" },
  ),
);
// Sets reutilises par buildParticipationBreakdown (decomposition par type/categorie).
const physicallyCheckedInSet = computed(() => participation.value.checkedIn);
const liveRemoteSet = computed(() => participation.value.liveRemote);
const replayRemoteSet = computed(() => participation.value.replayRemote);
// Counts pour la decomposition visuelle (chips + barre + legende).
const physicallyCheckedInCount = computed(() => participation.value.counts.checkedIn);
const liveOnlyRemoteCount = computed(() => participation.value.counts.liveOnly);
const bothRemoteCount = computed(() => participation.value.counts.both);
const replayOnlyRemoteCount = computed(() => participation.value.counts.replayOnly);
const totalParticipants = computed(() => participation.value.counts.total);

// --- Side B : meme decomposition pour le compareEventId (si present).
// Permet d'afficher un delta % sur chaque chip de la decomposition.
const participationB = computed(() =>
  hasCompare
    ? computeParticipation(
        pageFilteredCompareDelegates.value,
        liveB?.stats.value?.items,
        replayB?.stats.value?.items,
        { datasetLabel: "overview-compare" },
      )
    : { counts: { checkedIn: 0, liveOnly: 0, both: 0, replayOnly: 0, total: 0 } },
);
const checkedInBCount = computed(() => participationB.value.counts.checkedIn);
const liveOnlyRemoteBCount = computed(() => participationB.value.counts.liveOnly);
const bothRemoteBCount = computed(() => participationB.value.counts.both);
const replayOnlyRemoteBCount = computed(() => participationB.value.counts.replayOnly);
const totalParticipantsB = computed(() => participationB.value.counts.total);

// Calcule un delta % (a vs b). Si b == 0 et a > 0 : "Nouveau" (vert).
// Si a == 0 et b > 0 : "-100%" (rouge). Sinon : signe + pct + classe.
function buildDeltaPct(a, b) {
  if (!hasCompare) return null;
  if (b === 0 && a === 0) return { arrow: "=", text: "0%", cls: "delta--neutral" };
  if (b === 0) return { arrow: "▲", text: "Nouveau", cls: "delta--good" };
  if (a === 0) return { arrow: "▼", text: "-100%", cls: "delta--bad" };
  const diff = ((a - b) / b) * 100;
  if (Math.abs(diff) < 0.5) return { arrow: "=", text: "0%", cls: "delta--neutral" };
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  const cls = diff > 0 ? "delta--good" : "delta--bad";
  return { arrow, text: `${sign}${Math.abs(diff).toFixed(1)}%`, cls };
}

const deltaCheckin = computed(() => buildDeltaPct(physicallyCheckedInCount.value, checkedInBCount.value));
const deltaLiveOnly = computed(() => buildDeltaPct(liveOnlyRemoteCount.value, liveOnlyRemoteBCount.value));
const deltaBoth = computed(() => buildDeltaPct(bothRemoteCount.value, bothRemoteBCount.value));
const deltaReplayOnly = computed(() => buildDeltaPct(replayOnlyRemoteCount.value, replayOnlyRemoteBCount.value));
const deltaTotal = computed(() => buildDeltaPct(totalParticipants.value, totalParticipantsB.value));

// Tooltip detaille sur chaque badge delta : ecart absolu (+N / -N) + valeur
// de l'event compare. Affiche au survol via attribut title. On expose des
// computeds (pas une fonction qui prend des refs en argument) — c'est plus
// sur pour la reactivite dans les templates.
function makeTooltip(a, b) {
  if (!hasCompare) return "";
  const diff = (a ?? 0) - (b ?? 0);
  const diffStr = diff > 0 ? `+${fmt(diff)}` : fmt(diff);
  const name = props.compareEventName || "event comparé";
  return `${diffStr} delegue(s) vs ${name} : ${fmt(b ?? 0)}`;
}
const tooltipCheckin = computed(() => makeTooltip(physicallyCheckedInCount.value, checkedInBCount.value));
const tooltipLiveOnly = computed(() => makeTooltip(liveOnlyRemoteCount.value, liveOnlyRemoteBCount.value));
const tooltipBoth = computed(() => makeTooltip(bothRemoteCount.value, bothRemoteBCount.value));
const tooltipReplayOnly = computed(() => makeTooltip(replayOnlyRemoteCount.value, replayOnlyRemoteBCount.value));
const tooltipTotal = computed(() => makeTooltip(totalParticipants.value, totalParticipantsB.value));

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => pageFilteredDelegates.value, () => props.mobileAppId);

// pctNum garde la version numerique (pour calculs / deltas), distincte de pct
// qui renvoie une string formatee "12.3%".
const pctNum = (a, b) => (b > 0 ? (a / b) * 100 : 0);

const registeredCount = computed(() =>
  pageFilteredDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);

// --- Decomposition participation par type / categorie ---
// Calcule pour chaque registration type (et chaque categorie) le nombre de
// delegues registered :
//   - physical : checkedInDate valide (presents sur place)
//   - remote   : pas physique mais vu en live ou replay
//   - none     : aucune participation detectee (inscrits no-show)
// La somme des 3 == nombre total de registered ayant ce type / cette categorie.
// Note : un delegate avec plusieurs registrations compte dans chacun de ses
// types / categories (meme logique que fs.registrations.types.totalCount).
function buildParticipationBreakdown(extractKeys) {
  const phyIds = physicallyCheckedInSet.value;
  const remoteIds = new Set([...liveRemoteSet.value, ...replayRemoteSet.value]);
  const byKey = new Map();
  for (const d of pageFilteredDelegates.value) {
    if (d.status?.toLowerCase() !== "registered") continue;
    const isPhy = phyIds.has(d.id);
    const isRemote = !isPhy && remoteIds.has(d.id);
    const keys = extractKeys(d);
    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, { physical: 0, remote: 0, none: 0 });
      const b = byKey.get(k);
      if (isPhy) b.physical++;
      else if (isRemote) b.remote++;
      else b.none++;
    }
  }
  return [...byKey.entries()]
    .map(([value, b]) => ({
      value,
      total: b.physical + b.remote + b.none,
      physical: b.physical,
      remote: b.remote,
      none: b.none,
    }))
    .sort((a, b) => b.total - a.total);
}

const registeredTypesBreakdown = computed(() =>
  buildParticipationBreakdown((d) => {
    const set = new Set();
    for (const r of d.registrations || []) if (r.type) set.add(r.type);
    return set;
  }),
);

const registeredCategoriesBreakdown = computed(() =>
  buildParticipationBreakdown((d) => {
    const set = new Set();
    for (const r of d.registrations || []) {
      for (const c of r.categories || []) if (c) set.add(c);
    }
    return set;
  }),
);

// Construit les 3 datasets (physique / distanciel-seul / aucune) pour
// StackedBarChart depuis le breakdown.
function participationDatasets(breakdown) {
  return [
    {
      label: "Physique",
      data: breakdown.map((b) => b.physical),
      backgroundColor: "#30DD92",
      borderRadius: 4,
    },
    {
      label: "Live/Replay uniquement",
      data: breakdown.map((b) => b.remote),
      backgroundColor: "#6F45FF",
      borderRadius: 4,
    },
    {
      label: "Aucune participation",
      data: breakdown.map((b) => b.none),
      backgroundColor: "#D1D5DB",
      borderRadius: 4,
    },
  ];
}

// --- Filtres ---
function onTypeSelect(label) {
  toggleFilter("regType", label, (d) => (d.registrations || []).some((r) => r.type === label));
}
function onCategorySelect(label) {
  toggleFilter("category", label, (d) =>
    (d.registrations || []).some((r) => (r.categories || []).includes(label))
  );
}

// --- Computed charts ---

// --- Mobile app timeline ---
const mobileAppDaily = computed(() => fs.value?.mobileApp?.daily || []);
const mobileAppLabels = computed(() => {
  const dates = mobileAppDaily.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
const mobileAppDatasets = computed(() => {
  const daily = mobileAppDaily.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Utilisateurs cumulés",
      data: cumulData,
      borderColor: "#6F45FF",
      backgroundColor: "rgba(111,69,255,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Utilisateurs/jour",
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(2, Math.min(8, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});

// Toutes les inscriptions depuis le premier delegate
const allDailyRegs = computed(() => fs.value?.temporal?.dailyRegistrations || []);
const allDailyLabels = computed(() => {
  const dates = allDailyRegs.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});

const timelineDatasets = computed(() => {
  const daily = allDailyRegs.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Inscriptions cumulées",
      data: cumulData,
      borderColor: "#1E4E66",
      backgroundColor: "rgba(30,78,102,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Inscriptions/jour",
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(1, Math.min(6, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});

// --- Onboarding timeline ---
const onboardingDaily = computed(() => fs.value?.onboarding?.daily || []);
const onboardingLabels = computed(() => {
  const dates = onboardingDaily.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
const onboardingDatasets = computed(() => {
  const daily = onboardingDaily.value.map((d) => d.count);
  let cumul = 0;
  const cumulData = daily.map((v) => { cumul += v; return cumul; });
  return [
    {
      label: "Connexions cumulées",
      data: cumulData,
      borderColor: "#FFA600",
      backgroundColor: "rgba(255,166,0,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: "Connexions/jour",
      data: daily,
      borderColor: "#30DD92",
      backgroundColor: "rgba(48,221,146,0.4)",
      type: "bar",
      borderRadius: 3,
      barThickness: Math.max(2, Math.min(8, 600 / daily.length)),
      yAxisID: "y1",
    },
  ];
});
</script>

<style scoped>
.chart-hint {
  font-size: 10px; color: var(--text-muted); font-style: italic;
  margin-left: auto; padding-right: 8px;
}
.kpi-overview {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.kpi-card-highlight {
  grid-column: span 2;
  min-width: 0;
  box-shadow: 0 4px 16px rgba(48, 221, 146, 0.25), var(--shadow);
  border: 2px solid var(--accent, #30DD92);
}
.kpi-card-highlight .kpi-value { font-size: 32px; }
.kpi-card-highlight .kpi-sub { line-height: 1.5; }

/* Decomposition "Total participants" */
.participation-card { margin-top: 16px; }
.participation-formula {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;
  margin: 18px 0 22px;
}
.formula-chip {
  flex: 1 1 0;
  min-width: 130px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f7f7f9;
  border-left: 4px solid #ccc;
}
.formula-chip.checkin     { border-left-color: var(--accent, #30DD92); }
.formula-chip.live-only   { border-left-color: #1E4E66; }
.formula-chip.both        { border-left-color: #6F45FF; }
.formula-chip.replay-only { border-left-color: #b06bff; }
.formula-chip.total {
  background: linear-gradient(135deg, rgba(48,221,146,0.12), rgba(111,69,255,0.12));
  border-left-color: var(--accent, #30DD92);
  border: 2px solid var(--accent, #30DD92);
  border-left-width: 4px;
}
.formula-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .4px; font-weight: 600; }
.formula-value { font-size: 22px; font-weight: 700; color: var(--text, #414141); margin-top: 2px; }
.formula-delta {
  display: inline-block;
  margin-top: 6px;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
  align-self: flex-start;
}
.formula-delta.delta--good { color: #047857; background: #d1fae5; }
.formula-delta.delta--bad { color: #b91c1c; background: #fee2e2; }
.formula-delta.delta--neutral { color: var(--text-muted, #888); background: #f3f4f6; }

.formula-op {
  align-self: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-muted, #999);
}

.participation-bar {
  display: flex;
  width: 100%;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f0f0;
  margin-bottom: 14px;
}
.bar-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 13px;
  font-weight: 600;
  transition: width 0.4s ease;
  overflow: hidden;
  white-space: nowrap;
}
.bar-segment.seg-checkin     { background: #30DD92; color: #0c3a23; }
.bar-segment.seg-live-only   { background: #1E4E66; }
.bar-segment.seg-both        { background: #6F45FF; }
.bar-segment.seg-replay-only { background: #b06bff; }

.participation-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 22px;
  font-size: 12px;
  color: var(--text, #414141);
  margin-bottom: 8px;
}
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-item .swatch {
  width: 12px; height: 12px; border-radius: 3px; display: inline-block;
}
.swatch.seg-checkin     { background: #30DD92; }
.swatch.seg-live-only   { background: #1E4E66; }
.swatch.seg-both        { background: #6F45FF; }
.swatch.seg-replay-only { background: #b06bff; }

.participation-note {
  font-size: 11px;
  color: var(--text-muted, #888);
  font-style: italic;
  margin: 4px 0 0;
  line-height: 1.5;
}
.kpi-card-status {
  grid-column: span 2; min-width: 0;
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  box-shadow: var(--shadow);
}
.kpi-card-status .kpi-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; font-weight: 600; }
.status-row { display: flex; align-items: center; gap: 10px; }
.legend-col { display: flex; flex-direction: column; gap: 3px; }
.legend-col .legend-pill { font-size: 10px; }
</style>
