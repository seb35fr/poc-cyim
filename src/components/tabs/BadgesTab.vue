<template>
  <div v-if="stats">
    <FilterBanner
      :has-filters="hasFilters"
      :active-filters="activeFilters"
      :filtered-count="filteredCount"
      :total-count="stats.global.totalDelegatesCount"
      @remove="(key, label) => removeFilter(key, label)"
      @clear="clearFilters"
    />

    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("badges.kpi.checkinDone") }}</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ t("badges.kpi.ofPresent", { pct: pct(fs.global.checkedInCount, registeredCount) }) }}</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label kpi-label-with-action">
          <span>{{ t("badges.kpi.badgesPrinted") }}</span>
          <CsvButton
            filename="badges-imprimes"
            :headers="badgesCsvHeaders"
            :rows="badgesCsvRows"
          />
        </div>
        <div class="kpi-value">{{ fmt(fs.global.totalBadgesDelivered) }}</div>
        <div class="kpi-sub">{{ t("badges.kpi.ofExpected", { pct: pct(fs.global.totalBadgesDelivered, registeredCount) }) }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("badges.kpi.peakCheckin") }}</div>
        <div class="kpi-value">{{ fs.checkinFlow.peakSlot.count > 0 ? t("badges.kpi.per15min", { n: fs.checkinFlow.peakSlot.count }) : '—' }}</div>
        <div class="kpi-sub" v-if="fs.checkinFlow.peakSlot.count > 0">
          {{ t("badges.kpi.peakWhen", { date: fs.checkinFlow.peakSlot.date, time: fs.checkinFlow.peakSlot.time, rate: fs.checkinFlow.peakSlot.count * 4 }) }}
        </div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">{{ t("badges.kpi.peakPrint") }}</div>
        <div class="kpi-value">{{ fs.badges.peakSlot.count > 0 ? t("badges.kpi.per15min", { n: fs.badges.peakSlot.count }) : '—' }}</div>
        <div class="kpi-sub" v-if="fs.badges.peakSlot.count > 0">
          {{ t("badges.kpi.peakWhen", { date: fs.badges.peakSlot.date, time: fs.badges.peakSlot.time, rate: fs.badges.peakSlot.count * 4 }) }}
        </div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">{{ t("badges.kpi.perfPerDevice") }}</div>
        <div class="kpi-value">{{ perfPerDeviceMin }}</div>
        <div class="kpi-sub" v-if="fs.badges.peakMinute?.count > 0">
          {{ perfPerDeviceSub }}
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">{{ t("badges.kpi.remainingNoBadge") }}</div>
        <div class="kpi-value">{{ fmt(confirmedWithoutBadge) }}</div>
      </div>
    </div>

    <!-- Le filtre par type de badge est desormais GLOBAL (toolbar StatisticsView),
         applique a tous les onglets — plus de filtre local ici. -->

    <!-- Progression du check-in (gauche) / Progression par type (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <h3>{{ t("badges.charts.checkinProgress") }}</h3>
        <div class="progress-bar-container">
          <div class="progress-bar-fill-checkin" :style="{ width: checkinPct }"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
          <span>{{ t("badges.charts.checkedInOf", { n: fmt(fs.global.checkedInCount), pct: checkinPct }) }}</span>
          <span>{{ t("badges.charts.expectedRegistered", { n: fmt(registeredCount) }) }}</span>
        </div>

        <div v-if="burndown.labels.length > 0" style="margin-top: 16px;">
          <div class="chart-header" style="margin-bottom: 6px;">
            <h4 style="margin: 0; font-size: 15px; color: var(--text-secondary); font-weight: 600;">
              {{ t("badges.charts.burndownTitle") }}
            </h4>
            <CsvButton filename="burndown-checkin"
              :headers="[t('badges.csv.timestamp'), t('badges.csv.remaining')]"
              :rows="burndown.labels.map((l, i) => [l, burndown.data[i]])" />
          </div>
          <LineChart
            :labels="burndown.labels"
            :datasets="burndownDatasets"
            :height="220"
            :y-begin-at-zero="true"
          />
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.checkinByType") }}</h3>
          <span class="chart-hint" style="margin: 0;">{{ t("badges.charts.checkinByTypeHint") }}</span>
        </div>
        <div v-if="checkinByType.labels.length > 0"
          :style="{ position: 'relative', height: checkinByType.height + 'px' }">
          <Bar :data="checkinByType.chartData" :options="checkinByTypeOptions" :plugins="[checkinByTypeTotalsPlugin]" />
        </div>
        <p v-else class="empty-msg">{{ t("badges.empty.noRegistered") }}</p>
      </div>
    </div>

    <!-- Day charts side-by-side : Check-in (gauche) / Badges (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.checkinPerDay") }}</h3>
          <CsvButton filename="checkin-par-jour" :headers="[t('badges.csv.date'), t('badges.csv.checkin')]" :rows="checkinByDay.map(([d, c]) => [d, c])" />
        </div>
        <template v-if="checkinDayLabels.length > 0">
          <div :style="{ position: 'relative', height: '280px' }">
            <Bar :data="checkinDayChartData" :options="checkinDayByTypeOptions" :plugins="[checkinDayTotalsPlugin]" />
          </div>
        </template>
        <p v-else class="empty-msg">{{ t("badges.empty.noCheckin") }}</p>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.badgesPerDay") }}</h3>
          <CsvButton filename="badges-par-jour" :headers="[t('badges.csv.date'), t('badges.csv.badges')]" :rows="(stats.badges.byDay || []).map(d => [d.date, d.count])" />
        </div>
        <template v-if="badgesDayLabels.length > 0">
          <div :style="{ position: 'relative', height: '280px' }">
            <Bar :data="badgesDayChartData" :options="badgesDayOptions" :plugins="[checkinDayTotalsPlugin]" />
          </div>
          <p class="chart-hint">{{ t("badges.charts.badgesPerDayHint") }}</p>
        </template>
        <p v-else class="empty-msg">{{ t("badges.empty.noBadge") }}</p>
      </div>
    </div>

    <!-- 15-min charts side-by-side : Check-in (gauche) / Distribution (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.perfCheckin15") }}</h3>
          <div style="display: flex; align-items: center; gap: 6px;">
            <CsvButton filename="perf-checkin-15min" :headers="[t('badges.csv.date'), t('badges.csv.time'), t('badges.csv.checkin')]" :rows="filteredCheckin15min.map(s => [s.date, s.time, s.count])" />
            <div v-if="availableCheckinDays.length > 1" class="period-selector">
              <button v-for="day in availableCheckinDays" :key="day"
                :class="['period-btn', { active: selectedCheckinDay === day }]"
                @click="selectedCheckinDay = day">
                {{ day === 'all' ? t('badges.allShort') : day.slice(5) }}
              </button>
            </div>
          </div>
        </div>
        <template v-if="perfCheckin15Labels.length > 0">
          <div :style="{ position: 'relative', height: '280px' }">
            <Bar :data="perfCheckin15ChartData" :options="perfCheckin15Options" />
          </div>
          <div class="perf-summary">
            <span><strong>{{ t("badges.perf.avg") }} :</strong> {{ avgCheckinPer15min }} {{ t("badges.perf.unitCheckin15") }}</span>
            <span><strong>{{ t("badges.perf.max") }} :</strong> {{ maxCheckinPer15min }} {{ t("badges.perf.unitCheckin15") }}</span>
            <span><strong>{{ t("badges.perf.hourlyMax") }} :</strong> {{ maxCheckinPer15min * 4 }} check-in/h</span>
          </div>
        </template>
        <p v-else class="empty-msg">{{ t("badges.empty.noCheckinData") }}</p>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.perfDistribution15") }}</h3>
          <div style="display: flex; align-items: center; gap: 6px;">
            <CsvButton filename="perf-15min" :headers="[t('badges.csv.date'), t('badges.csv.time'), t('badges.csv.badges')]" :rows="filtered15min.map(s => [s.date, s.time, s.count])" />
            <div v-if="availableDays.length > 1" class="period-selector">
              <button v-for="day in availableDays" :key="day"
                :class="['period-btn', { active: selectedDay === day }]"
                @click="selectedDay = day">
                {{ day === 'all' ? t('badges.allShort') : day.slice(5) }}
              </button>
            </div>
          </div>
        </div>
        <template v-if="perf15Labels.length > 0">
          <div :style="{ position: 'relative', height: '280px' }">
            <Bar :data="perf15ChartData" :options="perf15Options" />
          </div>
          <div class="perf-summary">
            <span><strong>{{ t("badges.perf.avg") }} :</strong> {{ avgPer15min }} {{ t("badges.perf.unitBadges15") }}</span>
            <span><strong>{{ t("badges.perf.max") }} :</strong> {{ maxPer15min }} {{ t("badges.perf.unitBadges15") }}</span>
            <span><strong>{{ t("badges.perf.hourlyMax") }} :</strong> {{ maxPer15min * 4 }} badges/h</span>
          </div>
        </template>
        <p v-else class="empty-msg">{{ t("badges.empty.noDistributionData") }}</p>
      </div>
    </div>

    <!-- Badges imprimés par device (stacked par type de badge) -->
    <div class="chart-card">
      <div class="chart-header">
        <h3>{{ t("badges.charts.badgesByDevice") }}</h3>
        <CsvButton filename="badges-par-device"
          :headers="[t('badges.csv.device'), ...badgeTypeList.map(typeLbl)]"
          :rows="deviceLabels.map(dev => [typeLbl(dev), ...badgeTypeList.map(bt => deviceByType[dev]?.[bt] || 0)])" />
      </div>
      <template v-if="deviceLabels.length > 0">
        <div :style="{ position: 'relative', height: deviceChartHeight + 'px' }">
          <Bar :data="deviceChartData" :options="deviceChartOptions" :plugins="[deviceRowTotalsPlugin]" />
        </div>
      </template>
      <p v-else class="empty-msg">{{ t("badges.empty.noDeviceData") }}</p>
    </div>

    <!-- Mix des types d'inscriptions (presents confirmes) -->
    <div class="chart-card" v-if="typesMixChart.datasets.length > 0">
      <div class="chart-header">
        <h3>{{ t("badges.charts.typesMix") }}</h3>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="chart-hint" style="margin: 0;">
            {{ t("badges.charts.typesMixHintPre") }} <code>status = registered</code> {{ t("badges.charts.typesMixHintAnd") }} <code>checkedInDate</code> {{ t("badges.charts.typesMixHintPost") }}
          </span>
          <CsvButton filename="mix-types-presents"
            :headers="[t('badges.csv.type'), t('badges.csv.pct'), t('badges.csv.count')]"
            :rows="typesMixChart.datasets.map(ds => [ds.label, ds.data[0], ds._count || 0])" />
        </div>
      </div>
      <div :style="{ position: 'relative', height: typesMixHeight + 'px' }">
        <Bar :data="typesMixChart" :options="typesMixOptions" />
      </div>
    </div>

    <!-- Repartition geographique (monde + France) — extrait dans RegionalMaps. -->
    <RegionalMaps
      :delegates="filteredDelegates"
      :cache-key="badgeFilterKey"
      filename-prefix="repartition"
      :show-scale-legend="true"
    />

    <!-- Flux par jour et heure : check-in (gauche) / badges (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.checkinFlowByHour") }}</h3>
          <CsvButton filename="checkin-par-heure" :headers="[t('badges.csv.hour'), ...checkinDays.map(d => d.slice(5))]" :rows="allCheckinHours.map(h => [h, ...checkinDays.map(day => (fs.checkinFlow?.byDayAndHour?.[day]?.[h] || 0))])" />
        </div>
        <LineChart
          v-if="hourlyLabels.length > 0"
          :labels="hourlyLabels"
          :datasets="hourlyDatasets"
          :height="220"
        />
        <p v-else class="empty-msg">{{ t("badges.empty.noCheckin") }}</p>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("badges.charts.badgesFlowByHour") }}</h3>
          <CsvButton filename="badges-par-heure" :headers="[t('badges.csv.hour'), ...badgeDays.map(d => d.slice(5))]" :rows="allBadgeHours.map(h => [h, ...badgeDays.map(day => (fs.badges?.byDayAndHour?.[day]?.[h] || 0))])" />
        </div>
        <LineChart
          v-if="badgeHourlyLabels.length > 0"
          :labels="badgeHourlyLabels"
          :datasets="badgeHourlyDatasets"
          :height="220"
        />
        <p v-else class="empty-msg">{{ t("badges.empty.noBadge") }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { parisDay, parisDateTime } from "../../utils/parisTime.js";
import { buildBurndownAbsolute } from "../../utils/burndown.js";
import { makeInRange } from "../../utils/dateRange.js";
import { getTypeColor } from "../../utils/typeColors.js";
import { notSpecified } from "@/i18n/labels.js";
import { fmt, pct } from "@/utils/formatters.js";
import {
  delegateBadgeType,
  buildCheckinByType,
  checkinByTypeOptions,
  checkinByTypeTotalsPlugin,
} from "../../utils/checkinByType.js";
import RegionalMaps from "../charts/RegionalMaps.vue";

const { t } = useI18n();

// Libelle d'affichage pour les placeholders canoniques (cles internes /
// logique couleur+filtre inchangees). Une vraie valeur de type/device passe
// telle quelle (donnee libre).
const typeLbl = (v) => {
  if (v === "Inconnu") return t("common.unknown");
  if (v === "Autres") return t("common.others");
  if (v === "Non renseigne") return notSpecified();
  return v;
};

const props = defineProps({
  stats: Object,
  delegates: Array,
  // Filtre badge type lifte au niveau StatisticsView (etat partage avec Overview/Comparison).
  badgeFilter: { type: Object, required: true },
  // Plage de dates globale (filtre par activite) — propagee a useFilteredStats.
  dateRange: { type: Object, default: null },
});

// --- Filtre global badge type : etat partage avec Overview/Comparison ---
const {
  selected: selectedBadgeTypes,
  allBadgeTypes: availableBadgeTypes,
  filteredDelegates: pageFilteredDelegates,
  toggle: toggleBadgeType,
  clear: clearBadgeTypes,
  setSelection: setBadgeTypes,
} = props.badgeFilter;

// Cle stable pour invalider les Choropleth quand la selection change.
const badgeFilterKey = computed(() => {
  return [...selectedBadgeTypes.value].sort().join("|") || "all";
});

const {
  filteredDelegates, filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => pageFilteredDelegates.value, () => null, () => props.dateRange);

// Liste avec check-in MASQUE hors plage de dates globale : un check-in dont la
// date sort de la plage est traite comme absent (checkedInDate = null). Sert aux
// calculs check-in "bruts" (check-in par type, mix des presents) pour qu'ils
// respectent le filtre date au meme titre que fs.checkinFlow.
const checkinScopedDelegates = computed(() => {
  if (!props.dateRange) return filteredDelegates.value || [];
  const inRange = makeInRange(props.dateRange);
  return (filteredDelegates.value || []).map((d) =>
    d.checkedInDate && !inRange(d.checkedInDate) ? { ...d, checkedInDate: null } : d,
  );
});

// --- Export CSV des badges imprimes (KPI "Badges imprimes") ---
// Source = filteredDelegates pour coller au compteur affiche (respecte le
// filtre badge type global + les cross-clics du tab). Une ligne par badge
// effectivement delivre (deliveredAt non null).
const badgesCsvHeaders = [
  "delegateId", "badgeId", "badgeType", "deliveredAt", "deliveredBy",
  "givenName", "familyName", "email",
];
const badgesCsvRows = computed(() => {
  const rows = [];
  for (const d of filteredDelegates.value || []) {
    for (const b of d.badges || []) {
      if (!b.deliveredAt) continue;
      rows.push([
        d.id || "",
        b.id || "",
        b.type || "",
        parisDateTime(b.deliveredAt) || b.deliveredAt || "",
        b.deliveredBy || "",
        d.givenName || "",
        d.familyName || "",
        d.email || "",
      ]);
    }
  }
  return rows;
});

// --- Filtres ---
// `rawDev` = valeur brute du device ("Inconnu" inclus). On stocke le libelle
// LOCALISE comme tag de filtre (affichage FilterBanner + active-label) mais on
// compare sur la valeur brute cote donnees.
function onDeviceSelect(rawDev) {
  toggleFilter("device", typeLbl(rawDev), (d) =>
    (d.badges || []).some((b) => (b.deliveredBy || "Inconnu") === rawDev)
  );
}

function onBadgesDaySelect(index) {
  const day = badgesDaySource.value[index];
  if (!day) return;
  const isoDate = day.date;
  const displayLabel = badgesDayLabels.value[index];
  toggleFilter("badgeDay", displayLabel, (d) =>
    (d.badges || []).some(
      (b) => b.deliveredAt && parisDay(b.deliveredAt) === isoDate
    )
  );
}

// Restants sans badge = delegates VALIDATED sans checkedInDate
const confirmedWithoutBadge = computed(() => {
  const delegates = props.delegates || [];
  return delegates.filter(
    (d) => d.status?.toLowerCase() === "registered" && !d.checkedInDate
  ).length;
});

// Base = delegates au statut REGISTERED (ceux qui auront un badge)
const registeredCount = computed(() => {
  const delegates = props.delegates || [];
  return delegates.filter((d) => d.status?.toLowerCase() === "registered").length;
});

const checkinPct = computed(() => pct(fs.value?.global?.checkedInCount, registeredCount.value));

// --- Badges par jour ---
// Source non filtree pour ne pas masquer les jours non selectionnes pendant la multi-selection.
const badgesDaySource = computed(() => props.stats?.badges?.byDay || []);
const badgesDayLabels = computed(() => {
  const dates = badgesDaySource.value.map((d) => d.date);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
// Badges delivres par jour STACKED par type de badge (legende + tooltip par
// type + total par jour). Bucketage par parisDay(b.deliveredAt) sur chaque
// badge delivre (meme decompte que badges.byDay) -> la somme empilee d'un jour
// egale le total du jour. Source non filtree (props.delegates) pour garder tous
// les jours visibles pendant la multi-selection. Conserve le clic-pour-filtrer
// et l'estompage des jours non selectionnes.
const badgesDayChartData = computed(() => {
  const dates = badgesDaySource.value.map((d) => d.date);
  const labels = badgesDayLabels.value;
  const active = afm.value?.badgeDay;
  const isActive = (label) => {
    if (!active) return true;
    if (Array.isArray(active)) return active.includes(label);
    return label === active;
  };
  const byDayType = {}; // date -> { type: count }
  const typeTotals = {};
  for (const d of props.delegates || []) {
    for (const b of d.badges || []) {
      if (!b.deliveredAt) continue;
      const day = parisDay(b.deliveredAt);
      if (!day) continue;
      const type = b.type || "Inconnu";
      if (!byDayType[day]) byDayType[day] = {};
      byDayType[day][type] = (byDayType[day][type] || 0) + 1;
      typeTotals[type] = (typeTotals[type] || 0) + 1;
    }
  }
  const MAX_TYPES = 10;
  const sortedTypes = Object.keys(typeTotals).sort((a, b) => typeTotals[b] - typeTotals[a]);
  const top = sortedTypes.slice(0, MAX_TYPES);
  const rest = sortedTypes.slice(MAX_TYPES);
  const barThickness = Math.max(8, Math.min(32, 600 / (dates.length || 1)));
  const mkDataset = (type, getCount, baseColor) => ({
    label: typeLbl(type),
    data: dates.map((dt) => getCount(dt)),
    // Couleur par jour : estompee quand un autre jour est selectionne.
    backgroundColor: labels.map((l) => (active && !isActive(l) ? dimColor(baseColor, 0.18) : baseColor)),
    borderRadius: 3,
    barThickness,
    stack: "badges",
  });
  const datasets = top.map((type) =>
    mkDataset(type, (dt) => byDayType[dt]?.[type] || 0, type === "Inconnu" ? "#9CA3AF" : getTypeColor(type)),
  );
  if (rest.length > 0) {
    datasets.push(
      mkDataset("Autres", (dt) => rest.reduce((s, tp) => s + (byDayType[dt]?.[tp] || 0), 0), "#9CA3AF"),
    );
  }
  return { labels, datasets };
});

const badgesDayOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  onClick: (event, elements) => {
    if (elements.length > 0) onBadgesDaySelect(elements[0].index);
  },
  onHover: (event, elements) => {
    const canvas = event.native?.target;
    if (canvas) canvas.style.cursor = elements.length > 0 ? "pointer" : "default";
  },
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "bottom", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toLocaleString("fr-FR")}`,
        footer: (items) => {
          const i = items[0]?.dataIndex;
          if (i == null) return "";
          let total = 0;
          for (const ds of items[0].chart.data.datasets) total += ds.data[i] || 0;
          return total > 0 ? `${t("badges.tooltip.total")} : ${total.toLocaleString("fr-FR")}` : "";
        },
      },
    },
  },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 13 } } },
    y: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
}));

// --- Performance 15 min ---
const selectedDay = ref("all");
const availableDays = computed(() => {
  const days = [...new Set((fs.value?.badges?.per15min || []).map((s) => s.date))];
  return days.length > 1 ? ["all", ...days] : days;
});

const filtered15min = computed(() => {
  const data = fs.value?.badges?.per15min || [];
  if (selectedDay.value === "all") return data;
  return data.filter((s) => s.date === selectedDay.value);
});

const perf15Labels = computed(() => {
  const data = filtered15min.value;
  if (selectedDay.value !== "all") return data.map((s) => s.time);
  const labelFor = makeDateLabeler(data.map((s) => s.date));
  return data.map((s) => `${labelFor(s.date)} ${s.time}`);
});

const perf15ChartData = computed(() => ({
  labels: perf15Labels.value,
  datasets: [{
    label: t("badges.datasets.badgesPer15"),
    data: filtered15min.value.map((s) => s.count),
    backgroundColor: (ctx) => {
      const v = ctx.raw || 0;
      const max = maxPer15min.value || 1;
      const ratio = v / max;
      if (ratio > 0.8) return "#30DD92";
      if (ratio > 0.5) return "#FFA600";
      return "#1E4E66";
    },
    borderRadius: 3,
    categoryPercentage: 0.85,
    barPercentage: 0.75,
  }],
}));

const avgPer15min = computed(() => {
  const d = filtered15min.value;
  if (d.length === 0) return 0;
  return (d.reduce((s, x) => s + x.count, 0) / d.length).toFixed(1);
});

const maxPer15min = computed(() => {
  const d = filtered15min.value;
  return d.length > 0 ? Math.max(...d.map((x) => x.count)) : 0;
});

const perf15Options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => t("badges.tooltip.badgesRate", { n: ctx.raw, rate: ctx.raw * 4 }),
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
};

// --- Performance check-in 15 min ---
const selectedCheckinDay = ref("all");
const availableCheckinDays = computed(() => {
  const days = [...new Set((fs.value?.checkinFlow?.per15min || []).map((s) => s.date))];
  return days.length > 1 ? ["all", ...days] : days;
});

const filteredCheckin15min = computed(() => {
  const data = fs.value?.checkinFlow?.per15min || [];
  if (selectedCheckinDay.value === "all") return data;
  return data.filter((s) => s.date === selectedCheckinDay.value);
});

const perfCheckin15Labels = computed(() => {
  const data = filteredCheckin15min.value;
  if (selectedCheckinDay.value !== "all") return data.map((s) => s.time);
  const labelFor = makeDateLabeler(data.map((s) => s.date));
  return data.map((s) => `${labelFor(s.date)} ${s.time}`);
});

const perfCheckin15ChartData = computed(() => ({
  labels: perfCheckin15Labels.value,
  datasets: [{
    label: t("badges.datasets.checkinPer15"),
    data: filteredCheckin15min.value.map((s) => s.count),
    backgroundColor: (ctx) => {
      const v = ctx.raw || 0;
      const max = maxCheckinPer15min.value || 1;
      const ratio = v / max;
      if (ratio > 0.8) return "#30DD92";
      if (ratio > 0.5) return "#FFA600";
      return "#1E4E66";
    },
    borderRadius: 3,
    categoryPercentage: 0.85,
    barPercentage: 0.75,
  }],
}));

const avgCheckinPer15min = computed(() => {
  const d = filteredCheckin15min.value;
  if (d.length === 0) return 0;
  return (d.reduce((s, x) => s + x.count, 0) / d.length).toFixed(1);
});

const maxCheckinPer15min = computed(() => {
  const d = filteredCheckin15min.value;
  return d.length > 0 ? Math.max(...d.map((x) => x.count)) : 0;
});

const perfCheckin15Options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => t("badges.tooltip.checkinRate", { n: ctx.raw, rate: ctx.raw * 4 }),
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
};

// --- Badges par device, stacke par type de badge ---
// Source = pageFilteredDelegates (page-level badge type), PAS filteredDelegates :
// sinon cliquer sur un device retire les autres du chart (filteredDelegates ne
// contient que les delegues ayant un badge du device selectionne), rendant la
// multi-selection impossible. Meme pattern que badgesDaySource ci-dessus.
// La dim visuelle (isDim) suffit a signaler la selection en cours.
const deviceByType = computed(() => {
  const sel = selectedBadgeTypes.value;
  const map = {};
  for (const d of pageFilteredDelegates.value) {
    for (const b of d.badges || []) {
      if (!b.deliveredAt) continue;
      const type = b.type || "Inconnu";
      if (sel.size > 0 && !sel.has(type)) continue;
      const device = b.deliveredBy || "Inconnu";
      if (!map[device]) map[device] = {};
      map[device][type] = (map[device][type] || 0) + 1;
    }
  }
  return map;
});

// Devices tries par total descendant
const deviceLabels = computed(() => {
  const totals = Object.entries(deviceByType.value).map(([dev, byType]) => [
    dev,
    Object.values(byType).reduce((s, n) => s + n, 0),
  ]);
  return totals.sort((a, b) => b[1] - a[1]).map(([dev]) => dev);
});

const badgeTypeList = computed(() => {
  const set = new Set();
  for (const byType of Object.values(deviceByType.value)) {
    for (const t of Object.keys(byType)) set.add(t);
  }
  // Tri par volume global descendant
  const totals = new Map();
  for (const t of set) {
    let sum = 0;
    for (const byType of Object.values(deviceByType.value)) sum += byType[t] || 0;
    totals.set(t, sum);
  }
  return [...set].sort((a, b) => totals.get(b) - totals.get(a));
});

const deviceChartHeight = computed(() => Math.max(220, deviceLabels.value.length * 56 + 80));

function dimColor(hex, alpha) {
  if (!hex || hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const deviceChartData = computed(() => {
  const labels = deviceLabels.value; // valeurs brutes (cles data + couleur)
  const types = badgeTypeList.value;
  const active = afm.value?.device; // tag de filtre = libelle LOCALISE
  // dev est brut ; on compare son libelle localise au tag actif.
  const isDim = (dev) => {
    if (!active) return false;
    const dl = typeLbl(dev);
    if (Array.isArray(active)) return !active.includes(dl);
    return dl !== active;
  };
  return {
    labels: labels.map(typeLbl),
    datasets: types.map((type) => {
      const baseColor = type === "Inconnu" ? "#9CA3AF" : getTypeColor(type);
      return {
        label: typeLbl(type),
        data: labels.map((dev) => deviceByType.value[dev]?.[type] || 0),
        backgroundColor: labels.map((dev) => (isDim(dev) ? dimColor(baseColor, 0.2) : baseColor)),
        borderWidth: 0,
        categoryPercentage: 0.7,
        barPercentage: 0.85,
      };
    }),
  };
});

// Plugin Chart.js custom : dessine le total de chaque ligne (somme de tous
// les segments) en bout de barre. On contourne chartjs-plugin-datalabels
// dont l'override de display reste capricieux quand le default global est
// false. On dessine apres les datasets pour passer au-dessus des barres.
const deviceRowTotalsPlugin = {
  id: "deviceRowTotals",
  afterDatasetsDraw(chart) {
    const { ctx, data, scales, chartArea } = chart;
    const xScale = scales.x;
    const yScale = scales.y;
    if (!xScale || !yScale || data.labels.length === 0) return;

    ctx.save();
    ctx.fillStyle = "#414141";
    ctx.font = "700 12px Comfortaa, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let dataIndex = 0; dataIndex < data.labels.length; dataIndex++) {
      let sum = 0;
      for (const ds of data.datasets) sum += ds.data[dataIndex] || 0;
      if (sum <= 0) continue;
      const x = Math.min(xScale.getPixelForValue(sum) + 6, chartArea.right + 50);
      const y = yScale.getPixelForValue(dataIndex);
      ctx.fillText(sum.toLocaleString("fr-FR"), x, y);
    }
    ctx.restore();
  },
};

const deviceChartOptions = computed(() => ({
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  onClick: (event, elements) => {
    if (elements.length > 0) {
      const dev = deviceLabels.value[elements[0].index];
      if (dev) onDeviceSelect(dev);
    }
  },
  onHover: (event, elements) => {
    const canvas = event.native?.target;
    if (canvas) canvas.style.cursor = elements.length > 0 ? "pointer" : "default";
  },
  plugins: {
    legend: {
      position: "bottom",
      labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rect", padding: 10, boxWidth: 12 },
    },
    // Pas de datalabels ici : un plugin custom (deviceRowTotalsPlugin) dessine
    // le total en bout de barre directement sur le canvas. Plus fiable que
    // l'override scriptable de chartjs-plugin-datalabels quand le default
    // global est `display: false` (cf. main.js).
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label} : ${ctx.raw}`,
      },
    },
  },
  // Marge a droite pour laisser de la place au total en bout de barre.
  layout: { padding: { right: 56, top: 4, bottom: 4 } },
  scales: {
    x: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
    y: { stacked: true, grid: { display: false }, ticks: { font: { size: 13 } } },
  },
}));

