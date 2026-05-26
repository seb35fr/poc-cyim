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
        <div class="kpi-label">Check-in effectués</div>
        <div class="kpi-value">{{ fmt(fs.global.checkedInCount) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.checkedInCount, registeredCount) }} des présents</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Badges imprimés</div>
        <div class="kpi-value">{{ fmt(fs.global.totalBadgesDelivered) }}</div>
        <div class="kpi-sub">{{ pct(fs.global.totalBadgesDelivered, registeredCount) }} des attendus</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Pic Check-in (15 min)</div>
        <div class="kpi-value">{{ fs.checkinFlow.peakSlot.count > 0 ? fs.checkinFlow.peakSlot.count + ' / 15min' : '—' }}</div>
        <div class="kpi-sub" v-if="fs.checkinFlow.peakSlot.count > 0">
          le {{ fs.checkinFlow.peakSlot.date }} à {{ fs.checkinFlow.peakSlot.time }} (~{{ fs.checkinFlow.peakSlot.count * 4 }}/h)
        </div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Pic Impressions (15 min)</div>
        <div class="kpi-value">{{ fs.badges.peakSlot.count > 0 ? fs.badges.peakSlot.count + ' / 15min' : '—' }}</div>
        <div class="kpi-sub" v-if="fs.badges.peakSlot.count > 0">
          le {{ fs.badges.peakSlot.date }} à {{ fs.badges.peakSlot.time }} (~{{ fs.badges.peakSlot.count * 4 }}/h)
        </div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Perf max / device / min</div>
        <div class="kpi-value">{{ perfPerDeviceMin }}</div>
        <div class="kpi-sub" v-if="fs.badges.peakMinute?.count > 0">
          {{ perfPerDeviceSub }}
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Restants sans badge (validés)</div>
        <div class="kpi-value">{{ fmt(confirmedWithoutBadge) }}</div>
      </div>
    </div>

    <!-- Filtre global par type de badge (multi-select) : impacte tous les
         graphiques + KPI de la page. Aucun selectionne = pas de filtre. -->
    <div v-if="availableBadgeTypes.length > 0" class="badge-type-filter">
      <span class="badge-type-filter-label">Filtrer la page par type de badge :</span>
      <div class="period-selector">
        <button
          :class="['period-btn', { active: selectedBadgeTypes.size === 0 }]"
          @click="clearBadgeTypes"
        >Tous</button>
        <button v-for="t in availableBadgeTypes" :key="t"
          :class="['period-btn', { active: selectedBadgeTypes.has(t) }]"
          @click="toggleBadgeType(t)"
        >{{ t }}</button>
      </div>
    </div>

    <!-- Progression du check-in (gauche) / Progression par type (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <h3>Progression du check-in</h3>
        <div class="progress-bar-container">
          <div class="progress-bar-fill-checkin" :style="{ width: checkinPct }"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
          <span>{{ fmt(fs.global.checkedInCount) }} checked-in ({{ checkinPct }})</span>
          <span>{{ fmt(registeredCount) }} attendus (registered)</span>
        </div>

        <div v-if="burndown.labels.length > 0" style="margin-top: 16px;">
          <div class="chart-header" style="margin-bottom: 6px;">
            <h4 style="margin: 0; font-size: 13px; color: var(--text-secondary); font-weight: 600;">
              Restants à check-in (créneaux de 30 min)
            </h4>
            <CsvButton filename="burndown-checkin"
              :headers="['Horodatage', 'Restants']"
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
          <h3>Progression du check-in par type</h3>
          <span class="chart-hint" style="margin: 0;">Couleur pleine = check-in · estompée = restants · couleur = type</span>
        </div>
        <div v-if="checkinByType.labels.length > 0"
          :style="{ position: 'relative', height: checkinByType.height + 'px' }">
          <Bar :data="checkinByType.chartData" :options="checkinByTypeOptions" :plugins="[checkinByTypeTotalsPlugin]" />
        </div>
        <p v-else class="empty-msg">Aucun délégué registered</p>
      </div>
    </div>

    <!-- Badges imprimés par device (stacked par type de badge) -->
    <div class="chart-card">
      <div class="chart-header">
        <h3>Badges imprimés par device</h3>
        <CsvButton filename="badges-par-device"
          :headers="['Device', ...badgeTypeList]"
          :rows="deviceLabels.map(dev => [dev, ...badgeTypeList.map(t => deviceByType[dev]?.[t] || 0)])" />
      </div>
      <template v-if="deviceLabels.length > 0">
        <div :style="{ position: 'relative', height: deviceChartHeight + 'px' }">
          <Bar :data="deviceChartData" :options="deviceChartOptions" :plugins="[deviceRowTotalsPlugin]" />
        </div>
      </template>
      <p v-else class="empty-msg">Aucune donnée de device</p>
    </div>

    <!-- Mix des types d'inscriptions (presents confirmes) -->
    <div class="chart-card" v-if="typesMixChart.datasets.length > 0">
      <div class="chart-header">
        <h3>Mix des types d'inscriptions (présents confirmés)</h3>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="chart-hint" style="margin: 0;">
            Population : <code>status = registered</code> ET <code>checkedInDate</code> renseignée
          </span>
          <CsvButton filename="mix-types-presents"
            :headers="['Type', '%', 'Nb']"
            :rows="typesMixChart.datasets.map(ds => [ds.label, ds.data[0], typesMixCounts[ds.label] || 0])" />
        </div>
      </div>
      <div :style="{ position: 'relative', height: typesMixHeight + 'px' }">
        <Bar :data="typesMixChart" :options="typesMixOptions" />
      </div>
    </div>

    <!-- 15-min charts side-by-side : Check-in (gauche) / Distribution (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Performance de check-in (creneaux de 15 min)</h3>
          <div style="display: flex; align-items: center; gap: 6px;">
            <CsvButton filename="perf-checkin-15min" :headers="['Date', 'Heure', 'Check-in']" :rows="filteredCheckin15min.map(s => [s.date, s.time, s.count])" />
            <div v-if="availableCheckinDays.length > 1" class="period-selector">
              <button v-for="day in availableCheckinDays" :key="day"
                :class="['period-btn', { active: selectedCheckinDay === day }]"
                @click="selectedCheckinDay = day">
                {{ day === 'all' ? 'Tous' : day.slice(5) }}
              </button>
            </div>
          </div>
        </div>
        <template v-if="perfCheckin15Labels.length > 0">
          <div :style="{ position: 'relative', height: '280px' }">
            <Bar :data="perfCheckin15ChartData" :options="perfCheckin15Options" />
          </div>
          <div class="perf-summary">
            <span><strong>Moyenne :</strong> {{ avgCheckinPer15min }} check-in / 15 min</span>
            <span><strong>Max :</strong> {{ maxCheckinPer15min }} check-in / 15 min</span>
            <span><strong>Équivalent horaire max :</strong> {{ maxCheckinPer15min * 4 }} check-in/h</span>
          </div>
        </template>
        <p v-else class="empty-msg">Aucune donnée de check-in</p>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>Performance de distribution (creneaux de 15 min)</h3>
          <div style="display: flex; align-items: center; gap: 6px;">
            <CsvButton filename="perf-15min" :headers="['Date', 'Heure', 'Badges']" :rows="filtered15min.map(s => [s.date, s.time, s.count])" />
            <div v-if="availableDays.length > 1" class="period-selector">
              <button v-for="day in availableDays" :key="day"
                :class="['period-btn', { active: selectedDay === day }]"
                @click="selectedDay = day">
                {{ day === 'all' ? 'Tous' : day.slice(5) }}
              </button>
            </div>
          </div>
        </div>
        <template v-if="perf15Labels.length > 0">
          <div :style="{ position: 'relative', height: '280px' }">
            <Bar :data="perf15ChartData" :options="perf15Options" />
          </div>
          <div class="perf-summary">
            <span><strong>Moyenne :</strong> {{ avgPer15min }} badges / 15 min</span>
            <span><strong>Max :</strong> {{ maxPer15min }} badges / 15 min</span>
            <span><strong>Équivalent horaire max :</strong> {{ maxPer15min * 4 }} badges/h</span>
          </div>
        </template>
        <p v-else class="empty-msg">Aucune donnée de distribution</p>
      </div>
    </div>

    <!-- Day charts side-by-side : Check-in (gauche) / Badges (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Check-in par jour</h3>
          <CsvButton filename="checkin-par-jour" :headers="['Date', 'Check-in']" :rows="checkinByDay.map(([d, c]) => [d, c])" />
        </div>
        <template v-if="checkinDayLabels.length > 0">
          <div :style="{ position: 'relative', height: '260px' }">
            <Bar :data="checkinDayChartData" :options="barOptions" />
          </div>
        </template>
        <p v-else class="empty-msg">Aucun check-in enregistré</p>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>Badges délivrés par jour</h3>
          <CsvButton filename="badges-par-jour" :headers="['Date', 'Badges']" :rows="(stats.badges.byDay || []).map(d => [d.date, d.count])" />
        </div>
        <template v-if="badgesDayLabels.length > 0">
          <div :style="{ position: 'relative', height: '260px' }">
            <Bar :data="badgesDayChartData" :options="badgesDayOptions" />
          </div>
          <p class="chart-hint">Cliquez sur un ou plusieurs jours pour filtrer la page.</p>
        </template>
        <p v-else class="empty-msg">Aucun badge délivré</p>
      </div>
    </div>

    <!-- Repartition geographique : monde + France -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Répartition géographique (monde)</h3>
          <CsvButton filename="repartition-monde"
            :headers="['Code pays', 'Inscrits']"
            :rows="geoCountries.map(c => [c.value, c.totalCount])" />
        </div>
        <ChoroplethMap :countries="geoCountries" :height="380" :key="`world-${badgeFilterKey}`" />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>Répartition par région française</h3>
          <CsvButton filename="repartition-regions-fr"
            :headers="['Code région', 'Région', 'Inscrits']"
            :rows="frRegions.map(r => [r.code, REGION_NAMES[r.code] || r.code, r.count])" />
        </div>
        <FrenchRegionMap
          :regions="frRegionsMetro"
          :region-codes="METRO_REGION_CODES_ARR"
          :global-max="frGlobalMax"
          :height="380"
          :key="`fr-metro-${badgeFilterKey}`"
        />
        <div v-if="frRegionsOverseas.length > 0" class="dom-row">
          <div class="dom-row-label">Outre-mer</div>
          <div class="dom-row-maps">
            <div v-for="r in frRegionsOverseas" :key="r.code" class="dom-card">
              <FrenchRegionMap
                :regions="[r]"
                :region-codes="[r.code]"
                :global-max="frGlobalMax"
                :height="110"
                :show-legend="false"
                :key="`fr-dom-${r.code}-${badgeFilterKey}`"
              />
              <div class="dom-card-caption">
                <span>{{ REGION_NAMES[r.code] || r.code }}</span>
                <strong>{{ r.count.toLocaleString("fr-FR") }}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Flux par jour et heure : check-in (gauche) / badges (droite) -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Flux de check-in par jour et heure</h3>
          <CsvButton filename="checkin-par-heure" :headers="['Heure', ...checkinDays.map(d => d.slice(5))]" :rows="allCheckinHours.map(h => [h, ...checkinDays.map(day => (fs.checkinFlow?.byDayAndHour?.[day]?.[h] || 0))])" />
        </div>
        <LineChart
          v-if="hourlyLabels.length > 0"
          :labels="hourlyLabels"
          :datasets="hourlyDatasets"
          :height="220"
        />
        <p v-else class="empty-msg">Aucun check-in enregistré</p>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h3>Flux de Badges imprimés par jour et heure</h3>
          <CsvButton filename="badges-par-heure" :headers="['Heure', ...badgeDays.map(d => d.slice(5))]" :rows="allBadgeHours.map(h => [h, ...badgeDays.map(day => (fs.badges?.byDayAndHour?.[day]?.[h] || 0))])" />
        </div>
        <LineChart
          v-if="badgeHourlyLabels.length > 0"
          :labels="badgeHourlyLabels"
          :datasets="badgeHourlyDatasets"
          :height="220"
        />
        <p v-else class="empty-msg">Aucun badge délivré</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { Bar } from "vue-chartjs";
import HBarChart from "../charts/HBarChart.vue";
import LineChart from "../charts/LineChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { makeDateLabeler } from "../../utils/formatDateLabel.js";
import { parisDay } from "../../utils/parisTime.js";
import { buildBurndownAbsolute } from "../../utils/burndown.js";
import { getTypeColor } from "../../utils/typeColors.js";
import { zipToRegion, REGION_NAMES } from "../../utils/frenchRegions.js";
import { fmt, pct } from "@/utils/formatters.js";
import {
  delegateBadgeType,
  buildCheckinByType,
  checkinByTypeOptions,
  checkinByTypeTotalsPlugin,
} from "../../utils/checkinByType.js";
import ChoroplethMap from "../charts/ChoroplethMap.vue";
import FrenchRegionMap from "../charts/FrenchRegionMap.vue";

const props = defineProps({ stats: Object, delegates: Array });

// --- Filtre global de page par type de badge (multi-select) ---
// Set vide = pas de filtre. Sinon on garde les delegues ayant au moins un
// badge delivre dans l'ensemble selectionne (OR entre les types). Le filtre
// s'applique EN AMONT de useFilteredStats, donc KPI, stats, graphiques et
// exports CSV en heritent tous automatiquement.
const selectedBadgeTypes = ref(new Set());

function toggleBadgeType(type) {
  const next = new Set(selectedBadgeTypes.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  selectedBadgeTypes.value = next;
}
function clearBadgeTypes() {
  selectedBadgeTypes.value = new Set();
}

// Types disponibles dans le filtre : on prend le type "attendu" du delegate
// (1er badge en base sinon 1ere registration). Inclut donc aussi les delegues
// registered pas encore checkes — necessaire pour que Progression par type
// preserve ses "restants" et que Badges par device reflete le scope.
const availableBadgeTypes = computed(() => {
  const set = new Set();
  for (const d of props.delegates || []) set.add(delegateBadgeType(d));
  set.delete("Inconnu");
  return [...set].sort();
});

const pageFilteredDelegates = computed(() => {
  const sel = selectedBadgeTypes.value;
  if (sel.size === 0) return props.delegates || [];
  return (props.delegates || []).filter((d) => sel.has(delegateBadgeType(d)));
});

// Cle stable pour invalider les Choropleth quand la selection change.
const badgeFilterKey = computed(() => {
  return [...selectedBadgeTypes.value].sort().join("|") || "all";
});

const {
  filteredDelegates, filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => pageFilteredDelegates.value);

// --- Filtres ---
function onDeviceSelect(label) {
  toggleFilter("device", label, (d) =>
    (d.badges || []).some((b) => (b.deliveredBy || "Inconnu") === label)
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
const badgesDayChartData = computed(() => {
  const labels = badgesDayLabels.value;
  const active = afm.value?.badgeDay;
  const isActive = (label) => {
    if (!active) return true;
    if (Array.isArray(active)) return active.includes(label);
    return label === active;
  };
  return {
    labels,
    datasets: [{
      label: "Badges délivrés",
      data: badgesDaySource.value.map((d) => d.count),
      backgroundColor: labels.map((l) =>
        active && !isActive(l) ? "rgba(30,78,102,0.25)" : "#1E4E66"
      ),
      borderRadius: 4,
      barThickness: Math.max(8, Math.min(32, 600 / (labels.length || 1))),
    }],
  };
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
    legend: { display: false },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      offset: 2,
      clip: false,
      color: "#414141",
      font: { weight: 600, size: 11 },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
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
    label: "Badges / 15 min",
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
        label: (ctx) => `${ctx.raw} badges (≈ ${ctx.raw * 4}/h)`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
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
    label: "Check-in / 15 min",
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
        label: (ctx) => `${ctx.raw} check-in (≈ ${ctx.raw * 4}/h)`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 24 } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};

// --- Repartition geographique (monde + France) ---
// Les delegates filtres incluent deja le filtre global de page (selectedBadgeType)
// + les cross-filtres en cours sur la page (device, jour, etc.).
const geoCountries = computed(() => {
  const map = {};
  for (const d of filteredDelegates.value) {
    const code = d.primaryAddress?.countryCode || d.primaryAddress?.country?.code;
    if (!code) continue;
    map[code] = (map[code] || 0) + 1;
  }
  return Object.entries(map)
    .map(([value, totalCount]) => ({ value, totalCount }))
    .sort((a, b) => b.totalCount - a.totalCount);
});

const frRegions = computed(() => {
  const counts = new Map();
  for (const d of filteredDelegates.value) {
    const addr = d.primaryAddress;
    if (!addr) continue;
    const country = addr.countryCode || addr.country?.code;
    if (country && country !== "FR") continue;
    const region = zipToRegion(addr.zipCode);
    if (!region) continue;
    counts.set(region, (counts.get(region) || 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
});

// Codes regions metropolitaines (13 regions) — utilise pour separer DOM dans l'affichage.
const METRO_REGION_CODES_ARR = ["11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93", "94"];
const METRO_REGION_CODES = new Set(METRO_REGION_CODES_ARR);
const frRegionsMetro = computed(() => frRegions.value.filter((r) => METRO_REGION_CODES.has(r.code)));
const frRegionsOverseas = computed(() => frRegions.value.filter((r) => !METRO_REGION_CODES.has(r.code)));
// Max global toutes regions confondues pour partager l'echelle de couleurs
// entre la carte metropole et les mini-cartes DOM (sinon un DOM serait toujours
// au max localement et le visiteur ne saurait pas comparer).
const frGlobalMax = computed(() => Math.max(1, ...frRegions.value.map((r) => r.count)));

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
  const labels = deviceLabels.value;
  const types = badgeTypeList.value;
  const active = afm.value?.device;
  const isDim = (dev) => {
    if (!active) return false;
    if (Array.isArray(active)) return !active.includes(dev);
    return dev !== active;
  };
  return {
    labels,
    datasets: types.map((type) => {
      const baseColor = type === "Inconnu" ? "#9CA3AF" : getTypeColor(type);
      return {
        label: type,
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
      labels: { font: { size: 11 }, usePointStyle: true, pointStyle: "rect", padding: 10, boxWidth: 12 },
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
    x: { stacked: true, grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
    y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
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
  return (peak / devices).toFixed(1) + "/min";
});

const perfPerDeviceSub = computed(() => {
  const peak = fs.value?.badges?.peakMinute?.count || 0;
  const devices = deviceCountForPerf.value;
  const plural = devices > 1 ? "s" : "";
  const filtered = afm.value?.device ? ` (sélectionné${plural})` : "";
  return `pic ${peak}/min ÷ ${devices} device${plural}${filtered}`;
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
const checkinByType = computed(() => buildCheckinByType(filteredDelegates.value));

// --- Mix des types d'inscriptions (presents confirmes) ---
// Meme regle que sur le comparatif : status === "registered" ET checkedInDate
// renseignee. Un delegate avec plusieurs registrations compte dans chaque type.
const MIX_MAX_TYPES = 8;
const MIX_OTHER_COLOR = "#9CA3AF";

const typesMixData = computed(() => {
  const counts = new Map();
  let total = 0;
  for (const d of props.delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!d.checkedInDate) continue;
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
    labels: ["Présents"],
    datasets: segments.map(([type, count]) => ({
      label: type,
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
          const count = ctx.dataset._count ?? 0;
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
const burndownDatasets = computed(() => [
  {
    label: "Restants à check-in",
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
const checkinDayChartData = computed(() => ({
  labels: checkinDayLabels.value,
  datasets: [{
    label: "Check-in",
    data: checkinByDay.value.map(([, c]) => c),
    backgroundColor: "#30DD92",
    borderRadius: 4,
    barThickness: Math.max(8, Math.min(32, 600 / (checkinDayLabels.value.length || 1))),
  }],
}));

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 18 } },
  plugins: {
    legend: { display: false },
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      offset: 2,
      clip: false,
      color: "#414141",
      font: { weight: 600, size: 11 },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { size: 11 } }, beginAtZero: true },
  },
};
</script>

<style scoped>
.perf-summary {
  display: flex; gap: 24px; margin-top: 12px; padding: 10px 16px;
  background: #f9fafb; border-radius: 8px; font-size: 13px; color: #414141;
}
.period-selector { display: flex; gap: 4px; flex-wrap: wrap; }
.period-btn {
  padding: 4px 10px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 11px; cursor: pointer; color: #646464;
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
.empty-msg { text-align: center; color: #9ca3af; padding: 20px; font-size: 13px; }
.chart-hint { text-align: right; color: #9ca3af; font-size: 11px; margin: 6px 4px 0; font-style: italic; }

.badge-type-filter {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin: 4px 0 12px; padding: 10px 14px;
  background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 10px;
}
.badge-type-filter-label {
  font-size: 12px; color: #414141; font-weight: 600;
  text-transform: uppercase; letter-spacing: .3px;
}

.dom-row {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}
.dom-row-label {
  font-size: 11px; color: #646464; text-transform: uppercase;
  letter-spacing: .5px; font-weight: 600; margin-bottom: 8px;
}
.dom-row-maps {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.dom-card {
  background: #fafafa; border: 1px solid #f3f4f6; border-radius: 8px;
  padding: 6px 6px 8px;
}
.dom-card-caption {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 2px; font-size: 11px; color: #414141; padding: 0 4px;
}
.dom-card-caption strong { color: #1E4E66; font-size: 13px; }
</style>
