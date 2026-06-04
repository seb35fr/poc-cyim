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
        <div class="kpi-label">{{ t("overview.kpi.totalRegistered") }}</div>
        <div class="kpi-value">{{ fmt(registeredCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.registeredStatus") }}</div>
        <span v-if="deltaRegisteredKpi" class="formula-delta" :class="deltaRegisteredKpi.cls" :title="tipRegisteredKpi">{{ deltaRegisteredKpi.arrow }} {{ deltaRegisteredKpi.text }}</span>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("overview.kpi.checkin") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.ofRegistered", { pct: pct(fs.global.checkedInCount, registeredCount) }) }}</div>
        <span v-if="deltaCheckinKpi" class="formula-delta" :class="deltaCheckinKpi.cls" :title="tipCheckinKpi">{{ deltaCheckinKpi.arrow }} {{ deltaCheckinKpi.text }}</span>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">{{ t("overview.kpi.onboarding") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.onboardingCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.ofRegistered", { pct: pct(fs.global.onboardingCount, registeredCount) }) }}</div>
        <span v-if="deltaOnboardingKpi" class="formula-delta" :class="deltaOnboardingKpi.cls" :title="tipOnboardingKpi">{{ deltaOnboardingKpi.arrow }} {{ deltaOnboardingKpi.text }}</span>
      </div>
      <div v-if="props.mobileAppId" class="kpi-card purple">
        <div class="kpi-label">{{ t("overview.kpi.mobileApp") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.mobileAppCount) }}</div>
        <div class="kpi-sub">{{ t("overview.kpi.ofRegisteredMobile", { pct: pct(fs.global.mobileAppCount, registeredCount) }) }}</div>
        <span v-if="deltaMobileKpi" class="formula-delta" :class="deltaMobileKpi.cls" :title="tipMobileKpi">{{ deltaMobileKpi.arrow }} {{ deltaMobileKpi.text }}</span>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">{{ t("overview.kpi.live") }}</div>
        <div class="kpi-value">
          <span v-if="liveLoading" class="kpi-loading">...</span>
          <template v-else>{{ fmt(liveUniqueUsers) }}</template>
        </div>
        <div class="kpi-sub">
          <template v-if="!liveLoading">{{ t("overview.kpi.ofRegistered", { pct: pct(liveUniqueUsers, registeredCount) }) }}</template>
          <template v-else>{{ t("overview.kpi.loading") }}</template>
        </div>
        <span v-if="!liveLoading && deltaLiveKpi" class="formula-delta" :class="deltaLiveKpi.cls" :title="tipLiveKpi">{{ deltaLiveKpi.arrow }} {{ deltaLiveKpi.text }}</span>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">{{ t("overview.kpi.replay") }}</div>
        <div class="kpi-value">
          <span v-if="replayLoading" class="kpi-loading">...</span>
          <template v-else>{{ fmt(replayUniqueUsers) }}</template>
        </div>
        <div class="kpi-sub">
          <template v-if="!replayLoading">{{ t("overview.kpi.ofRegistered", { pct: pct(replayUniqueUsers, registeredCount) }) }}</template>
          <template v-else>{{ t("overview.kpi.loading") }}</template>
        </div>
        <span v-if="!replayLoading && deltaReplayKpi" class="formula-delta" :class="deltaReplayKpi.cls" :title="tipReplayKpi">{{ deltaReplayKpi.arrow }} {{ deltaReplayKpi.text }}</span>
      </div>
    </div>

    <!-- Decomposition visuelle "Total participants" : un meme delegue compte
         1 fois meme s'il a vu live + replay sans venir. -->
    <div class="chart-card participation-card" v-if="!liveLoading && !replayLoading">
      <div class="chart-header">
        <h3>{{ t("overview.participation.decompositionTitle") }}</h3>
      </div>
      <div class="mode-filter">
        <span class="mode-filter-label">{{ t("overview.participation.modeFilterLabel") }}</span>
        <button
          v-for="m in ['PHYSIQUE', 'LIVE', 'REPLAY']"
          :key="m"
          type="button"
          class="mode-pill"
          :class="{ on: isModeOn(m) }"
          @click="toggleMode(m)"
        >{{ modeLabel(m) }}</button>
      </div>

      <!-- 3 grands modes de participation : Physique / Live distanciel /
           Replay distanciel. Chaque carte montre le total du mode + son detail. -->
      <div class="participation-modes">
        <div class="mode-card mode-physique">
          <div class="mode-head">
            <span class="mode-title">{{ t("overview.participation.physical") }}</span>
            <span class="mode-total">{{ fmt(physiqueCount) }}</span>
            <span class="mode-pct">{{ pct(physiqueCount, totalParticipants) }}</span>
            <span v-if="deltaPhysique" class="formula-delta" :class="deltaPhysique.cls" :title="tooltipPhysique">{{ deltaPhysique.arrow }} {{ deltaPhysique.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-checkin-only"></span><span class="sub-label">{{ t("overview.participation.onsiteOnly") }}</span><span class="sub-value">{{ fmt(checkedInOnlyCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-live"></span><span class="sub-label">{{ t("overview.participation.onsitePlusLive") }}</span><span class="sub-value">{{ fmt(checkedInLiveCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-livereplay"></span><span class="sub-label">{{ t("overview.participation.onsitePlusLiveReplay") }}</span><span class="sub-value">{{ fmt(checkedInLiveReplayCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-checkin-replay"></span><span class="sub-label">{{ t("overview.participation.onsitePlusReplay") }}</span><span class="sub-value">{{ fmt(checkedInReplayCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">+</span>
        <div class="mode-card mode-live">
          <div class="mode-head">
            <span class="mode-title">{{ t("overview.participation.liveRemote") }}</span>
            <span class="mode-total">{{ fmt(liveModeCount) }}</span>
            <span class="mode-pct">{{ pct(liveModeCount, totalParticipants) }}</span>
            <span v-if="deltaLiveMode" class="formula-delta" :class="deltaLiveMode.cls" :title="tooltipLiveMode">{{ deltaLiveMode.arrow }} {{ deltaLiveMode.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-live-only"></span><span class="sub-label">{{ t("overview.participation.liveOnly") }}</span><span class="sub-value">{{ fmt(liveOnlyRemoteCount) }}</span></div>
            <div class="mode-sub"><span class="sub-swatch seg-both"></span><span class="sub-label">{{ t("overview.participation.liveAndReplay") }}</span><span class="sub-value">{{ fmt(bothRemoteCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">+</span>
        <div class="mode-card mode-replay">
          <div class="mode-head">
            <span class="mode-title">{{ t("overview.participation.replayRemote") }}</span>
            <span class="mode-total">{{ fmt(replayModeCount) }}</span>
            <span class="mode-pct">{{ pct(replayModeCount, totalParticipants) }}</span>
            <span v-if="deltaReplayMode" class="formula-delta" :class="deltaReplayMode.cls" :title="tooltipReplayMode">{{ deltaReplayMode.arrow }} {{ deltaReplayMode.text }}</span>
          </div>
          <div class="mode-subs">
            <div class="mode-sub"><span class="sub-swatch seg-replay-only"></span><span class="sub-label">{{ t("overview.participation.replayOnly") }}</span><span class="sub-value">{{ fmt(replayOnlyRemoteCount) }}</span></div>
          </div>
        </div>
        <span class="formula-op">=</span>
        <div class="mode-card mode-total-card">
          <span class="mode-title">{{ t("overview.participation.total") }}</span>
          <span class="mode-total mode-total-big">{{ fmt(totalParticipants) }}</span>
          <span v-if="deltaTotal" class="formula-delta" :class="deltaTotal.cls" :title="tooltipTotal">{{ deltaTotal.arrow }} {{ deltaTotal.text }}</span>
        </div>
      </div>

      <!-- Barre A : 3 zones (modes) separees par un espace, chacune subdivisee
           en sous-segments. Largeur proportionnelle au total (barScaleA) dans
           une track ; le total absolu est affiche a droite. -->
      <div v-if="hasCompare && totalParticipants > 0" class="participation-bar-label">{{ eventName }}</div>
      <div class="participation-bar-row" v-if="totalParticipants > 0">
        <div class="participation-bar-track">
          <div class="participation-bar" :style="{ width: barScaleA + '%' }">
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
        </div>
        <span class="participation-bar-total">{{ fmt(totalParticipants) }}</span>
      </div>

      <!-- Barre B (event compare) : meme structure en zones. -->
      <template v-if="hasCompare">
        <div class="participation-bar-label">{{ compareEventName || t("overview.participation.comparedEvent") }}</div>
        <div class="participation-bar-row" v-if="totalParticipantsB > 0">
          <div class="participation-bar-track">
            <div class="participation-bar participation-bar-compare" :style="{ width: barScaleB + '%' }">
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
          </div>
          <span class="participation-bar-total">{{ fmt(totalParticipantsB) }}</span>
        </div>
        <p v-else class="participation-note" style="margin-bottom: 12px">{{ t("overview.participation.noParticipant", { name: compareEventName || t("overview.participation.comparedEventLower") }) }}</p>
      </template>

      <!-- Legende groupee par grand mode -->
      <div class="participation-legend">
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-checkin-only"></i><i class="swatch seg-checkin-live"></i><i class="swatch seg-checkin-livereplay"></i><i class="swatch seg-checkin-replay"></i></span> {{ t("overview.participation.physical") }} <strong>· {{ pct(physiqueCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">{{ t("overview.participation.legendPhysicalSubs", { a: fmt(checkedInOnlyCount), b: fmt(checkedInLiveCount), c: fmt(checkedInLiveReplayCount), d: fmt(checkedInReplayCount) }) }}</span>
        </div>
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-live-only"></i><i class="swatch seg-both"></i></span> {{ t("overview.participation.liveRemote") }} <strong>· {{ pct(liveModeCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">{{ t("overview.participation.legendLiveSubs", { a: fmt(liveOnlyRemoteCount), b: fmt(bothRemoteCount) }) }}</span>
        </div>
        <div class="legend-mode">
          <span class="legend-mode-head"><span class="swatch-pair"><i class="swatch seg-replay-only"></i></span> {{ t("overview.participation.replayRemote") }} <strong>· {{ pct(replayModeCount, totalParticipants) }}</strong></span>
          <span class="legend-mode-subs">{{ t("overview.participation.legendReplaySubs", { a: fmt(replayOnlyRemoteCount) }) }}</span>
        </div>
      </div>

      <p class="participation-note">
        {{ t("overview.participation.note") }}
      </p>
    </div>

    <!-- Charts de synthese participation (comparatif si ?compareWith=) -->
    <div v-if="!liveLoading && !replayLoading">
      <div class="charts-row cols-3">
        <!-- Chart 1 : Participants vs Inscrits, groupe par event -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("overview.charts.participantsVsRegistered") }}</h3>
            <span class="chart-hint">{{ t("overview.charts.participantsVsRegisteredHint") }}</span>
            <CsvButton
              filename="participants-vs-inscrits"
              :headers="[t('overview.csv.event'), t('overview.csv.registrations'), t('overview.csv.participants')]"
              :rows="hasCompare
                ? [[eventName, registeredCount, totalParticipants], [compareEventName, registeredCountB, totalParticipantsB]]
                : [[eventName, registeredCount, totalParticipants]]"
            />
          </div>
          <div :style="{ position: 'relative', height: '300px' }">
            <Bar :data="participantsVsRegisteredData" :options="groupedBarOptions" />
          </div>
        </div>

        <!-- Chart 2 : Repartition par type d'inscription (remontee a droite de
             Participants vs Inscrits). -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("overview.charts.byRegType") }}</h3>
            <span class="chart-hint">{{ t("overview.charts.byRegTypeHint") }}</span>
            <CsvButton
              filename="types-inscription"
              :headers="[t('overview.csv.type'), t('overview.csv.totalRegistered'), t('overview.csv.physical'), t('overview.csv.liveReplayOnly'), t('overview.csv.noParticipation')]"
              :rows="registeredTypesBreakdown.map(row => [row.value, row.total, row.physical, row.remote, row.none])"
            />
          </div>
          <StackedBarChart
            :labels="registeredTypesBreakdown.slice(0, 8).map(row => row.value)"
            :datasets="participationDatasets(registeredTypesBreakdown.slice(0, 8))"
            :horizontal="true"
            :show-total="true"
            :height="320"
            :active-label="afm.regType"
            @select="onTypeSelect"
          />
        </div>

        <!-- Chart 3 : PARTICIPANTS (physique/live/replay) par type d'inscription.
             x = event(s), stacked par type (légende = types). Visible aussi en
             mode simple (1 seule barre, données de l'event courant). -->
        <div class="chart-card">
          <div class="chart-header">
            <h3>{{ t("overview.charts.participantsByBadge") }}</h3>
            <span class="chart-hint"><template v-if="hasCompare">{{ t("overview.charts.participantsByBadgeHintCompare", { a: eventName, b: compareEventName }) }}</template><template v-else>{{ t("overview.charts.participantsByBadgeHint") }}</template></span>
            <CsvButton
              filename="participants-type-inscription"
              :headers="hasCompare ? [t('overview.csv.type'), eventName, compareEventName] : [t('overview.csv.type'), eventName]"
              :rows="participationByRegTypeChart.types.map((type, i) => hasCompare
                ? [type, participationByRegTypeChart.datasets[i].data[0], participationByRegTypeChart.datasets[i].data[1]]
                : [type, participationByRegTypeChart.datasets[i].data[0]])"
            />
          </div>
          <StackedBarChart
            :labels="participationByRegTypeChart.labels"
            :datasets="participationByRegTypeChart.datasets"
            :show-total="true"
            :height="320"
            legend-position="bottom"
          />
        </div>
      </div>

      <!-- Chart 3 : Audience salle + live + replay, horizontal empile par event -->
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("overview.charts.audienceMix") }}</h3>
          <span class="chart-hint">{{ t("overview.charts.audienceMixHint") }}</span>
          <CsvButton
            filename="audience-salle-live-replay"
            :headers="[t('overview.csv.event'), t('overview.csv.room'), t('overview.csv.live'), t('overview.csv.replay')]"
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
          {{ t("overview.charts.audienceNote") }}
        </p>
      </div>
    </div>

    <div class="charts-row" >
      <div class="chart-card" v-if="onboardingDaily.length > 0">
        <div class="chart-header">
          <h3>{{ t("overview.charts.onboardingEvolution") }}</h3>
          <CsvButton filename="onboarding" :headers="[t('overview.csv.date'), t('overview.csv.connections')]" :rows="onboardingDaily.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="onboardingLabels"
          :datasets="onboardingDatasets"
          :height="220"
        />
      </div>
      <div class="chart-card" v-if="mobileAppDaily.length > 0">
        <div class="chart-header">
          <h3>{{ t("overview.charts.mobileAppUsage") }}</h3>
          <CsvButton filename="mobile-app" :headers="[t('overview.csv.date'), t('overview.csv.users')]" :rows="mobileAppDaily.map(d => [d.date, d.count])" />
        </div>
        <LineChart
          :labels="mobileAppLabels"
          :datasets="mobileAppDatasets"
          :height="220"
        />
      </div>
    </div>

    <!-- Cumul replay (single event, hors comparaison). Les graphes "uniques par
         jour" et "cumulés — comparé" ont été retirés de la vue d'ensemble. -->
    <div class="chart-card" v-if="!hasCompare && replayCumulativeByDay.length > 0">
      <div class="chart-header">
        <h3>{{ t("overview.charts.replayCumul") }}</h3>
        <CsvButton filename="replay-cumul-delegues" :headers="[t('overview.csv.day'), t('overview.csv.delegatesCumul')]" :rows="replayCumulativeByDay.map(d => [d.day, d.count])" />
      </div>
      <LineChart :labels="replayDayLabels" :datasets="replayCumulativeDatasets" :height="260" />
      <p class="chart-hint">{{ t("overview.charts.replayCumulHint") }}</p>
    </div>

  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
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
import { computeAllStats } from "@/utils/computeStats.js";
import { fmt, pct } from "@/utils/formatters.js";

const { t } = useI18n();

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
// NB : non affectes par le filtre "mode de consultation" (qui ne pilote que le
// bloc "Total participants").
const physicallyCheckedInSet = computed(() => participation.value.checkedIn);
const liveRemoteSet = computed(() => participation.value.liveRemote);
const replayRemoteSet = computed(() => participation.value.replayRemote);

// --- Filtre "Modalité de participation" (PHYSIQUE / LIVE / REPLAY) ---
// Multi-select, tout coche par defaut. Une sous-categorie de la decomposition
// reste comptee si elle implique AU MOINS UN mode selectionne. Les 7 categories
// etant DISJOINTES, le total se recalcule par simple somme des categories visibles.
const ALL_MODES = ["PHYSIQUE", "LIVE", "REPLAY"];
const selectedModes = ref(new Set(ALL_MODES));
function toggleMode(m) {
  const next = new Set(selectedModes.value);
  if (next.has(m)) next.delete(m);
  else next.add(m);
  // Jamais tout decocher (bloc vide) -> on retombe sur "tout".
  selectedModes.value = next.size === 0 ? new Set(ALL_MODES) : next;
}
const isModeOn = (m) => selectedModes.value.has(m);
// Libelle affiche des pills de mode (les cles internes restent PHYSIQUE/LIVE/REPLAY).
const modeLabel = (m) =>
  ({ PHYSIQUE: t("overview.modes.physique"), LIVE: t("overview.modes.live"), REPLAY: t("overview.modes.replay") })[m] || m;
const CATEGORY_MODES = {
  checkedInOnly: ["PHYSIQUE"],
  checkedInLive: ["PHYSIQUE", "LIVE"],
  checkedInReplay: ["PHYSIQUE", "REPLAY"],
  checkedInLiveReplay: ["PHYSIQUE", "LIVE", "REPLAY"],
  liveOnly: ["LIVE"],
  both: ["LIVE", "REPLAY"],
  replayOnly: ["REPLAY"],
};
function applyModeFilter(counts) {
  const v = (cat) =>
    CATEGORY_MODES[cat].some((m) => selectedModes.value.has(m)) ? counts[cat] || 0 : 0;
  const checkedInOnly = v("checkedInOnly");
  const checkedInLive = v("checkedInLive");
  const checkedInReplay = v("checkedInReplay");
  const checkedInLiveReplay = v("checkedInLiveReplay");
  const liveOnly = v("liveOnly");
  const both = v("both");
  const replayOnly = v("replayOnly");
  const checkedIn = checkedInOnly + checkedInLive + checkedInReplay + checkedInLiveReplay;
  return {
    checkedIn, checkedInOnly, checkedInLive, checkedInReplay, checkedInLiveReplay,
    liveOnly, both, replayOnly,
    total: checkedIn + liveOnly + both + replayOnly,
  };
}
// Counts FILTRES par mode (source unique du bloc "Total participants" : cards,
// barre, legende, deltas, scale).
const fc = computed(() => applyModeFilter(participation.value.counts));

// Counts pour la decomposition visuelle (chips + barre + legende) — lus depuis fc.
const physicallyCheckedInCount = computed(() => fc.value.checkedIn);
const checkedInOnlyCount = computed(() => fc.value.checkedInOnly);
const checkedInLiveCount = computed(() => fc.value.checkedInLive);
const checkedInReplayCount = computed(() => fc.value.checkedInReplay);
const checkedInLiveReplayCount = computed(() => fc.value.checkedInLiveReplay);
const liveOnlyRemoteCount = computed(() => fc.value.liveOnly);
const bothRemoteCount = computed(() => fc.value.both);
const replayOnlyRemoteCount = computed(() => fc.value.replayOnly);
const totalParticipants = computed(() => fc.value.total);

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
    : { counts: { checkedIn: 0, checkedInOnly: 0, checkedInLive: 0, checkedInReplay: 0, checkedInLiveReplay: 0, liveOnly: 0, both: 0, replayOnly: 0, total: 0 } },
);
// Counts B filtres par le meme mode de consultation (coherence des deltas).
const fcB = computed(() => applyModeFilter(participationB.value.counts));
const checkedInBCount = computed(() => fcB.value.checkedIn);
const checkedInOnlyBCount = computed(() => fcB.value.checkedInOnly);
const checkedInLiveBCount = computed(() => fcB.value.checkedInLive);
const checkedInReplayBCount = computed(() => fcB.value.checkedInReplay);
const checkedInLiveReplayBCount = computed(() => fcB.value.checkedInLiveReplay);
const liveOnlyRemoteBCount = computed(() => fcB.value.liveOnly);
const bothRemoteBCount = computed(() => fcB.value.both);
const replayOnlyRemoteBCount = computed(() => fcB.value.replayOnly);
const totalParticipantsB = computed(() => fcB.value.total);

// Calcule un delta % (a vs b). Si b == 0 et a > 0 : "Nouveau" (vert).
// Si a == 0 et b > 0 : "-100%" (rouge). Sinon : signe + pct + classe.
function buildDeltaPct(a, b) {
  if (!hasCompare) return null;
  if (b === 0 && a === 0) return { arrow: "=", text: "0%", cls: "delta--neutral" };
  if (b === 0) return { arrow: "▲", text: t("overview.misc.new"), cls: "delta--good" };
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
  const name = props.compareEventName || t("overview.misc.eventComparedFallback");
  return t("overview.misc.tooltipDelegates", { diff: diffStr, name, value: fmt(b ?? 0) });
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
      label: t("overview.participation.physical"),
      total: c.checkedInOnly + c.checkedInLive + c.checkedInReplay + c.checkedInLiveReplay,
      segments: [
        { cls: "seg-checkin-only", label: t("overview.participation.onsiteOnly"), count: c.checkedInOnly },
        { cls: "seg-checkin-live", label: t("overview.participation.onsitePlusLive"), count: c.checkedInLive },
        { cls: "seg-checkin-livereplay", label: t("overview.participation.onsitePlusLiveReplay"), count: c.checkedInLiveReplay },
        { cls: "seg-checkin-replay", label: t("overview.participation.onsitePlusReplay"), count: c.checkedInReplay },
      ],
    },
    {
      key: "live",
      label: t("overview.participation.liveRemote"),
      total: c.liveOnly + c.both,
      segments: [
        { cls: "seg-live-only", label: t("overview.participation.liveOnly"), count: c.liveOnly },
        { cls: "seg-both", label: t("overview.participation.liveAndReplay"), count: c.both },
      ],
    },
    {
      key: "replay",
      label: t("overview.participation.replayRemote"),
      total: c.replayOnly,
      segments: [
        { cls: "seg-replay-only", label: t("overview.participation.replayOnly"), count: c.replayOnly },
      ],
    },
  ];
}
const zonesA = computed(() => buildZones(fc.value));
const zonesB = computed(() => buildZones(fcB.value));

const registeredCount = computed(() =>
  pageFilteredDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);
const registeredCountB = computed(() =>
  pageFilteredCompareDelegates.value.filter((d) => d.status?.toLowerCase() === "registered").length
);

// --- KPI : delta % vs event compare (seulement si ?compareWith=). Reutilise
// buildDeltaPct (renvoie null hors comparaison -> v-if cache le badge) et
// makeTooltip (valeurs absolues de l'event compare au survol). Valeurs B via
// computeAllStats sur les delegues compares = meme logique que fs cote A
// (check-in / onboarding / mobile dans global, + filtre date).
const compareStats = computed(() =>
  hasCompare
    ? computeAllStats(pageFilteredCompareDelegates.value, props.mobileAppId, props.dateRange)
    : null,
);
const checkedInGlobalB = computed(() => compareStats.value?.global.checkedInCount || 0);
const onboardingB = computed(() => compareStats.value?.global.onboardingCount || 0);
const mobileAppB = computed(() => compareStats.value?.global.mobileAppCount || 0);
const liveUniqueUsersB = computed(() => liveB?.stats.value?.global?.uniqueUsers || 0);
const replayUniqueUsersB = computed(() => replayB?.stats.value?.global?.uniqueUsers || 0);

const deltaRegisteredKpi = computed(() => buildDeltaPct(registeredCount.value, registeredCountB.value));
const deltaCheckinKpi = computed(() => buildDeltaPct(fs.value.global.checkedInCount, checkedInGlobalB.value));
const deltaOnboardingKpi = computed(() => buildDeltaPct(fs.value.global.onboardingCount, onboardingB.value));
const deltaMobileKpi = computed(() => buildDeltaPct(fs.value.global.mobileAppCount, mobileAppB.value));
const deltaLiveKpi = computed(() => buildDeltaPct(liveUniqueUsers.value, liveUniqueUsersB.value));
const deltaReplayKpi = computed(() => buildDeltaPct(replayUniqueUsers.value, replayUniqueUsersB.value));

const tipRegisteredKpi = computed(() => makeTooltip(registeredCount.value, registeredCountB.value));
const tipCheckinKpi = computed(() => makeTooltip(fs.value.global.checkedInCount, checkedInGlobalB.value));
const tipOnboardingKpi = computed(() => makeTooltip(fs.value.global.onboardingCount, onboardingB.value));
const tipMobileKpi = computed(() => makeTooltip(fs.value.global.mobileAppCount, mobileAppB.value));
const tipLiveKpi = computed(() => makeTooltip(liveUniqueUsers.value, liveUniqueUsersB.value));
const tipReplayKpi = computed(() => makeTooltip(replayUniqueUsers.value, replayUniqueUsersB.value));

// Libelles d'axe pour les charts comparatifs Vue d'ensemble : 1 ou 2 events.
const eventAxisLabels = computed(() =>
  hasCompare
    ? [props.eventName || t("overview.misc.axisEventA"), props.compareEventName || t("overview.misc.axisEventB")]
    : [props.eventName || t("overview.misc.axisEvent")],
);

// --- Chart 1 : Participants (physique+live+replay dedoublonne) vs Inscrits
// (registered), groupe par event. Barres groupees (non empilees).
const participantsVsRegisteredData = computed(() => ({
  labels: eventAxisLabels.value,
  datasets: [
    {
      label: t("overview.datasets.registrations"),
      data: hasCompare ? [registeredCount.value, registeredCountB.value] : [registeredCount.value],
      backgroundColor: "#1E4E66",
      borderRadius: 4,
      maxBarThickness: 90,
    },
    {
      label: t("overview.datasets.participants"),
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
    legend: { position: "top", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: {
      display: true, anchor: "end", align: "end", offset: 2, clip: false,
      color: "#414141", font: { weight: 600, size: 13 },
      formatter: (v) => (v > 0 ? v.toLocaleString("fr-FR") : ""),
    },
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toLocaleString("fr-FR")}` } },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    // grace : marge haute pour que les totaux en bout de barre ne chevauchent
    // pas la legende du haut.
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true, grace: "12%" },
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
        { label: t("overview.datasets.room"), data: [scanAudienceViewsA.value], backgroundColor: "#1E4E66", borderRadius: 4 },
        { label: t("overview.datasets.live"), data: [liveViewsA], backgroundColor: "#30DD92", borderRadius: 4 },
        { label: t("overview.datasets.replay"), data: [replayViewsA], backgroundColor: "#6F45FF", borderRadius: 4 },
      ],
    };
  }
  const liveViewsB = liveB?.stats.value?.global?.totalViews || 0;
  const replayViewsB = replayB?.stats.value?.global?.totalViews || 0;
  return {
    labels: eventAxisLabels.value,
    datasets: [
      { label: t("overview.datasets.room"), data: [scanAudienceViewsA.value, scanAudienceViewsB.value], backgroundColor: "#1E4E66", borderRadius: 4 },
      { label: t("overview.datasets.live"), data: [liveViewsA, liveViewsB], backgroundColor: "#30DD92", borderRadius: 4 },
      { label: t("overview.datasets.replay"), data: [replayViewsA, replayViewsB], backgroundColor: "#6F45FF", borderRadius: 4 },
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

// --- Comparaison des PARTICIPANTS (physique OU live OU replay, dedupe) par
// TYPE d'inscription, par event. x = events (A/B), y = nombre, stacked par type
// (legende = types). Population = ceux qui ont participe (exclut les no-show).
// Un delegue multi-types compte dans chacun de ses types.
function participantsByRegType(delegates, part) {
  const phyIds = part?.checkedIn || new Set();
  const remoteIds = new Set([...(part?.liveRemote || []), ...(part?.replayRemote || [])]);
  const byType = new Map();
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!phyIds.has(d.id) && !remoteIds.has(d.id)) continue;
    const set = new Set();
    for (const r of d.registrations || []) if (r.type) set.add(r.type);
    for (const t of set) byType.set(t, (byType.get(t) || 0) + 1);
  }
  return byType;
}
const participationByRegTypeChart = computed(() => {
  const mapA = participantsByRegType(pageFilteredDelegates.value, participation.value);
  const mapB = participantsByRegType(pageFilteredCompareDelegates.value, participationB.value);
  const types = [...new Set([...mapA.keys(), ...mapB.keys()])].sort(
    (t1, t2) => (mapA.get(t2) || 0) + (mapB.get(t2) || 0) - ((mapA.get(t1) || 0) + (mapB.get(t1) || 0)),
  );
  const datasets = types.map((type) => ({
    label: type,
    data: [mapA.get(type) || 0, mapB.get(type) || 0],
    backgroundColor: getTypeColor(type),
    borderRadius: 4,
  }));
  return { labels: eventAxisLabels.value, datasets, types };
});

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
      label: t("overview.datasets.physical"),
      data: breakdown.map((b) => b.physical),
      backgroundColor: "#30DD92",
      borderRadius: 4,
    },
    {
      label: t("overview.datasets.liveReplayOnly"),
      data: breakdown.map((b) => b.remote),
      backgroundColor: "#6F45FF",
      borderRadius: 4,
    },
    {
      label: t("overview.datasets.noParticipation"),
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
      label: t("overview.datasets.usersCumul"),
      data: cumulData,
      borderColor: "#6F45FF",
      backgroundColor: "rgba(111,69,255,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: t("overview.datasets.usersPerDay"),
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
      label: t("overview.datasets.connectionsCumul"),
      data: cumulData,
      borderColor: "#FFA600",
      backgroundColor: "rgba(255,166,0,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
    },
    {
      label: t("overview.datasets.connectionsPerDay"),
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
const replayCumulativeDatasets = computed(() => [{
  label: t("overview.datasets.delegatesCumulReplay"),
  data: replayCumulativeByDay.value.map((d) => d.count),
  borderColor: "#6F45FF",
  backgroundColor: "rgba(111,69,255,0.10)",
  fill: true,
  tension: 0.3,
  pointRadius: 0,
  borderWidth: 2.5,
}]);

</script>

<style scoped>
.chart-hint {
  font-size: 12px; color: var(--text-muted); font-style: italic;
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
.kpi-card-highlight .kpi-value { font-size: 37px; }
.kpi-card-highlight .kpi-sub { line-height: 1.5; }

/* Decomposition "Total participants" */
.participation-card { margin-top: 16px; }

/* Filtre "Modalité de participation" (pills PHYSIQUE / LIVE / REPLAY) */
.mode-filter { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 2px 0 14px; }
.mode-filter-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
  color: var(--text-muted); margin-right: 2px;
}
.mode-pill {
  font: inherit; font-size: 12px; font-weight: 700; letter-spacing: .3px;
  padding: 4px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--border); background: #fff; color: var(--text-muted);
  transition: all .12s;
}
.mode-pill:hover { border-color: var(--primary); color: var(--primary); }
.mode-pill.on {
  background: var(--primary); border-color: var(--primary); color: #fff;
}
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
  font-size: 13px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .4px; font-weight: 700;
}
.mode-total { font-size: 30px; font-weight: 700; color: #254f65; line-height: 1; }
.mode-pct { font-size: 15px; font-weight: 600; color: var(--text-muted, #888); }
.mode-subs {
  display: flex; flex-direction: column; gap: 4px;
  border-top: 1px dashed #e2e2e6; padding-top: 8px; margin-top: auto;
}
.mode-sub { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-secondary, #555); }
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
.mode-total-big { font-size: 35px; }
.sub-swatch.seg-checkin-only { background: #30DD92; }
.sub-swatch.seg-checkin-live { background: #16a36a; }
.sub-swatch.seg-checkin-replay { background: #0b6b48; }
.sub-swatch.seg-checkin-livereplay { background: #094f37; }
.sub-swatch.seg-live-only   { background: #1E4E66; }
.sub-swatch.seg-both        { background: #2A6A8A; }
.sub-swatch.seg-replay-only { background: #6F45FF; }
.formula-delta {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
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
  font-size: 25px;
  font-weight: 700;
  color: var(--text-muted, #999);
}

/* Ligne = track (barre mise a l'echelle) + total absolu a droite. */
.participation-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.participation-bar-track { flex: 1; min-width: 0; }
.participation-bar-total {
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #414141);
  font-variant-numeric: tabular-nums;
}
.participation-bar {
  display: flex;
  width: 100%;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f0f0;
  gap: 4px; /* separe visuellement les 3 zones (modes) */
}
.participation-bar-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted, #888);
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: .3px;
}
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
  font-size: 15px;
  font-weight: 600;
  transition: width 0.4s ease;
  overflow: hidden;
  white-space: nowrap;
}
.bar-segment.seg-checkin-only { background: #30DD92; color: #0c3a23; }
.bar-segment.seg-checkin-live { background: #16a36a; }
.bar-segment.seg-checkin-replay { background: #0b6b48; }
.bar-segment.seg-checkin-livereplay { background: #094f37; }
.bar-segment.seg-live-only   { background: #1E4E66; }
.bar-segment.seg-both        { background: #2A6A8A; }
.bar-segment.seg-replay-only { background: #6F45FF; }

.participation-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  font-size: 14px;
  color: var(--text, #414141);
  margin-bottom: 8px;
}
.legend-mode { display: flex; flex-direction: column; gap: 2px; }
.legend-mode-head { display: inline-flex; align-items: center; gap: 7px; font-weight: 500; }
.swatch-pair { display: inline-flex; gap: 2px; }
.swatch-pair .swatch {
  width: 11px; height: 11px; border-radius: 3px; display: inline-block;
}
.legend-mode-subs { font-size: 12px; color: var(--text-muted, #999); padding-left: 30px; }
.swatch.seg-checkin-only { background: #30DD92; }
.swatch.seg-checkin-live { background: #16a36a; }
.swatch.seg-checkin-replay { background: #0b6b48; }
.swatch.seg-checkin-livereplay { background: #094f37; }
.swatch.seg-live-only   { background: #1E4E66; }
.swatch.seg-both        { background: #2A6A8A; }
.swatch.seg-replay-only { background: #6F45FF; }

.participation-note {
  font-size: 13px;
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
.kpi-card-status .kpi-label { font-size: 16px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; font-weight: 600; }
.status-row { display: flex; align-items: center; gap: 10px; }
.legend-col { display: flex; flex-direction: column; gap: 3px; }
.legend-col .legend-pill { font-size: 12px; }
</style>
