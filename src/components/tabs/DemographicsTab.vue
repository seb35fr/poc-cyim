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
        <div class="kpi-label">{{ t("demographics.kpi.countriesRepresented") }}</div>
        <div class="kpi-value">{{ fs.demographics.countries.length }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">{{ t("demographics.kpi.companies") }}</div>
        <div class="kpi-value">{{ fs.demographics.companies.length }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">{{ t("demographics.kpi.topCountry") }}</div>
        <div class="kpi-value">{{ topCountry }}</div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-header">
        <h3>{{ t("demographics.charts.geoDistribution") }}</h3>
        <CsvButton filename="pays" :headers="[t('demographics.csv.country'), t('demographics.csv.count')]" :rows="fs.demographics.countries.map(c => [c.value, c.totalCount])" />
      </div>
      <ChoroplethMap :countries="fs.demographics.countries" :height="380" />
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("demographics.charts.top15Countries") }}</h3>
          <CsvButton filename="top15-pays" :headers="[t('demographics.csv.country'), t('demographics.csv.count')]" :rows="top15Countries.map(c => [c.value, c.totalCount])" />
        </div>
        <HBarChart
          :labels="top15Countries.map(c => c.value)"
          :data="top15Countries.map(c => c.totalCount)"
          color="#2a6a8a"
          :height="340"
          :active-label="afm.country"
          @select="onCountrySelect"
        />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("demographics.charts.byContinent") }}</h3>
          <CsvButton filename="continents" :headers="[t('demographics.csv.continent'), t('demographics.csv.count')]" :rows="continentDisplayLabels.map((c, i) => [c, continentData[i]])" />
        </div>
        <DoughnutChart
          :labels="continentDisplayLabels"
          :data="continentData"
          :colors="['#1E4E66','#2a6a8a','#30DD92','#FFA600','#E53935','#6F45FF']"
          :active-label="afm.continent"
          @select="onContinentSelect"
        />
        <div class="legend-row">
          <span v-for="(c, i) in continentDisplayLabels" :key="c" class="legend-pill">
            {{ c }} {{ fmt(continentData[i]) }}
          </span>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("demographics.charts.gender") }}</h3>
          <CsvButton filename="genre" :headers="[t('demographics.csv.gender'), t('demographics.csv.count')]" :rows="fs.demographics.genders.map(g => [genderLabel(g.value), g.totalCount])" />
        </div>
        <div style="max-width: 200px; margin: 0 auto;">
          <DoughnutChart
            :labels="fs.demographics.genders.map(g => genderLabel(g.value))"
            :data="fs.demographics.genders.map(g => g.totalCount)"
            :colors="['#1E4E66','#E53935','#FFA600','#e5e7eb']"
            :active-label="afm.gender"
            @select="onGenderSelect"
          />
        </div>
        <div class="legend-row">
          <span v-for="g in fs.demographics.genders" :key="g.value" class="legend-pill">
            {{ genderLabel(g.value) }} {{ fmt(g.totalCount) }}
          </span>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("demographics.charts.top10Occupations") }}</h3>
          <CsvButton filename="professions" :headers="[t('demographics.csv.occupation'), t('demographics.csv.count')]" :rows="fs.demographics.occupations.map(o => [lbl(o.value), o.totalCount])" />
        </div>
        <HBarChart
          :labels="fs.demographics.occupations.slice(0,10).map(o => lbl(o.value))"
          :data="fs.demographics.occupations.slice(0,10).map(o => o.totalCount)"
          color="#6F45FF"
          :active-label="afm.occupation"
          @select="onOccupationSelect"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("demographics.charts.top10Qualifications") }}</h3>
          <CsvButton filename="qualifications" :headers="[t('demographics.csv.qualification'), t('demographics.csv.count')]" :rows="fs.demographics.qualifications.map(q => [lbl(q.value), q.totalCount])" />
        </div>
        <HBarChart
          :labels="fs.demographics.qualifications.slice(0,10).map(q => lbl(q.value))"
          :data="fs.demographics.qualifications.slice(0,10).map(q => q.totalCount)"
          color="#30DD92"
          :active-label="afm.qualification"
          @select="onQualificationSelect"
        />
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <h3>{{ t("demographics.charts.top10Companies") }}</h3>
          <CsvButton filename="entreprises" :headers="[t('demographics.csv.company'), t('demographics.csv.count')]" :rows="fs.demographics.companies.map(c => [lbl(c.value), c.totalCount])" />
        </div>
        <HBarChart
          :labels="fs.demographics.companies.slice(0,10).map(c => lbl(c.value))"
          :data="fs.demographics.companies.slice(0,10).map(c => c.totalCount)"
          color="#FFA600"
          :active-label="afm.company"
          @select="onCompanySelect"
        />
      </div>
    </div>

    <div class="chart-card" v-if="fs.demographics.countries.length > 0">
      <div class="chart-header">
        <h3>{{ t("demographics.charts.allCountries") }}</h3>
        <CsvButton filename="tous-pays" :headers="[t('demographics.csv.country'), t('demographics.csv.registered'), t('demographics.csv.pct')]" :rows="fs.demographics.countries.map(c => [c.value, c.totalCount, (c.totalCount / fs.global.totalDelegatesCount * 100).toFixed(1)])" />
      </div>
      <table class="data-table">
        <thead>
          <tr><th>{{ t("demographics.table.country") }}</th><th>{{ t("demographics.table.registered") }}</th><th>{{ t("demographics.table.pct") }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in fs.demographics.countries" :key="c.value">
            <td>{{ countryFlag(c.value) }} {{ c.value }}</td>
            <td>{{ fmt(c.totalCount) }}</td>
            <td>{{ pct(c.totalCount, fs.global.totalDelegatesCount) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import DoughnutChart from "../charts/DoughnutChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import ChoroplethMap from "../charts/ChoroplethMap.vue";
import FilterBanner from "../FilterBanner.vue";
import CsvButton from "../CsvButton.vue";
import { countryCodeToFlag, COUNTRY_CONTINENTS } from "../../utils/countries.js";
import { useFilteredStats } from "../../composables/useFilteredStats.js";
import { genderLabel, continentLabel, notSpecified, isNotSpecified } from "@/i18n/labels.js";
import { fmt, pct } from "@/utils/formatters.js";

const { t } = useI18n();

const props = defineProps({ stats: Object, delegates: Array, dateRange: { type: Object, default: null } });

// Libelle d'une valeur libre (profession, qualif, entreprise) : la valeur reelle
// telle quelle, sinon "Non renseigne" localise.
const lbl = (v) => (isNotSpecified(v) ? notSpecified() : v);

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates);

const countryFlag = (code) => countryCodeToFlag(code);

function getCountryCode(d) {
  return d.primaryAddress?.countryCode || d.primaryAddress?.country?.code || null;
}

// --- Filtres ---
function onCountrySelect(label) {
  toggleFilter("country", label, (d) => getCountryCode(d) === label);
}
function onContinentSelect(label) {
  // `label` = libelle continent localise (clic sur le doughnut). On compare en
  // re-localisant le continent canonique de chaque delegue.
  toggleFilter("continent", label, (d) => {
    const cc = getCountryCode(d);
    const continent = cc ? COUNTRY_CONTINENTS[cc] || "Autre" : "Non renseigne";
    return continentLabel(continent) === label;
  });
}
function onGenderSelect(label) {
  // Reconstruit la map libelle-localise -> code backend a la locale courante.
  const GENDER_MAP = {
    [t("categories.gender.male")]: "MALE",
    [t("categories.gender.female")]: "FEMALE",
    [t("categories.gender.other")]: "OTHER",
  };
  const genderValue = GENDER_MAP[label];
  toggleFilter("gender", label, (d) =>
    genderValue ? d.gender === genderValue : !d.gender || !["MALE", "FEMALE", "OTHER"].includes(d.gender)
  );
}
function onOccupationSelect(label) {
  toggleFilter("occupation", label, (d) =>
    label === notSpecified() ? !d.occupation : d.occupation === label
  );
}
function onQualificationSelect(label) {
  toggleFilter("qualification", label, (d) =>
    label === notSpecified() ? !d.qualification : d.qualification === label
  );
}
function onCompanySelect(label) {
  toggleFilter("company", label, (d) =>
    label === notSpecified() ? !d.company : d.company === label
  );
}

// --- Computed ---
const top15Countries = computed(() => (fs.value?.demographics?.countries || []).slice(0, 15));
const topCountry = computed(() => {
  const c = fs.value?.demographics?.countries?.[0];
  return c ? c.value : "—";
});

const continentLabels = computed(() => {
  const cc = fs.value?.demographics?.continentCounts || {};
  return Object.keys(cc).filter((k) => cc[k] > 0);
});
// Memes ordres : labels affiches (localises) <-> data.
const continentDisplayLabels = computed(() => continentLabels.value.map(continentLabel));
const continentData = computed(() => {
  const cc = fs.value?.demographics?.continentCounts || {};
  return continentLabels.value.map((k) => cc[k]);
});
</script>
