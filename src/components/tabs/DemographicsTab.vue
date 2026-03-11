<template>
  <div v-if="stats">
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">Pays représentés</div>
        <div class="kpi-value">{{ stats.demographics.countries.length }}</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Entreprises</div>
        <div class="kpi-value">{{ stats.demographics.companies.length }}</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Top pays</div>
        <div class="kpi-value">{{ topCountry }}</div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom: 16px;">
      <h3>Répartition géographique</h3>
      <ChoroplethMap :countries="stats.demographics.countries" :height="380" />
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Top 15 pays</h3>
        <HBarChart
          :labels="top15Countries.map(c => c.value)"
          :data="top15Countries.map(c => c.totalCount)"
          color="#1a5cb0"
          :height="340"
        />
      </div>
      <div class="chart-card">
        <h3>Répartition par continent</h3>
        <DoughnutChart
          :labels="continentLabels"
          :data="continentData"
          :colors="['#0F2D69','#1a5cb0','#30DD92','#FFA600','#E53935','#8b5cf6']"
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
            :labels="stats.demographics.genders.map(g => g.value || 'Non renseigné')"
            :data="stats.demographics.genders.map(g => g.totalCount)"
            :colors="['#0F2D69','#E53935','#FFA600','#e5e7eb']"
          />
        </div>
        <div class="legend-row">
          <span v-for="g in stats.demographics.genders" :key="g.value" class="legend-pill">
            {{ g.value || "Non renseigné" }} {{ fmt(g.totalCount) }}
          </span>
        </div>
      </div>
      <div class="chart-card">
        <h3>Top 10 professions</h3>
        <HBarChart
          :labels="stats.demographics.occupations.slice(0,10).map(o => o.value || 'Non renseigné')"
          :data="stats.demographics.occupations.slice(0,10).map(o => o.totalCount)"
          color="#8b5cf6"
        />
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h3>Top 10 qualifications</h3>
        <HBarChart
          :labels="stats.demographics.qualifications.slice(0,10).map(q => q.value || 'Non renseigné')"
          :data="stats.demographics.qualifications.slice(0,10).map(q => q.totalCount)"
          color="#30DD92"
        />
      </div>
      <div class="chart-card">
        <h3>Top 10 entreprises / institutions</h3>
        <HBarChart
          :labels="stats.demographics.companies.slice(0,10).map(c => c.value || 'Non renseigné')"
          :data="stats.demographics.companies.slice(0,10).map(c => c.totalCount)"
          color="#FFA600"
        />
      </div>
    </div>

    <div class="chart-card" v-if="stats.demographics.countries.length > 0">
      <h3>Tous les pays</h3>
      <table class="data-table">
        <thead>
          <tr><th>Pays</th><th>Inscrits</th><th>%</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in stats.demographics.countries" :key="c.value">
            <td>{{ countryFlag(c.value) }} {{ c.value }}</td>
            <td>{{ fmt(c.totalCount) }}</td>
            <td>{{ pct(c.totalCount, stats.global.totalDelegatesCount) }}</td>
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
import { countryCodeToFlag } from "../../utils/countries.js";

const props = defineProps({ stats: Object });

const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");
const countryFlag = (code) => countryCodeToFlag(code);

const top15Countries = computed(() => (props.stats?.demographics?.countries || []).slice(0, 15));
const topCountry = computed(() => {
  const c = props.stats?.demographics?.countries?.[0];
  return c ? c.value : "—";
});

const continentLabels = computed(() => {
  const cc = props.stats?.demographics?.continentCounts || {};
  return Object.keys(cc).filter((k) => cc[k] > 0);
});
const continentData = computed(() => {
  const cc = props.stats?.demographics?.continentCounts || {};
  return continentLabels.value.map((k) => cc[k]);
});
</script>
