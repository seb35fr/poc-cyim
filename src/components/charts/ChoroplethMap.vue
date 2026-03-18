<template>
  <div>
    <div :style="{ position: 'relative', height: height + 'px' }">
      <canvas ref="canvasRef"></canvas>
    </div>
    <div v-if="loadError" class="map-fallback">
      <p>Carte non disponible — {{ loadError }}</p>
      <HBarChart
        :labels="topCountries.map(c => c.value)"
        :data="topCountries.map(c => c.totalCount)"
        color="#2a6a8a"
        :height="300"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import { Chart } from "chart.js";
import { NUMERIC_TO_ALPHA2 } from "../../utils/countries.js";
import HBarChart from "./HBarChart.vue";

const props = defineProps({
  countries: { type: Array, default: () => [] },
  height: { type: Number, default: 380 },
});

const canvasRef = ref(null);
const loadError = ref(null);
let chartInstance = null;

const topCountries = ref([]);

onMounted(async () => {
  topCountries.value = props.countries.slice(0, 20);
  try {
    const [geoModule, topoModule] = await Promise.all([
      import("chartjs-chart-geo"),
      import("topojson-client"),
    ]);

    const { ChoroplethController, GeoFeature, ColorScale, ProjectionScale } = geoModule;
    Chart.register(ChoroplethController, GeoFeature, ColorScale, ProjectionScale);

    const resp = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    if (!resp.ok) throw new Error("Impossible de charger la carte");
    const worldTopo = await resp.json();

    const worldGeo = topoModule.feature(worldTopo, worldTopo.objects.countries);

    const countryMap = {};
    for (const c of props.countries) {
      const code = (c.value || "").toUpperCase();
      countryMap[code] = c.totalCount;
    }

    const features = worldGeo.features.map((f) => {
      const alpha2 = NUMERIC_TO_ALPHA2[f.id] || NUMERIC_TO_ALPHA2[String(f.id)];
      return {
        feature: f,
        value: alpha2 ? (countryMap[alpha2] || 0) : 0,
      };
    });

    const maxVal = Math.max(1, ...features.map((f) => f.value));

    chartInstance = new Chart(canvasRef.value, {
      type: "choropleth",
      data: {
        labels: features.map((f) => f.feature.properties.name),
        datasets: [
          {
            label: "Inscrits",
            data: features,
            backgroundColor: (ctx) => {
              if (!ctx.raw) return "#e5e7eb";
              const v = ctx.raw.value || 0;
              if (v === 0) return "#f3f4f6";
              const ratio = Math.pow(v / maxVal, 0.4);
              const r = Math.round(240 - ratio * 225);
              const g = Math.round(240 - ratio * 195);
              const b = Math.round(245 - ratio * 140);
              return `rgb(${r},${g},${b})`;
            },
            borderColor: "#d1d5db",
            borderWidth: 0.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        showOutline: true,
        showGraticule: false,
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw?.value || 0;
                return v > 0 ? `${ctx.label}: ${v.toLocaleString("fr-FR")}` : `${ctx.label}: 0`;
              },
            },
          },
        },
        scales: {
          projection: {
            axis: "x",
            projection: "equalEarth",
          },
        },
      },
    });
  } catch (err) {
    console.warn("ChoroplethMap:", err);
    loadError.value = err.message;
  }
});

watch(() => props.countries, () => {
  topCountries.value = props.countries.slice(0, 20);
});
</script>

<style scoped>
.map-fallback { margin-top: 8px; }
.map-fallback p { text-align: center; color: #646464; font-size: 12px; margin-bottom: 8px; }
</style>
