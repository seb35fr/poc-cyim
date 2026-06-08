<template>
  <button class="csv-btn" :class="{ 'csv-btn--primary': primary }" @click="doExport" :title="t('csv.tooltip')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    {{ label || t("csv.label") }}
  </button>
</template>

<script setup>
import { useI18n } from "vue-i18n";
import { downloadCsv } from "../utils/exportCsv.js";

const { t } = useI18n();

const props = defineProps({
  filename: { type: String, default: "export" },
  headers: { type: Array, required: true },
  rows: { type: Array, required: true },
  // Libelle optionnel (sinon "CSV") — utile quand plusieurs exports cohabitent.
  label: { type: String, default: null },
  // Style accentue (fond bleu, texte blanc) pour mettre en avant un export.
  primary: { type: Boolean, default: false },
});

function doExport() {
  downloadCsv(props.filename, props.headers, props.rows);
}
</script>

<style scoped>
.csv-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 4px;
  font-size: 13px;
  color: #646464;
  cursor: pointer;
  vertical-align: middle;
  transition: all 0.15s;
}
.csv-btn:hover {
  background: #f3f4f6;
  color: #1E4E66;
  border-color: #1E4E66;
}
/* Variante accentuee : fond bleu nuit CYIM, texte blanc. */
.csv-btn--primary {
  background: #1E4E66;
  color: #fff;
  border-color: #1E4E66;
  font-weight: 600;
}
.csv-btn--primary:hover {
  background: var(--primary-light, #2a6a8a);
  color: #fff;
  border-color: var(--primary-light, #2a6a8a);
}
</style>