// --- Performance max / device / min ---
// Si des devices sont selectionnes en bas (filtre actif), on divise par leur nombre.
// Sinon, on prend le nombre total de devices ayant delivre au moins 1 badge.
const deviceCountForPerf = computed(() => {
  const active = afm.value?.device;
  if (active) return Array.isArray(active) ? active.length : 1;
  return deviceLabels.value.length || 0;
});

const perfPerDeviceMin = computed(() => {
  const peak = fs.value?.badges?.peakMinute?.count || 0;
  const devices = deviceCountForPerf.value;
  if (!devices || !peak) return "—";
  return t("badges.kpi.perMin", { n: (peak / devices).toFixed(1) });
});

const perfPerDeviceSub = computed(() => {
  const peak = fs.value?.badges?.peakMinute?.count || 0;
  const devices = deviceCountForPerf.value;
  const plural = devices > 1 ? "s" : "";
  const filtered = afm.value?.device ? t("badges.perfDeviceSelected", { plural }) : "";
  return t("badges.perfDeviceSub", { peak, devices, plural, filtered });
});

// --- Flux de check-in par jour et heure ---
const checkinDays = computed(() => {
  const obj = fs.value?.checkinFlow?.byDayAndHour || {};
  return Object.keys(obj).sort();
});
const allCheckinHours = computed(() => {
  const obj = fs.value?.checkinFlow?.byDayAndHour || {};
  const hours = new Set();
  for (const dayData of Object.values(obj)) {
    for (const h of Object.keys(dayData)) hours.add(h);
  }
  return [...hours].sort();
});
const hourlyLabels = computed(() => allCheckinHours.value);
const dayColors = ["#1E4E66", "#30DD92", "#6F45FF", "#FFA600", "#FF6B6B", "#00BCD4", "#9C27B0"];
const hourlyDatasets = computed(() => {
  const obj = fs.value?.checkinFlow?.byDayAndHour || {};
  const hours = allCheckinHours.value;
  const labelFor = makeDateLabeler(checkinDays.value);
  return checkinDays.value.map((day, i) => ({
    label: labelFor(day),
    data: hours.map((h) => obj[day]?.[h] || 0),
    borderColor: dayColors[i % dayColors.length],
    backgroundColor: dayColors[i % dayColors.length] + "33",
    fill: false,
    tension: 0.3,
    pointRadius: 3,
    borderWidth: 2,
  }));
});

