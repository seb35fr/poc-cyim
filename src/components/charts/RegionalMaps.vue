<template>
  <div class="charts-row">
    <div class="chart-card">
      <div class="chart-header">
        <h3>{{ t("maps.worldTitle") }}</h3>
        <CsvButton
          :filename="`${filenamePrefix}-monde`"
          :headers="[t('maps.csv.countryCode'), t('maps.csv.countryName'), t('maps.csv.registered')]"
          :rows="geoCountries.map(c => [c.value, countryName(c.value), c.totalCount])"
        />
      </div>
      <ChoroplethMap :countries="geoCountries" :height="380" :show-legend="showScaleLegend" :key="`world-${cacheKey}`" />
    </div>
    <div class="chart-card">
      <div class="chart-header">
        <h3>{{ t("maps.frTitle") }}</h3>
        <CsvButton
          :filename="`${filenamePrefix}-regions-fr`"
          :headers="[t('maps.csv.regionCode'), t('maps.csv.region'), t('maps.csv.registered')]"
          :rows="frRegions.map(r => [r.code, REGION_NAMES[r.code] || r.code, r.count])"
        />
      </div>
      <FrenchRegionMap
        :regions="frRegionsMetro"
        :region-codes="METRO_REGION_CODES_ARR"
        :global-max="frGlobalMax"
        :height="380"
        :show-legend="!showScaleLegend"
        :key="`fr-metro-${cacheKey}`"
      />
      <div v-if="frRegionsOverseas.length > 0" class="dom-row">
        <div class="dom-row-label">{{ t("maps.overseas") }}</div>
        <div class="dom-row-maps">
          <div v-for="r in frRegionsOverseas" :key="r.code" class="dom-card">
            <FrenchRegionMap
              :regions="[r]"
              :region-codes="[r.code]"
              :global-max="frGlobalMax"
              :height="110"
              :show-legend="false"
              :key="`fr-dom-${r.code}-${cacheKey}`"
            />
            <div class="dom-card-caption">
              <span>{{ REGION_NAMES[r.code] || r.code }}</span>
              <strong>{{ r.count.toLocaleString("fr-FR") }}</strong>
            </div>
          </div>
        </div>
      </div>
      <!-- Échelle relative des couleurs (dégradé), comme la carte monde. -->
      <div v-if="showScaleLegend && frGlobalMax > 1" class="map-legend">
        <div class="map-legend-bar"></div>
        <div class="map-legend-marks">
          <span>0</span>
          <span>{{ Math.round(frGlobalMax / 4).toLocaleString("fr-FR") }}</span>
          <span>{{ frGlobalMax.toLocaleString("fr-FR") }}</span>
        </div>
        <div class="map-legend-note">{{ t("maps.legendNoteRegion") }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ChoroplethMap from "./ChoroplethMap.vue";
import FrenchRegionMap from "./FrenchRegionMap.vue";
import CsvButton from "../CsvButton.vue";
import { zipToRegion, REGION_NAMES } from "../../utils/frenchRegions.js";
import { countryName } from "../../utils/countries.js";

const { t } = useI18n();

// Carte monde + carte France metro + mini-cartes DOM. Composant reutilisable
// par BadgesTab (mono-event) et ComparisonTab (2x cote a cote — appeler 2 fois).
// Toute la logique geo (extraction des country codes, mapping zip -> region INSEE,
// separation metro / DOM, max global pour l'echelle de couleurs partagee) est
// encapsulee ici.
const props = defineProps({
  delegates: { type: Array, required: true },
  // Identifiant stable pour invalider les Choropleth quand les delegues changent
  // significativement (filtre badge type, switch d'event). Pas obligatoire — si
  // omis, "all" est utilise (les cartes se mettent a jour via reactivity normale).
  cacheKey: { type: String, default: "all" },
  // Prefixe des noms de fichiers CSV exportes. Utile pour distinguer
  // "badges-répartition-monde" vs "comparison-current-monde" par exemple.
  filenamePrefix: { type: String, default: "répartition" },
  // Affiche l'echelle de couleur (degrade vert->orange->rouge) sous chaque carte,
  // comme dans la Vue d'ensemble. Remplace la legende liste-de-regions du FR.
  showScaleLegend: { type: Boolean, default: false },
});

// Codes regions metropolitaines (13 regions) — utilise pour separer DOM dans l'affichage.
const METRO_REGION_CODES_ARR = ["11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93", "94"];
const METRO_REGION_CODES = new Set(METRO_REGION_CODES_ARR);

const geoCountries = computed(() => {
  const map = {};
  for (const d of props.delegates) {
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
  for (const d of props.delegates) {
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

const frRegionsMetro = computed(() => frRegions.value.filter((r) => METRO_REGION_CODES.has(r.code)));
const frRegionsOverseas = computed(() => frRegions.value.filter((r) => !METRO_REGION_CODES.has(r.code)));
// Max global toutes regions confondues pour partager l'echelle de couleurs
// entre la carte metropole et les mini-cartes DOM.
const frGlobalMax = computed(() => Math.max(1, ...frRegions.value.map((r) => r.count)));
</script>

<style scoped>
.dom-row {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}
.dom-row-label {
  font-size: 13px; color: #646464; text-transform: uppercase;
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
  margin-top: 2px; font-size: 13px; color: #414141; padding: 0 4px;
}
.dom-card-caption strong { color: #1E4E66; font-size: 15px; }

/* Échelle de couleur (dégradé) — identique à celle de ChoroplethMap. */
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
