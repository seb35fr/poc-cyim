<template>
  <div>
    <div :style="{ position: 'relative', height: height + 'px' }">
      <canvas ref="canvasRef"></canvas>
    </div>

    <!-- Legende d'echelle (degrade relatif au max). Le degrade lineaire
         vert(0%)->orange(50%)->rouge(100%) reflete fidelement l'echelle sqrt :
         l'orange (t=0.5) correspond a value = max/4, le rouge (t=1) au max. -->
    <div v-if="showLegend && maxVal > 1" class="map-legend">
      <div class="map-legend-bar"></div>
      <div class="map-legend-marks">
        <span>0</span>
        <span>{{ fmtNum(Math.round(maxVal / 4)) }}</span>
        <span>{{ fmtNum(maxVal) }}</span>
      </div>
      <div class="map-legend-note">{{ t("maps.legendNote") }}</div>
    </div>

    <div v-if="loadError" class="map-fallback">
      <p>{{ t("maps.unavailable") }} — {{ loadError }}</p>
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
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { Chart } from "chart.js";
import { NUMERIC_TO_ALPHA2, COUNTRY_CONTINENTS } from "../../utils/countries.js";
import HBarChart from "./HBarChart.vue";
import { heatColor } from "../../utils/heatColor.js";

const props = defineProps({
  countries: { type: Array, default: () => [] },
  height: { type: Number, default: 380 },
  // "world" (defaut) ou "europe" : restreint le rendu aux pays europeens
  // (l'echelle de projection se recadre automatiquement sur ces features).
  scope: { type: String, default: "world" },
  // Affiche une legende d'echelle de couleur sous la carte.
  showLegend: { type: Boolean, default: false },
});

const { t, locale } = useI18n();
const fmtNum = (n) => Number(n || 0).toLocaleString(locale.value === "en" ? "en-GB" : "fr-FR");

const canvasRef = ref(null);
const loadError = ref(null);
const maxVal = ref(0);
let chartInstance = null;

const topCountries = ref([]);

