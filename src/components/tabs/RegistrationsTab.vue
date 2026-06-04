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

    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">{{ t("registrations.kpi.types") }}</div>
        <div class="kpi-value">{{ fs.registrations.types.length }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("registrations.kpi.categories") }}</div>
        <div class="kpi-value">{{ fs.registrations.categories.length }}</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">{{ t("registrations.kpi.multiReg") }}</div>
        <div class="kpi-value">{{ fs.registrations.multiRegistrations.length }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">{{ t("registrations.kpi.accessDays") }}</div>
        <div class="kpi-value">{{ fs.registrations.accessDays.length }}</div>
      </div>
    </div>

    <!-- Repartition par statut (deplacee depuis Vue d'ensemble) -->
    <div class="chart-card">
      <div class="chart-header">
        <h3>{{ t("registrations.charts.byStatus") }}</h3>
        <CsvButton
          filename="statuts-inscription"
          :headers="[t('registrations.csv.status'), t('registrations.csv.count')]"
          :rows="fs.registrations.statuses.map(s => [s.value, s.totalCount])"
        />
      </div>
      <div class="status-row">
        <div style="width: 180px; flex-shrink: 0;">
          <DoughnutChart
            :labels="fs.registrations.statuses.map(s => s.value)"
            :data="fs.registrations.statuses.map(s => s.totalCount)"
            :colors="['#30DD92', '#FFA600', '#E53935', '#6F45FF', '#e5e7eb']"
            :active-label="afm.status"
            @select="onStatusSelect"
          />
        </div>
        <div class="legend-col">
          <span v-for="s in fs.registrations.statuses" :key="s.value" class="legend-pill">
            {{ s.value }} <strong>{{ fmt(s.totalCount) }}</strong>
          </span>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("registrations.charts.byType") }}</h3>
          <CsvButton filename="types-inscription" :headers="[t('registrations.csv.type'), t('registrations.csv.count')]" :rows="fs.registrations.types.map(rt => [rt.value, rt.totalCount])" />
        </div>
        <HBarChart
          :labels="fs.registrations.types.map(rt => rt.value)"
          :data="fs.registrations.types.map(rt => rt.totalCount)"
          :colors="getTypeColors(fs.registrations.types.map(rt => rt.value))"
          :height="Math.max(200, fs.registrations.types.length * 32)"
          :active-label="afm.regType"
          @select="onTypeSelect"
        />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("registrations.charts.statusByType") }}</h3>
          <CsvButton filename="statut-par-type" :headers="[t('registrations.csv.type'), ...statusByTypeDatasets.map(d => d.label)]" :rows="statusByTypeLabels.map((label, i) => [label, ...statusByTypeDatasets.map(d => d.data[i])])" />
        </div>
        <StackedBarChart
          :labels="statusByTypeLabels"
          :datasets="statusByTypeDatasets"
          :horizontal="true"
          :height="280"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("registrations.charts.top15Categories") }}</h3>
          <CsvButton filename="categories" :headers="[t('registrations.csv.category'), t('registrations.csv.count')]" :rows="fs.registrations.categories.map(c => [c.value, c.totalCount])" />
        </div>
        <HBarChart
          :labels="fs.registrations.categories.slice(0,15).map(c => c.value)"
          :data="fs.registrations.categories.slice(0,15).map(c => c.totalCount)"
          color="#6F45FF"
          :height="Math.max(200, Math.min(15, fs.registrations.categories.length) * 30)"
          :active-label="afm.category"
          @select="onCategorySelect"
        />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("registrations.charts.accessDays") }}</h3>
          <CsvButton filename="jours-acces" :headers="[t('registrations.csv.day'), t('registrations.csv.count')]" :rows="fs.registrations.accessDays.map(a => [dayLbl(a.value), a.totalCount])" />
        </div>
        <HBarChart
          v-if="fs.registrations.accessDays.length > 0"
          :labels="fs.registrations.accessDays.map(a => dayLbl(a.value))"
          :data="fs.registrations.accessDays.map(a => a.totalCount)"
          color="#30DD92"
          :height="Math.max(160, fs.registrations.accessDays.length * 32)"
          :active-label="afm.accessDay"
          @select="onAccessDaySelect"
        />
        <p v-else class="empty-msg">{{ t("registrations.emptyAccessDays") }}</p>
      </div>
    </div>

    <div class="chart-card" v-if="sortedMultiRegistrations.length > 0">
      <div class="chart-header">
        <h3>{{ t("registrations.charts.multiTitle", { n: sortedMultiRegistrations.length }) }}</h3>
        <CsvButton filename="multi-inscriptions" :headers="[t('registrations.csv.name'), t('registrations.csv.email'), t('registrations.csv.nbReg'), t('registrations.csv.types')]" :rows="sortedMultiRegistrations.map(d => [d.name, d.email, d.count, d.types.join(', ')])" />
      </div>
      <table class="data-table">
        <thead>
          <tr><th>{{ t("registrations.table.name") }}</th><th>{{ t("registrations.table.email") }}</th><th>{{ t("registrations.table.nbReg") }}</th><th>{{ t("registrations.table.types") }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in sortedMultiRegistrations.slice(0, 50)" :key="d.id">
            <td>{{ d.name }}</td>
            <td>{{ d.email }}</td>
            <td>{{ d.count }}</td>
            <td>{{ d.types.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="sortedMultiRegistrations.length > 50" class="empty-msg">
        {{ t("registrations.andOthers", { n: sortedMultiRegistrations.length - 50 }) }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import DoughnutChart from "../charts/DoughnutChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import StackedBarChart from "../charts/StackedBarChart.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { getTypeColors } from "../../utils/typeColors.js";
import { allDaysLabel } from "@/i18n/labels.js";
import { fmt } from "@/utils/formatters.js";

const { t } = useI18n();

const props = defineProps({ stats: Object, delegates: Array, dateRange: { type: Object, default: null } });

// Affichage d'un jour d'acces : "Tous les jours" (canonique computeStats) localise,
// sinon la valeur reelle (date / identifiant de jour, donnee libre).
const dayLbl = (v) => (v === "Tous les jours" ? allDaysLabel() : v);

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates);

const STATUS_COLORS = {
  confirmed: "#30DD92",
  pending: "#FFA600",
  cancelled: "#E53935",
  refused: "#6F45FF",
};

// --- Filtres ---
function onStatusSelect(label) {
  toggleFilter("status", label, (d) => d.status === label);
}
function onTypeSelect(label) {
  toggleFilter("regType", label, (d) => (d.registrations || []).some((r) => r.type === label));
}
function onCategorySelect(label) {
  toggleFilter("category", label, (d) =>
    (d.registrations || []).some((r) => (r.categories || []).includes(label))
  );
}
function onAccessDaySelect(label) {
  toggleFilter("accessDay", label, (d) =>
    (d.registrations || []).some((r) =>
      (r.accessDays || []).includes(label === allDaysLabel() ? "*" : label)
    )
  );
}

// --- Computed ---
const sortedMultiRegistrations = computed(() =>
  [...(fs.value?.registrations?.multiRegistrations || [])].sort((a, b) =>
    a.types.join(", ").localeCompare(b.types.join(", "))
  )
);

const statusByTypeLabels = computed(() =>
  (fs.value?.registrations?.types || []).slice(0, 8).map((t) => t.value)
);

const statusByTypeDatasets = computed(() => {
  const types = (fs.value?.registrations?.types || []).slice(0, 8);
  const allStatuses = [...new Set(types.flatMap((t) => Object.keys(t.statuses || {})))];
  return allStatuses.map((status) => ({
    label: status,
    data: types.map((t) => t.statuses?.[status] || 0),
    backgroundColor: STATUS_COLORS[status] || "#e5e7eb",
    borderRadius: 3,
  }));
});
</script>

<style scoped>
.empty-msg { text-align: center; color: var(--text-muted); padding: 20px; font-size: 15px; }
.status-row { display: flex; align-items: center; gap: 16px; }
.legend-col { display: flex; flex-direction: column; gap: 4px; }
.legend-col .legend-pill { font-size: 13px; }
</style>
