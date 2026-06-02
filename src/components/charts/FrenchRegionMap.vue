<template>
  <div>
    <div :style="{ position: 'relative', height: height + 'px' }">
      <canvas ref="canvasRef"></canvas>
    </div>
    <div v-if="loadError" class="map-fallback">
      <p>Carte non disponible — {{ loadError }}</p>
    </div>
    <div v-else-if="showLegend && legend.length > 0" class="map-legend">
      <span v-for="r in legend" :key="r.code" class="legend-row">
        <span class="legend-swatch" :style="{ background: r.color }"></span>
        <span class="legend-name">{{ r.name }}</span>
        <strong>{{ r.count.toLocaleString("fr-FR") }}</strong>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import { Chart } from "chart.js";
import { REGION_NAMES } from "../../utils/frenchRegions.js";
import { heatColor } from "../../utils/heatColor.js";

const props = defineProps({
  // [{ code, count }] (code region INSEE)
  regions: { type: Array, default: () => [] },
  height: { type: Number, default: 420 },
  // Liste blanche des codes regions a afficher. Si null, on prend tout le GeoJSON.
  // En mode metro on passe les 13 codes metropolitains ; en mini DOM on passe
  // un seul code (ex: ["01"] pour Guadeloupe). Le projection chartjs-chart-geo
  // auto-fit sur ce sous-ensemble.
  regionCodes: { type: Array, default: null },
  // Max global pour partager l'echelle de couleurs entre les cartes (sinon
  // une mini-carte single-region serait toujours saturee a 100%).
  globalMax: { type: Number, default: null },
  showLegend: { type: Boolean, default: true },
  // "mercator" (defaut) ou "lambert". Lambert (conicConformal) est la
  // projection officielle FR — meilleure forme de l'hexagone. A reserver a
  // la metropole : les paralleles standard (44N/49N) distordent les DOM
  // qui sont a d'autres latitudes.
  projectionType: { type: String, default: "mercator" },
});

const canvasRef = ref(null);
const loadError = ref(null);
const legend = ref([]);
let chartInstance = null;

// Cache GeoJSON au module pour eviter N fetches quand on rend N mini-cartes.
let franceGeoCache = null;
async function loadFranceGeo() {
  if (franceGeoCache) return franceGeoCache;
  const resp = await fetch(
    "https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/regions.geojson",
  );
  if (!resp.ok) throw new Error("Impossible de charger la carte");
  franceGeoCache = await resp.json();
  return franceGeoCache;
}

// Echelle partagee : vert (faible) -> orange -> rouge (fort). 0 = neutre clair.
const colorFor = heatColor;

async function render() {
  if (!canvasRef.value) return;
  try {
    const geoModule = await import("chartjs-chart-geo");
    const { ChoroplethController, GeoFeature, ColorScale, ProjectionScale } = geoModule;
    Chart.register(ChoroplethController, GeoFeature, ColorScale, ProjectionScale);

    let projectionInstance = "mercator";
    if (props.projectionType === "lambert") {
      // Lambert conique conforme cale sur la France metropolitaine :
      // - rotate centre sur le meridien de Paris (~2.5E)
      // - paralleles standards 44N et 49N (encadrent l'hexagone)
      // Fallback mercator si d3-geo n'expose pas l'API attendue.
      try {
        const d3geo = await import("d3-geo");
        if (typeof d3geo.geoConicConformal === "function") {
          projectionInstance = d3geo.geoConicConformal()
            .rotate([-2.5, 0])
            .parallels([44, 49]);
        }
      } catch (e) {
        console.warn("Lambert FR indisponible, fallback mercator", e);
      }
    }

    const franceGeo = await loadFranceGeo();

    // Filtrer le GeoJSON aux regions demandees (sinon tout).
    let visibleFeatures = franceGeo.features;
    if (props.regionCodes && props.regionCodes.length > 0) {
      const set = new Set(props.regionCodes.map(String));
      visibleFeatures = franceGeo.features.filter((f) => set.has(String(f.properties.code)));
    }

    const regionMap = {};
    for (const r of props.regions) regionMap[String(r.code)] = r.count;

    const features = visibleFeatures.map((f) => ({
      feature: f,
      value: regionMap[String(f.properties.code)] || 0,
    }));

    const localMax = Math.max(1, ...features.map((f) => f.value));
    const effectiveMax = props.globalMax != null ? Math.max(1, props.globalMax) : localMax;

    legend.value = features
      .filter((f) => f.value > 0)
      .map((f) => ({
        code: f.feature.properties.code,
        name: REGION_NAMES[f.feature.properties.code] || f.feature.properties.nom,
        count: f.value,
        color: colorFor(f.value, effectiveMax),
      }))
      .sort((a, b) => b.count - a.count);

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvasRef.value, {
      type: "choropleth",
      data: {
        labels: features.map((f) => f.feature.properties.nom),
        datasets: [
          {
            label: "Inscrits",
            // outline = ce sur quoi le projection s'auto-fit. Sans ca,
            // chartjs-chart-geo fitte la SPHERE (toute la Terre) et la
            // France devient un timbre-poste. On lui dit explicitement
            // de fitter aux features qu'on affiche.
            outline: visibleFeatures,
            data: features,
            backgroundColor: (ctx) => colorFor(ctx.raw?.value || 0, effectiveMax),
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
              // Le titre par defaut prend data.labels[i] qui peut etre
              // undefined si le GeoJSON n'a pas de proprietes.nom — d'ou le
              // "UNDEFINED" affiche. On le surcharge explicitement.
              title: (items) => {
                const item = items[0];
                const code = item?.raw?.feature?.properties?.code;
                const nom = item?.raw?.feature?.properties?.nom;
                return REGION_NAMES[code] || nom || "";
              },
              label: (ctx) => {
                const v = ctx.raw?.value || 0;
                return `${v.toLocaleString("fr-FR")} inscrit${v > 1 ? "s" : ""}`;
              },
            },
          },
        },
        scales: {
          projection: { axis: "x", projection: projectionInstance },
          // Axe de couleur natif de chartjs-chart-geo : il s'auto-active des
          // qu'il y a des `value` dans les data et prend ~120px a droite,
          // ce qui ecrasait le cadre. On le desactive, on construit notre
          // propre legende sous la carte. `axis: "r"` est obligatoire pour
          // satisfaire l'initialisation interne du scale (sinon
          // "Cannot read properties of undefined (reading 'axis')").
          color: { display: false, axis: "r" },
        },
      },
    });
  } catch (err) {
    console.warn("FrenchRegionMap:", err);
    loadError.value = err.message;
  }
}

onMounted(render);
watch(() => [props.regions, props.regionCodes, props.globalMax], render, { deep: true });
</script>

<style scoped>
.map-fallback p { text-align: center; color: var(--text-muted); font-size: 14px; }
.map-legend {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 4px 12px; margin-top: 10px; font-size: 14px;
}
.legend-row { display: flex; align-items: center; gap: 6px; }
.legend-swatch { width: 12px; height: 12px; border-radius: 2px; border: 1px solid #d1d5db; flex-shrink: 0; }
.legend-name { color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