// --- Flux de Badges imprimés par jour et heure (miroir du check-in) ---
const badgeDays = computed(() => {
  const obj = fs.value?.badges?.byDayAndHour || {};
  return Object.keys(obj).sort();
});
const allBadgeHours = computed(() => {
  const obj = fs.value?.badges?.byDayAndHour || {};
  const hours = new Set();
  for (const dayData of Object.values(obj)) {
    for (const h of Object.keys(dayData)) hours.add(h);
  }
  return [...hours].sort();
});
const badgeHourlyLabels = computed(() => allBadgeHours.value);
const badgeHourlyDatasets = computed(() => {
  const obj = fs.value?.badges?.byDayAndHour || {};
  const hours = allBadgeHours.value;
  const labelFor = makeDateLabeler(badgeDays.value);
  return badgeDays.value.map((day, i) => ({
    label: labelFor(day),
    data: hours.map((h) => obj[day]?.[h] || 0),
    borderColor: dayColors[i % dayColors.length],
    backgroundColor: dayColors[i % dayColors.length] + "33",
    fill: false,
    tension: 0.3,
    pointRadius: 3,
    borderWidth: 2,
  }));
});

// --- Burndown check-in (restants vs attendus, tranches 15 min) ---
const burndown = computed(() =>
  buildBurndownAbsolute(fs.value?.checkinFlow?.per15min, registeredCount.value, 30)
);

