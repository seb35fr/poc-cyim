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
        <div class="kpi-label">Pays représentés</div>
        <div class="kpi-value">{{ fs.demographics.countries.length }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Entreprises</div>
        <div class="kpi-value">{{ fs.demographics.companies.length }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Top pays</div>
        <div class="kpi-value">{{ topCountry }}</div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom: 16px;">
      <h3>Répartition géographique</h3>
      <ChoroplethMap :countries="fs.demographics.countries" :height="380" />
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Top 15 pays</h3>
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
        <h3>Répartition par continent</h3>
        <DoughnutChart
          :labels="continentLabels"
          :data="continentData"
          :colors="['#1E4E66','#2a6a8a','#30DD92','#FFA600','#E53935','#6F45FF']"
          :active-label="afm.continent"
          @select="onContinentSelect"
        />
        <div class="legend-row">
          <span v-for="(c, i) in continentLabels" :key="c" class="legend-pill">
            {{ c }} {{ fmt(continentData[i]) }}
          </span>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Genre</h3>
        <div style="max-width: 200px; margin: 0 auto;">
          <DoughnutChart
            :labels="fs.demographics.genders.map(g => g.value || 'Non renseigné')"
            :data="fs.demographics.genders.map(g => g.totalCount)"
            :colors="['#1E4E66','#E53935','#FFA600','#e5e7eb']"
            :active-label="afm.gender"
            @select="onGenderSelect"
          />
        </div>
        <div class="legend-row">
          <span v-for="g in fs.demographics.genders" :key="g.value" class="legend-pill">
            {{ g.value || "Non renseigné" }} {{ fmt(g.totalCount) }}
          </span>
        </div>
      </div>
      <div class="chart-card">
        <h3>Top 10 professions</h3>
        <HBarChart
          :labels="fs.demographics.occupations.slice(0,10).map(o => o.value || 'Non renseigné')"
          :data="fs.demographics.occupations.slice(0,10).map(o => o.totalCount)"
          color="#6F45FF"
          :active-label="afm.occupation"
          @select="onOccupationSelect"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Top 10 qualifications</h3>
        <HBarChart
          :labels="fs.demographics.qualifications.slice(0,10).map(q => q.value || 'Non renseigné')"
          :data="fs.demographics.qualifications.slice(0,10).map(q => q.totalCount)"
          color="#30DD92"
          :active-label="afm.qualification"
          @select="onQualificationSelect"
        />
      </div>
      <div class="chart-card">
        <h3>Top 10 entreprises / institutions</h3>
        <HBarChart
          :labels="fs.demographics.companies.slice(0,10).map(c => c.value || 'Non renseigné')"
          :data="fs.demographics.companies.slice(0,10).map(c => c.totalCount)"
          color="#FFA600"
          :active-label="afm.company"
          @select="onCompanySelect"
        />
      </div>
    </div>

    <div class="chart-card" v-if="fs.demographics.countries.length > 0">
      <h3>Tous les pays</h3>
      <table class="data-table">
        <thead>
          <tr><th>Pays</th><th>Inscrits</th><th>%</th></tr>
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
import DoughnutChart from "../charts/DoughnutChart.vue";
import HBarChart from "../charts/HBarChart.vue";
import ChoroplethMap from "../charts/ChoroplethMap.vue";
import FilterBanner from "../FilterBanner.vue";
import { countryCodeToFlag, COUNTRY_CONTINENTS } from "../../utils/countries.js";
import { useFilteredStats } from "../../composables/useFilteredStats.js";

const props = defineProps({ stats: Object, delegates: Array });

const {
  filteredStats: fs, activeFilters, activeFilterMap: afm,
  hasFilters, filteredCount, toggleFilter, removeFilter, clearFilters,
} = useFilteredStats(() => props.delegates);

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");
const countryFlag = (code) => countryCodeToFlag(code);

function getCountryCode(d) {
  return d.primaryAddress?.countryCode || d.primaryAddress?.country?.code || null;
}

// --- Filtres ---
function onCountrySelect(label) {
  toggleFilter("country", label, (d) => getCountryCode(d) === label);
}
function onContinentSelect(label) {
  toggleFilter("continent", label, (d) => {
    const cc = getCountryCode(d);
    const continent = cc ? COUNTRY_CONTINENTS[cc] || "Autre" : "Non renseigne";
    return continent === label;
  });
}
function onGenderSelect(label) {
  const GENDER_MAP = { Hommes: "MALE", Femmes: "FEMALE", Autre: "OTHER" };
  const genderValue = GENDER_MAP[label];
  toggleFilter("gender", label, (d) =>
    genderValue ? d.gender === genderValue : !d.gender || !GENDER_MAP[d.gender]
  );
}
function onOccupationSelect(label) {
  toggleFilter("occupation", label, (d) =>
    label === "Non renseigné" ? !d.occupation : d.occupation === label
  );
}
function onQualificationSelect(label) {
  toggleFilter("qualification", label, (d) =>
    label === "Non renseigné" ? !d.qualification : d.qualification === label
  );
}
function onCompanySelect(label) {
  toggleFilter("company", label, (d) =>
    label === "Non renseigné" ? !d.company : d.company === label
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
const continentData = computed(() => {
  const cc = fs.value?.demographics?.continentCounts || {};
  return continentLabels.value.map((k) => cc[k]);
});
</script>
