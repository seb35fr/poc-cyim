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

    <!-- Le filtre par type de badge est desormais GLOBAL (toolbar StatisticsView). -->

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

      <!-- 3 grands modes de participation : Physique / Live distanciel /
           Replay distanciel. Chaque carte montre le total du mode + son detail. -->
      <div class="participation-modes">
        <div class="mode-card mode-physique">
          <div class="mode-head">
            <span class="mode-title">Présence physique</span>
            <span class="mode-total">{{ fmt(physiqueCount) }}</span>
            <span class="mode-pct">{{ pct(physiqueCount, totalParticipants) }}</span>
            <span v-if="deltaPhysique" class="formula-delta" :class="deltaPhysique.cls" :title="tooltipPhysique">{{ deltaPhysique.arrow }} {{ deltaPhysique.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-checkin-only"></span><span class="sub-label">Sur place seul</span><span class="sub-value">{{ fmt(checkedInOnlyCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-live"></span><span class="sub-label">Sur place + live</span><span class="sub-value">{{ fmt(checkedInLiveCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-replay"></span><span class="sub-label">Sur place + replay</span><span class="sub-value">{{ fmt(checkedInReplayCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">+</span>
        <div class="mode-card mode-live">
          <div class="mode-head">
            <span class="mode-title">Live distanciel</span>
            <span class="mode-total">{{ fmt(liveModeCount) }}</span>
            <span class="mode-pct">{{ pct(liveModeCount, totalParticipants) }}</span>
            <span v-if="deltaLiveMode" class="formula-delta" :class="deltaLiveMode.cls" :title="tooltipLiveMode">{{ deltaLiveMode.arrow }} {{ deltaLiveMode.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-live-only"></span><span class="sub-label">Live seul</span><span class="sub-value">{{ fmt(liveOnlyRemoteCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-both"></span><span class="sub-label">Live + Replay</span><span class="sub-value">{{ fmt(bothRemoteCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">+</span>
        <div class="mode-card mode-replay">
          <div class="mode-head">
            <span class="mode-title">Replay distanciel</span>
            <span class="mode-total">{{ fmt(replayModeCount) }}</span>
            <span class="mode-pct">{{ pct(replayModeCount, totalParticipants) }}</span>
            <span v-if="deltaReplayMode" class="formula-delta" :class="deltaReplayMode.cls" :title="tooltipReplayMode">{{ deltaReplayMode.arrow }} {{ deltaReplayMode.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-replay-only"></span><span class="sub-label">Replay seul</span><span class="sub-value">{{ fmt(replayOnlyRemoteCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">=</span>
        <div class="mode-card mode-total-card">
          <span class="mode-title">Total participants</span>
          <span class="mode-total mode-total-big">{{ fmt(totalParticipants) }}</span>
          <span v-if="deltaTotal" class="formula-delta" :class="deltaTotal.cls" :title="tooltipTotal">{{ deltaTotal.arrow }} {{ deltaTotal.text }}</span>
        </div>
      </div>

      <!-- Barre A : 3 zones (modes) separees par un espace, chacune subdivisee
           en sous-segments. Largeur totale proportionnelle au total (barScaleA). -->
      <div v-if="hasCompare && totalParticipants > 0" class="participation-bar-label">{{ eventName }} · {{ fmt(totalParticipants) }} participants</div>
      <div class="participation-bar" v-if="totalParticipants > 0" :style="{ width: barScaleA + '%' }">
        <div
          v-for="zone in zonesA"
          :key="zone.key"
          v-show="zone.total > 0"
          class="bar-zone"
          :style="{ width: pctNum(zone.total, totalParticipants) + '%' }"
          :title="`${zone.label} : ${fmt(zone.total)} (${pct(zone.total, totalParticipants)})`"
        >
          <div
            v-for="seg in zone.segments"
            :key="seg.cls"
            class="bar-segment"
            :class="seg.cls"
            :style="{ width: pctNum(seg.count, zone.total) + '%' }"
            :title="`${seg.label} : ${fmt(seg.count)} (${pct(seg.count, totalParticipants)})`"
          >
            <span v-if="seg.count / totalParticipants > 0.05">{{ fmt(seg.count) }}</span>
          </div>
        </div>
      </div>

      <!-- Barre B (event compare) : meme structure en zones. -->
      <template v-if="hasCompare">
        <div class="participation-bar-label">{{ compareEventName || "Event comparé" }} · {{ fmt(totalParticipantsB) }} participants</div>
        <div class="participation-bar participation-bar-compare" v-if="totalParticipantsB > 0" :style="{ width: barScaleB + '%' }">
          <div
            v-for="zone in zonesB"
            :key="zone.key"
            v-show="zone.total > 0"
            class="bar-zone"
            :style="{ width: pctNum(zone.total, totalParticipantsB) + '%' }"
            :title="`${zone.label} : ${fmt(zone.total)} (${pct(zone.total, totalParticipantsB)})`"
          >
            <div
              v-for="seg in zone.segments"
              :key="seg.cls"
              class="bar-segment"
              :class="seg.cls"
              :style="{ width: pctNum(seg.count, zone.total) + '%' }"
              :title="`${seg.label} : ${fmt(seg.count)} (${pct(seg.count, totalParticipantsB)})`"
            >
              <span v-if="seg.count / totalParticipantsB > 0.05">{{ fmt(seg.count) }}</span>
            </div>
          </div>
        </div>
        <p v-else class="participation-note" style="margin-bottom: 12px">Aucun participant détecté pour {{ compareEventName || "l'event comparé" }}.</p>
      </template>

      <!-- Legende groupee par grand mode -->
      <div class="participation-legend">
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-checkin-only"></i><i class="swatch seg-checkin-live"></i><i class="swatch seg-checkin-replay"></i></span> Présence physique <strong>· {{ pct(physiqueCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">sur place seul {{ fmt(checkedInOnlyCount) }} · + live {{ fmt(checkedInLiveCount) }} · + replay {{ fmt(checkedInReplayCount) }}</span>
        </div>
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-live-only"></i><i class="swatch seg-both"></i></span> Live distanciel <strong>· {{ pct(liveModeCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">live seul {{ fmt(liveOnlyRemoteCount) }} · live + replay {{ fmt(bothRemoteCount) }}</span>
        </div>
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-replay-only"></i></span> Replay distanciel <strong>· {{ pct(replayModeCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">replay seul {{ fmt(replayOnlyRemoteCount) }}</span>
        </div>
      </div>

      <p class="participation-note">
        Logique : un delegue physiquement checke compte pour 1 (toutes ses vues live/replay sont absorbees). On distingue les presents qui ont aussi suivi en live (« + live ») de ceux presents seulement sur place (« seul »). Pour ceux NON checkes, on regarde s'ils ont vu en live, en replay ou les deux, et chacun ne compte qu'une fois meme s'il a fait les deux.
      </p>
    </div>

    <!-- Charts de synthese participation (comparatif si ?compareWith=) -->
    <div v-if="!liveLoading && !replayLoading">
      <div class="charts-row">
        <!-- Chart 1 : Participants vs Inscrits, groupe par event -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>Participants vs Inscrits</h3>
            <span class="chart-hint">participants = présents · live · replay (dédoublonnés) · inscrits = registered</span>
            <CsvButton
              filename="participants-vs-inscrits"
              :headers="['Event', 'Inscrits', 'Participants']"
              :rows="hasCompare
                ? [[eventName, registeredCount, totalParticipants], [compareEventName, registeredCountB, totalParticipantsB]]
                : [[eventName, registeredCount, totalParticipants]]"
            />
          </div>
          <div :style="{ position: 'relative', height: '300px' }">
            <Bar :data="participantsVsRegisteredData" :options="groupedBarOptions" />
          </div>
        </div>

        <!-- Chart 2 : Participants par type de badge, empile par event -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>Participants par type de badge</h3>
            <span class="chart-hint">cumul des types de badge par event</span>
            <CsvButton
              filename="participants-par-type"
              :headers="['Type de badge', ...(hasCompare ? [eventName, compareEventName] : [eventName])]"
              :rows="participantsByTypeChart.types.map((t, i) => [t, ...participantsByTypeChart.datasets[i].data])"
            />
          </div>
          <StackedBarChart
            :labels="participantsByTypeChart.labels"
            :datasets="participantsByTypeChart.datasets"
            :show-total="true"
            :height="300"
          />
        </div>
      </div>

      <!-- Chart 3 : Audience salle + live + replay, horizontal empile par event -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>Audience : salle de conférence + live + replay</h3>
          <span class="chart-hint">vues en salle (présences cumulées par session) · vues live · vues replay</span>
          <CsvButton
            filename="audience-salle-live-replay"
            :headers="['Event', 'Salle', 'Live', 'Replay']"
            :rows="audienceMixChart.labels.map((lbl, i) => [
              lbl,
              audienceMixChart.datasets[0].data[i],
              audienceMixChart.datasets[1].data[i],
              audienceMixChart.datasets[2].data[i],
            ])"
          />
        </div>
        <StackedBarChart
          :labels="audienceMixChart.labels"
          :datasets="audienceMixChart.datasets"
          :horizontal="true"
          :show-total="true"
          :height="hasCompare ? 220 : 150"
        />
        <p class="participation-note">
          « Salle » = présences en salle cumulées par session : un délégué compte 1× pour chaque session qu'il a suivie (multi-passages dans une même session dédupliqués). C'est l'affluence totale des conférences.
        </p>
      </div>
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

    <div class="charts-row" v-if="replayUniqueByDay.length > 0">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Délégués uniques en replay par jour</h3>
          <CsvButton filename="replay-uniques-par-jour" :headers="['Jour', 'Délégués uniques']" :rows="replayUniqueByDay.map(d => [d.day, d.count])" />
        </div>
        <div :style="{ position: 'relative', height: '260px' }">
          <Bar :data="replayByDayChartData" :options="replayByDayOptions" />
        </div>
      </div>
      <!-- Cumul replay : comparatif A vs B (aligné J0) si compareWith actif,
           sinon cumul single-event. Le comparatif remplace le single. -->
      <div class="chart-card">
        <template v-if="hasCompare">
          <div class="chart-header">
            <h3>Délégués cumulés ayant consulté du replay — comparé</h3>
            <CsvButton
              filename="replay-cumul-compare"
              :headers="['Jour (J0 = 1er visionnage)', shortName(eventName), shortName(compareEventName)]"
              :rows="replayCumulativeCompare.labels.map((l, i) => [l, replayCumulativeCompare.datasets[0].data[i], replayCumulativeCompare.datasets[1].data[i]])"
            />
          </div>
          <LineChart
            v-if="replayCumulativeCompare.labels.length > 0"
            :labels="replayCumulativeCompare.labels"
            :datasets="replayCumulativeCompare.datasets"
            :height="260"
          />
          <p v-else class="empty-msg">Aucune donnée replay exploitable sur l'un ou l'autre event</p>
          <p class="chart-hint">Axe X : décalage en jours depuis le 1er visionnage VOD de chaque event (J0).</p>
        </template>
        <template v-else>
          <div class="chart-header">
            <h3>Délégués cumulés ayant consulté du replay</h3>
            <CsvButton filename="replay-cumul-delegues" :headers="['Jour', 'Délégués cumulés']" :rows="replayCumulativeByDay.map(d => [d.day, d.count])" />
          </div>
          <LineChart :labels="replayDayLabels" :datasets="replayCumulativeDatasets" :height="260" />
          <p class="chart-hint">Chaque délégué est compté une seule fois, le jour de sa 1ʳᵉ consultation replay.</p>
        </template>
      </div>
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
import { Bar } from "vue-chartjs";
import StackedBarChart from "../charts/StackedBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { getTypeColor, getTypeColors } from "../../utils/typeColors.js";
import { delegateBadgeType } from "@/utils/checkinByType.js";
import { computeParticipation } from "@/utils/participation.js";
import { fmt, pct, shortName } from "@/utils/formatters.js";

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
  // Instance scans onsite (audience + checkin + zone) proprietee par StatisticsView.
  // Sert au chart "Audience : salle + live + replay".
  scansApi: { type: Object, default: null },
  // Scans de l'event compare (?compareWith=) — alimente la barre "Salle" cote B.
  compareScansApi: { type: Object, default: null },
  // Filtre badge type lifte au niveau StatisticsView (etat partage Overview/Badges/Comparison).
  badgeFilter: { type: Object, required: true },
  // Plage de dates globale (filtre par activite) — propagee a useFilteredStats + participation.
  dateRange: { type: Object, default: null },
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
  setSelection: setBadgeTypes,
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
    { datasetLabel: "overview-current", dateRange: props.dateRange },
  ),
);
// Sets reutilises par buildParticipationBreakdown (decomposition par type/categorie).
const physicallyCheckedInSet = computed(() => participation.value.checkedIn);
const liveRemoteSet = computed(() => participation.value.liveRemote);
const replayRemoteSet = computed(() => participation.value.replayRemote);
// Counts pour la decomposition visuelle (chips + barre + legende).
const physicallyCheckedInCount = computed(() => participation.value.counts.checkedIn);
// Scission du check-in physique : present seul (sans live) vs present + live.
const checkedInOnlyCount = computed(() => participation.value.counts.checkedInOnly);
const checkedInLiveCount = computed(() => participation.value.counts.checkedInLive);
const checkedInReplayCount = computed(() => participation.value.counts.checkedInReplay);
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
        { datasetLabel: "overview-compare", dateRange: props.dateRange },
      )
    : { counts: { checkedIn: 0, checkedInOnly: 0, checkedInLive: 0, checkedInReplay: 0, liveOnly: 0, both: 0, replayOnly: 0, total: 0 } },
);
const checkedInBCount = computed(() => participationB.value.counts.checkedIn);
const checkedInOnlyBCount = computed(() => participationB.value.counts.checkedInOnly);
const checkedInLiveBCount = computed(() => participationB.value.counts.checkedInLive);
const checkedInReplayBCount = computed(() => participationB.value.counts.checkedInReplay);
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
const deltaCheckinOnly = computed(() => buildDeltaPct(checkedInOnlyCount.value, checkedInOnlyBCount.value));
const deltaCheckinLive = computed(() => buildDeltaPct(checkedInLiveCount.value, checkedInLiveBCount.value));
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
const tooltipCheckinOnly = computed(() => makeTooltip(checkedInOnlyCount.value, checkedInOnlyBCount.value));
const tooltipCheckinLive = computed(() => makeTooltip(checkedInLiveCount.value, checkedInLiveBCount.value));
const tooltipLiveOnly = computed(() => makeTooltip(liveOnlyRemoteCount.value, liveOnlyRemoteBCount.value));
const tooltipBoth = computed(() => makeTooltip(bothRemoteCount.value, bothRemoteBCount.value));
const tooltipReplayOnly = computed(() => makeTooltip(replayOnlyRemoteCount.value, replayOnlyRemoteBCount.value));
const tooltipTotal = computed(() => makeTooltip(totalParticipants.value, totalParticipantsB.value));

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => pageFilteredDelegates.value, () => props.mobileAppId, () => props.dateRange);

// pctNum garde la version numerique (pour calculs / deltas), distincte de pct
// qui renvoie une string formatee "12.3%".
const pctNum = (a, b) => (b > 0 ? (a / b) * 100 : 0);

// Mise a l'echelle des barres de participation : la longueur totale de chaque
// barre est proportionnelle au total de SON event, rapporte au plus grand des
// deux totaux (l'event le plus gros occupe 100% de la largeur, l'autre une
// fraction). Permet de comparer les volumes d'un coup d'oeil (avant : les 2
// barres faisaient 100% chacune, l'ecart de volume etait invisible). Sans
// comparaison, la barre unique reste a 100%.
const maxParticipants = computed(() =>
  Math.max(totalParticipants.value, hasCompare ? totalParticipantsB.value : 0),
);
const barScaleA = computed(() =>
  maxParticipants.value > 0 ? (totalParticipants.value / maxParticipants.value) * 100 : 100,
);
const barScaleB = computed(() =>
  maxParticipants.value > 0 ? (totalParticipantsB.value / maxParticipants.value) * 100 : 100,
);

// --- 3 grands modes de participation (regroupement des 5 sous-categories) ---
// Physique         = sur place seul + sur place & live   (= physicallyCheckedIn)
// Live distanciel  = live seul + (live & replay)          (a vu en live, sans venir)
// Replay distanciel= replay seul                          (a vu uniquement en replay)
// La somme des 3 == total participants. Le delta/tooltip "physique" reutilise
// deltaCheckin (physique == check-in physique), "replay" reutilise deltaReplayOnly.
const physiqueCount = physicallyCheckedInCount; // alias lisible
const liveModeCount = computed(() => liveOnlyRemoteCount.value + bothRemoteCount.value);
const liveModeBCount = computed(() => liveOnlyRemoteBCount.value + bothRemoteBCount.value);
const replayModeCount = replayOnlyRemoteCount; // alias
const deltaPhysique = deltaCheckin;
const deltaLiveMode = computed(() => buildDeltaPct(liveModeCount.value, liveModeBCount.value));
const deltaReplayMode = deltaReplayOnly;
const tooltipPhysique = tooltipCheckin;
const tooltipLiveMode = computed(() => makeTooltip(liveModeCount.value, liveModeBCount.value));
const tooltipReplayMode = tooltipReplayOnly;

// Structure de barre : 3 zones (modes), chacune subdivisee en sous-segments.
// Permet un rendu en 3 blocs colores distincts (vert / bleu / violet) separes
// par un petit espace, chaque bloc montrant sa composition interne. `c` = objet
// counts de computeParticipation.
function buildZones(c) {
  return [
    {
      key: "physique",
      label: "Présence physique",
      total: c.checkedInOnly + c.checkedInLive + c.checkedInReplay,
      segments: [
        { cls: "seg-checkin-only", label: "Sur place seul", count: c.checkedInOnly },
        { cls: "seg-checkin-live", label: "Sur place + live", count: c.checkedInLive },
        { cls: "seg-checkin-replay", label: "Sur place + replay", count: c.checkedInReplay },
      ],
    },
    {
      key: "live",
      label: "Live distanciel",
      total: c.liveOnly + c.both,
      segments: [
        { cls: "seg-live-only", label: "Live seul", count: c.liveOnly },
        { cls: "seg-both", label: "Live + Replay", count: c.both },
      ],
    },
    {
      key: "replay",
      label: "Replay distanciel",
      total: c.replayOnly,
      segments: [
        { cls: "seg-replay-only", label: "Replay seul", count: c.replayOnly },
      ],
    },
  ];
}
const zonesA = computed(() => buildZones(participation.value.counts));
const zonesB = computed(() => buildZones(participationB.value.counts));

const registeredCount = computed(() =>
  pageFilteredDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);
const registeredCountB = computed(() =>
  pageFilteredCompareDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);

// Libelles d'axe pour les charts comparatifs Vue d'ensemble : 1 ou 2 events.
const eventAxisLabels = computed(() =>
  hasCompare
    ? [props.eventName || "Event A", props.compareEventName || "Event B"]
    : [props.eventName || "Event"],
);

// --- Chart 1 : Participants (physique+live+replay dedoublonne) vs Inscrits
// (registered), groupe par event. Barres groupees (non empilees).
const participantsVsRegisteredData = computed(() => ({
  labels: eventAxisLabels.value,
  datasets: [
    {
      label: "Inscrits",
      data: hasCompare ? [registeredCount.value, registeredCountB.value] : [registeredCount.value],
      backgroundColor: "#1E4E66",
      borderRadius: 4,
      maxBarThickness: 90,
    },
    {
      label: "Participants",
      data: hasCompare ? [totalParticipants.value, totalParticipantsB.value] : [totalParticipants.value],
      backgroundColor: "#30DD92",
      borderRadius: 4,
      maxBarThickness: 90,
    },
  ],
}));

const groupedBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "top", labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 11 },
      formatter: (v) => (v > 0 ? v.toLocaleString("fr-FR") : ""),
    },
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toLocaleString("fr-FR")}` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

// --- Chart 2 : Participants par type de badge, empile par event. Chaque
// participant (physique OU distanciel) compte une fois pour son type de badge
// (delegateBadgeType). Somme des segments d'un event == total participants.
function participantsByBadgeType(delegates, part) {
  const phyIds = part.checkedIn;
  const remoteIds = new Set([...part.liveRemote, ...part.replayRemote]);
  const byType = new Map();
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!phyIds.has(d.id) && !remoteIds.has(d.id)) continue;
    const type = delegateBadgeType(d);
    byType.set(type, (byType.get(type) || 0) + 1);
  }
  return byType;
}
const participantsByTypeChart = computed(() => {
  const mapA = participantsByBadgeType(pageFilteredDelegates.value, participation.value);
  const mapB = hasCompare
    ? participantsByBadgeType(pageFilteredCompareDelegates.value, participationB.value)
    : new Map();
  const types = [...new Set([...mapA.keys(), ...mapB.keys()])].sort(
    (t1, t2) =>
      (mapA.get(t2) || 0) + (mapB.get(t2) || 0) - ((mapA.get(t1) || 0) + (mapB.get(t1) || 0)),
  );
  const datasets = types.map((type) => ({
    label: type,
    data: hasCompare ? [mapA.get(type) || 0, mapB.get(type) || 0] : [mapA.get(type) || 0],
    backgroundColor: getTypeColor(type),
    borderRadius: 4,
  }));
  return { labels: eventAxisLabels.value, datasets, types };
});

// --- Chart 3 : Audience par canal (salle / live / replay), empile par event,
// horizontal. "Salle" = vues en salle = delegues uniques scannes en salle
// cumules par session (audienceUniqueDelegateSessions, cf. computeScanStats) —
// la vraie affluence des conferences, vs le nombre brut de scans qui sur-compte
// les multi-passages. "Live"/"Replay" = vues totales ES. Les scans de l'event
// compare sont desormais charges (compareScansApi) -> Salle B renseignee.
const scanAudienceViewsA = computed(
  () => props.scansApi?.stats?.value?.global?.audienceUniqueDelegateSessions || 0,
);
const scanAudienceViewsB = computed(
  () => props.compareScansApi?.stats?.value?.global?.audienceUniqueDelegateSessions || 0,
);
const audienceMixChart = computed(() => {
  const liveViewsA = liveStats.value?.global?.totalViews || 0;
  const replayViewsA = replayStats.value?.global?.totalViews || 0;
  if (!hasCompare) {
    return {
      labels: eventAxisLabels.value,
      datasets: [
        { label: "Salle", data: [scanAudienceViewsA.value], backgroundColor: "#1E4E66", borderRadius: 4 },
        { label: "Live", data: [liveViewsA], backgroundColor: "#30DD92", borderRadius: 4 },
        { label: "Replay", data: [replayViewsA], backgroundColor: "#6F45FF", borderRadius: 4 },
      ],
    };
  }
  const liveViewsB = liveB?.stats.value?.global?.totalViews || 0;
  const replayViewsB = replayB?.stats.value?.global?.totalViews || 0;
  return {
    labels: eventAxisLabels.value,
    datasets: [
      { label: "Salle", data: [scanAudienceViewsA.value, scanAudienceViewsB.value], backgroundColor: "#1E4E66", borderRadius: 4 },
      { label: "Live", data: [liveViewsA, liveViewsB], backgroundColor: "#30DD92", borderRadius: 4 },
      { label: "Replay", data: [replayViewsA, replayViewsB], backgroundColor: "#6F45FF", borderRadius: 4 },
    ],
  };
});

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

// --- Replay sur la Vue d'ensemble : delegues uniques/jour (barre) + cumul de
// delegues distincts ayant deja consulte du replay (courbe croissante). Donnees
// issues de computeReplayStats (uniqueByDay + cumulativeUniqueByDay). Bucke sur
// l'horodatage de la VUE (date de visionnage), pas la date de session.
const replayUniqueByDay = computed(() => replayStats.value?.uniqueByDay || []);
const replayCumulativeByDay = computed(() => replayStats.value?.cumulativeUniqueByDay || []);
const replayDayLabels = computed(() => {
  const dates = replayUniqueByDay.value.map((d) => d.day);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
const replayByDayChartData = computed(() => ({
  labels: replayDayLabels.value,
  datasets: [{
    label: "Délégués uniques (replay)",
    data: replayUniqueByDay.value.map((d) => d.count),
    backgroundColor: "#6F45FF",
    borderRadius: 4,
    barThickness: Math.max(8, Math.min(40, 600 / (replayUniqueByDay.value.length || 1))),
  }],
}));
const replayByDayOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 11 },
    },
    tooltip: { callbacks: { label: (ctx) => `${ctx.raw.toLocaleString("fr-FR")} délégués uniques` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};
const replayCumulativeDatasets = computed(() => [{
  label: "Délégués cumulés (replay)",
  data: replayCumulativeByDay.value.map((d) => d.count),
  borderColor: "#6F45FF",
  backgroundColor: "rgba(111,69,255,0.10)",
  fill: true,
  tension: 0.3,
  pointRadius: 0,
  borderWidth: 2.5,
}]);

// --- Replay cumulé COMPARÉ (A vs B), aligné sur J0 ---
// Repris a l'identique de ViewersComparisonTab (Replay > Comparatif) : on aligne
// chaque event sur son propre J0 (1er jour de visionnage VOD), avec un cumul en
// carry-forward (les jours sans nouveau viewer restent a plat). Couleurs alignees
// sur le comparatif (vert event courant / gris event compare).
const COMPARE_COLORS = { current: "#27CE71", compare: "#9CA3AF" };

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

const replayCumulativeCompare = computed(() => {
  if (!hasCompare) return { labels: [], datasets: [] };
  const a = alignDaysOnJ0(replayStats.value?.cumulativeUniqueByDay);
  const b = alignDaysOnJ0(replayB?.stats.value?.cumulativeUniqueByDay);
  const maxOffset = Math.max(
    a.offsets.length > 0 ? a.offsets[a.offsets.length - 1] : -1,
    b.offsets.length > 0 ? b.offsets[b.offsets.length - 1] : -1,
  );
  if (maxOffset < 0) return { labels: [], datasets: [] };
  const labels = [];
  const dataA = [];
  const dataB = [];
  let lastA = 0;
  let lastB = 0;
  for (let i = 0; i <= maxOffset; i++) {
    labels.push(`J${i}`);
    if (a.byOffset[i] != null) lastA = a.byOffset[i];
    if (b.byOffset[i] != null) lastB = b.byOffset[i];
    dataA.push(lastA);
    dataB.push(lastB);
  }
  return {
    labels,
    datasets: [
      {
        label: shortName(props.eventName),
        data: dataA,
        borderColor: COMPARE_COLORS.current,
        backgroundColor: "rgba(39,206,113,0.10)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2.5,
      },
      {
        label: shortName(props.compareEventName),
        data: dataB,
        borderColor: COMPARE_COLORS.compare,
        backgroundColor: "rgba(156,163,175,0.10)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2.5,
      },
    ],
  };
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
/* 3 grands modes : cartes regroupant les sous-categories */
.participation-modes {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;
  margin: 18px 0 22px;
}
.mode-card {
  flex: 1 1 0;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f7f7f9;
  border-top: 4px solid #ccc;
}
.mode-physique { border-top-color: #16a36a; }
.mode-live     { border-top-color: #2A6A8A; }
.mode-replay   { border-top-color: #6F45FF; }
.mode-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.mode-title {
  flex: 1 1 100%;
  font-size: 11px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .4px; font-weight: 700;
}
.mode-total { font-size: 26px; font-weight: 700; color: var(--text, #414141); line-height: 1; }
.mode-pct { font-size: 13px; font-weight: 600; color: var(--text-muted, #888); }
.mode-subs {
  display: flex; flex-direction: column; gap: 4px;
  border-top: 1px dashed #e2e2e6; padding-top: 8px; margin-top: auto;
}
.mode-sub { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--text-secondary, #555); }
.sub-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.sub-label { flex: 1; }
.sub-value { font-weight: 700; color: var(--text, #414141); font-variant-numeric: tabular-nums; }
.mode-total-card {
  flex: 1 1 0; min-width: 150px;
  display: flex; flex-direction: column; gap: 6px; justify-content: center;
  padding: 12px 14px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(48,221,146,0.14), rgba(111,69,255,0.14));
  border: 2px solid var(--accent, #30DD92);
}
.mode-total-card .mode-title { flex: 0 0 auto; }
.mode-total-big { font-size: 30px; }
.sub-swatch.seg-checkin-only { background: #30DD92; }
.sub-swatch.seg-checkin-live { background: #16a36a; }
.sub-swatch.seg-checkin-replay { background: #0b6b48; }
.sub-swatch.seg-live-only   { background: #1E4E66; }
.sub-swatch.seg-both        { background: #2A6A8A; }
.sub-swatch.seg-replay-only { background: #6F45FF; }
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
  gap: 4px; /* separe visuellement les 3 zones (modes) */
}
.participation-bar-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #888);
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: .3px;
}
.participation-bar-compare { margin-bottom: 14px; }
/* Zone = 1 grand mode (physique / live / replay), subdivisee en sous-segments. */
.bar-zone {
  display: flex;
  height: 100%;
  transition: width 0.4s ease;
  border-radius: 3px;
  overflow: hidden;
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
.bar-segment.seg-checkin-only { background: #30DD92; color: #0c3a23; }
.bar-segment.seg-checkin-live { background: #16a36a; }
.bar-segment.seg-checkin-replay { background: #0b6b48; }
.bar-segment.seg-live-only   { background: #1E4E66; }
.bar-segment.seg-both        { background: #2A6A8A; }
.bar-segment.seg-replay-only { background: #6F45FF; }

.participation-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  font-size: 12px;
  color: var(--text, #414141);
  margin-bottom: 8px;
}
.legend-mode { display: flex; flex-direction: column; gap: 2px; }
.legend-mode-head { display: inline-flex; align-items: center; gap: 7px; font-weight: 500; }
.swatch-pair { display: inline-flex; gap: 2px; }
.swatch-pair .swatch {
  width: 11px; height: 11px; border-radius: 3px; display: inline-block;
}
.legend-mode-subs { font-size: 10px; color: var(--text-muted, #999); padding-left: 30px; }
.swatch.seg-checkin-only { background: #30DD92; }
.swatch.seg-checkin-live { background: #16a36a; }
.swatch.seg-checkin-replay { background: #0b6b48; }
.swatch.seg-live-only   { background: #1E4E66; }
.swatch.seg-both        { background: #2A6A8A; }
.swatch.seg-replay-only { background: #6F45FF; }

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