// Progression du check-in par type de badge (bar horizontale stacked).
// Helper partage avec ComparisonTab.
const checkinByType = computed(() => buildCheckinByType(checkinScopedDelegates.value));

// --- Mix des types d'inscriptions (presents confirmes) ---
// Meme regle que sur le comparatif : status === "registered" ET checkedInDate
// renseignee. Un delegate avec plusieurs registrations compte dans chaque type.
const MIX_MAX_TYPES = 8;
const MIX_OTHER_COLOR = "#9CA3AF";

const typesMixData = computed(() => {
  const counts = new Map();
  let total = 0;
  const inRange = makeInRange(props.dateRange);
  for (const d of props.delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!d.checkedInDate || !inRange(d.checkedInDate)) continue;
    for (const r of d.registrations || []) {
      const type = r.type || "Non renseigne";
      counts.set(type, (counts.get(type) || 0) + 1);
      total++;
    }
  }
  return { counts, total };
});

const typesMixCounts = computed(() => {
  const sorted = [...typesMixData.value.counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MIX_MAX_TYPES);
  const otherCount = sorted.slice(MIX_MAX_TYPES).reduce((s, [, v]) => s + v, 0);
  const out = Object.fromEntries(top);
  if (otherCount > 0) out["Autres"] = otherCount;
  return out;
});