// Set des codes alpha2 europeens (pour le scope "europe").
const EUROPE_ALPHA2 = new Set(
  Object.entries(COUNTRY_CONTINENTS)
    .filter(([, continent]) => continent === "Europe")
    .map(([code]) => code),
);

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
    if (!resp.ok) throw new Error(t("maps.loadError"));
    const worldTopo = await resp.json();

    const worldGeo = topoModule.feature(worldTopo, worldTopo.objects.countries);

    const countryMap = {};
    for (const c of props.countries) {
      const code = (c.value || "").toUpperCase();
      countryMap[code] = c.totalCount;
    }

    const isEurope = props.scope === "europe";
    let features = worldGeo.features.map((f) => {
      const alpha2 = NUMERIC_TO_ALPHA2[f.id] || NUMERIC_TO_ALPHA2[String(f.id)];
      return {
        alpha2,
        feature: f,
        value: alpha2 ? (countryMap[alpha2] || 0) : 0,
      };
    });
    // Scope Europe : on ne garde que les pays europeens ET on clippe chaque
    // geometrie a une boite Europe continentale. Indispensable : la geometrie
    // "France" inclut la Guyane / la Reunion, "Espagne" les Canaries, "Norvege"
    // le Svalbard, etc. Sans clip, la bbox de fit s'etire jusqu'en Amerique du
    // Sud / Pacifique et l'Europe apparait minuscule. On garde chaque polygone
    // dont le centroide tombe dans la boite -> ne reste que la partie europeenne.
    if (isEurope) {
      // Boite "Europe continentale" resserree : on coupe l'Atlantique a l'ouest
      // (Acores, Canaries, Islande) et l'extreme est, pour que l'Europe remplisse
      // bien la carte au lieu d'etre noyee dans l'ocean. Les participants hors de
      // cette boite restent visibles sur la carte monde.
      const inBox = ([lon, lat]) => lon >= -12 && lon <= 42 && lat >= 34 && lat <= 72;
      const ringCentroidIn = (ring) => {
        let sx = 0, sy = 0;
        for (const [x, y] of ring) { sx += x; sy += y; }
        const n = ring.length || 1;
        return inBox([sx / n, sy / n]);
      };
      const clipToEurope = (f) => {
        const g = f.geometry;
        if (!g) return null;
        if (g.type === "Polygon") return ringCentroidIn(g.coordinates[0]) ? f : null;
        if (g.type === "MultiPolygon") {
          const polys = g.coordinates.filter((poly) => ringCentroidIn(poly[0]));
          if (polys.length === 0) return null;
          return { ...f, geometry: { type: "MultiPolygon", coordinates: polys } };
        }
        return f;
      };
      // Russie exclue : son polygone continental traverse la ligne de changement
      // de date (centroide en Asie) -> inexploitable pour un cadrage Europe.
      const EU_EXCLUDE = new Set(["RU"]);
      features = features
        .filter((f) => f.alpha2 && EUROPE_ALPHA2.has(f.alpha2) && !EU_EXCLUDE.has(f.alpha2))
        .map((f) => ({ ...f, feature: clipToEurope(f.feature) }))
        .filter((f) => f.feature);
    }

    maxVal.value = Math.max(1, ...features.map((f) => f.value));

    const dataset = {
      label: t("maps.registered"),
      data: features,
      backgroundColor: (ctx) => heatColor(ctx.raw?.value || 0, maxVal.value),
      borderColor: "#d1d5db",
      borderWidth: 0.5,
    };
    if (isEurope) {
      // chartjs-chart-geo CALE la projection sur l'`outline` du dataset (par
      // defaut la sphere = monde entier, d'ou une Europe minuscule au centre).
      // On passe les features europeennes (TABLEAU attendu) comme outline -> la
      // projection se recadre sur l'Europe. showOutline:false plus bas : le fit
      // utilise l'outline meme sans le dessiner (les data colorent deja les pays).
      dataset.outline = features.map((f) => f.feature);
    }

    chartInstance = new Chart(canvasRef.value, {
      type: "choropleth",
      data: {
        labels: features.map((f) => f.feature.properties.name),
        datasets: [dataset],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Monde : on dessine l'outline sphère. Europe : outline (features EU) sert
        // UNIQUEMENT au cadrage de la projection, pas au dessin (data colore deja).
        showOutline: !isEurope,
        showGraticule: false,
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const item = items[0];
                return item?.raw?.feature?.properties?.name || item?.label || "";
              },
              label: (ctx) => {
                const v = ctx.raw?.value || 0;
                return `${v.toLocaleString("fr-FR")} ${t("maps.registeredN", v)}`;
              },
            },
          },
        },
        scales: {
          projection: {
            axis: "x",
            // Mercator pour l'Europe (meilleur rendu regional), equalEarth monde.
            projection: isEurope ? "mercator" : "equalEarth",
          },
          color: { display: false, axis: "r" },
        },
      },
    });
  } catch (err) {
    console.warn("ChoroplethMap:", err);
    loadError.value = err.message;
  }
});

onUnmounted(() => {
  // Detruit l'instance Chart pour eviter les fuites lors des remount (cle :key
  // pilotee par les filtres dans la Vue d'ensemble).
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});
</script>

<style scoped>
.map-fallback { margin-top: 8px; }
.map-fallback p { text-align: center; color: #646464; font-size: 14px; margin-bottom: 8px; }

.map-legend { margin-top: 6px; padding: 0 4px; }
.map-legend-bar {
  height: 10px; border-radius: 5px;
  background: linear-gradient(to right, #30DD92 0%, #FFA600 50%, #E53935 100%);
}
.map-legend-marks {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--text-muted); margin-top: 2px;
}
.map-legend-note {
  font-size: 10px; color: var(--text-muted); font-style: italic;
  text-align: center; margin-top: 2px;
}
</style>