const typesMixChart = computed(() => {
  const { counts, total } = typesMixData.value;
  if (total === 0) return { labels: [], datasets: [] };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MIX_MAX_TYPES);
  const otherEntries = sorted.slice(MIX_MAX_TYPES);
  const otherCount = otherEntries.reduce((s, [, v]) => s + v, 0);
  const segments = otherCount > 0 ? [...top, ["Autres", otherCount]] : top;

  return {
    labels: [t("badges.attendeesAxis")],
    datasets: segments.map(([type, count]) => ({
      label: typeLbl(type),
      data: [+((count / total) * 100).toFixed(1)],
      _count: count,
      backgroundColor: type === "Autres" ? MIX_OTHER_COLOR : getTypeColor(type),
      borderWidth: 0,
      barThickness: 36,
    })),
  };
});

const typesMixHeight = computed(() => {
  const legendH = Math.ceil(typesMixChart.value.datasets.length / 4) * 22 + 24;
  return 80 + legendH;
});

const typesMixOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y",
  plugins: {
    legend: {
      position: "bottom",
      labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rect", padding: 10, boxWidth: 12 },
    },
    datalabels: {
      display: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 6,
      color: "#fff",
      font: { weight: 600, size: 12 },
      formatter: (v) => v + "%",
    },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const count = ctx.dataset._count ?? 0;
          return `${ctx.dataset.label} : ${ctx.raw}% (${count.toLocaleString("fr-FR")})`;
        },
      },
    },
  },
  scales: {
    x: { stacked: true, max: 100, ticks: { callback: (v) => v + "%", font: { size: 12 } }, grid: { color: "#f3f4f6" } },
    y: { stacked: true, grid: { display: false }, ticks: { font: { size: 13 } } },
  },
};
const burndownDatasets = computed(() => [
  {
    label: t("badges.datasets.remainingCheckin"),
    data: burndown.value.data,
    borderColor: "#1E4E66",
    backgroundColor: "rgba(30,78,102,0.10)",
    fill: true,
    tension: 0.2,
    pointRadius: 0,
    borderWidth: 2,
    stepped: false,
  },
]);

// --- Check-in par jour ---
const checkinByDay = computed(() => {
  const obj = fs.value?.checkinFlow?.byDay || {};
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
});
const checkinDayLabels = computed(() => {
  const dates = checkinByDay.value.map(([d]) => d);
  const labelFor = makeDateLabeler(dates);
  return dates.map(labelFor);
});
// Check-in par jour STACKED par type de badge (legende + tooltip par type).
// Meme population et meme bucketage (parisDay sur checkedInDate) que
// checkinByDay -> la somme empilee d'un jour egale le total du jour. Top 10
// types + "Autres", couleur deterministe partagee avec le reste de l'onglet.
const checkinDayChartData = computed(() => {
  const dates = checkinByDay.value.map(([d]) => d);
  const byDayType = {}; // date -> { type: count }
  const typeTotals = {};
  for (const d of checkinScopedDelegates.value || []) {
    if (!d.checkedInDate) continue;
    const day = parisDay(d.checkedInDate);
    if (!day) continue;
    const type = delegateBadgeType(d);
    if (!byDayType[day]) byDayType[day] = {};
    byDayType[day][type] = (byDayType[day][type] || 0) + 1;
    typeTotals[type] = (typeTotals[type] || 0) + 1;
  }
  const MAX_TYPES = 10;
  const sortedTypes = Object.keys(typeTotals).sort((a, b) => typeTotals[b] - typeTotals[a]);
  const top = sortedTypes.slice(0, MAX_TYPES);
  const rest = sortedTypes.slice(MAX_TYPES);
  const barThickness = Math.max(8, Math.min(32, 600 / (dates.length || 1)));
  const datasets = top.map((type) => ({
    label: typeLbl(type),
    data: dates.map((dt) => byDayType[dt]?.[type] || 0),
    backgroundColor: type === "Inconnu" ? "#9CA3AF" : getTypeColor(type),
    borderRadius: 3,
    barThickness,
    stack: "checkin",
  }));
  if (rest.length > 0) {
    datasets.push({
      label: typeLbl("Autres"),
      data: dates.map((dt) => rest.reduce((s, tp) => s + (byDayType[dt]?.[tp] || 0), 0)),
      backgroundColor: "#9CA3AF",
      borderRadius: 3,
      barThickness,
      stack: "checkin",
    });
  }
  return { labels: checkinDayLabels.value, datasets };
});

// Options dediees : stacked + legende visible + total au-dessus de chaque pile.
const checkinDayByTypeOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { position: "bottom", labels: { font: { size: 13 }, usePointStyle: true, pointStyle: "rectRounded" } },
    datalabels: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label} : ${ctx.raw.toLocaleString("fr-FR")}`,
        footer: (items) => {
          const i = items[0]?.dataIndex;
          if (i == null) return "";
          let total = 0;
          for (const ds of items[0].chart.data.datasets) total += ds.data[i] || 0;
          return total > 0 ? `${t("badges.tooltip.total")} : ${total.toLocaleString("fr-FR")}` : "";
        },
      },
    },
  },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { font: { size: 13 } } },
    y: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 13 } }, beginAtZero: true },
  },
};

// Plugin : total de check-in au-dessus de chaque pile (la legende cachant les
// datalabels par segment, on garde un repere de volume par jour).
const checkinDayTotalsPlugin = {
  id: "checkinDayTotals",
  afterDatasetsDraw(chart) {
    const { ctx, data, scales } = chart;
    if (!scales.x || !scales.y || !data.labels.length) return;
    ctx.save();
    ctx.font = "600 11px Poppins, sans-serif";
    ctx.fillStyle = "#414141";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (let i = 0; i < data.labels.length; i++) {
      let total = 0;
      for (const ds of data.datasets) total += ds.data[i] || 0;
      if (total <= 0) continue;
      const x = scales.x.getPixelForValue(i);
      const y = scales.y.getPixelForValue(total) - 4;
      ctx.fillText(String(total), x, y);
    }
    ctx.restore();
  },
};

</script>

<style scoped>
/* Label de KPI avec une action (bouton CSV) alignee a droite. */
.kpi-label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.perf-summary {
  display: flex; gap: 24px; margin-top: 12px; padding: 10px 16px;
  background: #f9fafb; border-radius: 8px; font-size: 15px; color: #414141;
}
.period-selector { display: flex; gap: 4px; flex-wrap: wrap; }
.period-btn {
  padding: 4px 10px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 13px; cursor: pointer; color: #646464;
}
.period-btn.active { background: #1E4E66; color: #fff; border-color: #1E4E66; }
.progress-bar-container {
  background: #e5e7eb; border-radius: 8px; height: 24px; overflow: hidden;
}
.progress-bar-fill-checkin {
  background: linear-gradient(90deg, #30DD92, #22c55e);
  height: 100%; border-radius: 8px; transition: width .5s ease;
  min-width: 2px;
}
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 15px; }
.chart-hint { text-align: right; color: #9ca3af; font-size: 13px; margin: 6px 4px 0; font-style: italic; }

</style>
