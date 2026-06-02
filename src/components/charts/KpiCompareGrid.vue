<template>
  <div class="kpi-compare-grid">
    <div v-for="kpi in kpis" :key="kpi.label" class="kpi-compare-card">
      <div class="kpi-label">{{ kpi.label }}</div>
      <div class="kpi-line">
        <div class="kpi-side">
          <div class="kpi-side-header">
            <span class="kpi-dot" :style="{ background: colors.current }"></span>
            <span class="kpi-side-name">{{ shortName(eventName) }}</span>
          </div>
          <div class="kpi-side-value">{{ kpi.a.display }}</div>
          <div class="kpi-side-sub">{{ kpi.a.sub || ' ' }}</div>
        </div>
        <div class="kpi-delta-wrap">
          <span v-if="kpi.delta" class="kpi-delta" :class="kpi.delta.cls">
            {{ kpi.delta.arrow }} {{ kpi.delta.text }}
          </span>
          <span v-else class="kpi-delta kpi-delta--neutral">—</span>
        </div>
        <div class="kpi-side kpi-side--compare">
          <div class="kpi-side-header">
            <span class="kpi-side-name">{{ shortName(compareEventName) }}</span>
            <span class="kpi-dot" :style="{ background: colors.compare }"></span>
          </div>
          <div class="kpi-side-value">{{ kpi.b.display }}</div>
          <div class="kpi-side-sub">{{ kpi.b.sub || ' ' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Grille de KPIs comparatifs A | Δ | B. Partagee par ComparisonTab et
// ViewersComparisonTab (Live + Replay) — meme presentation visuelle, seule
// la liste de KPIs change.
//
// La forme d'un KPI : { label, a: { display, sub? }, b: { display, sub? },
// delta: { arrow, text, cls } | null }. cls = "kpi-delta--good" / "--bad" /
// "--neutral" pour le code couleur du chip delta. La logique de calcul
// (buildDelta, buildDeltaAbs, ratePct, etc.) reste cote parent — ce composant
// est purement presentationnel.
import { shortName } from "@/utils/formatters.js";

defineProps({
  kpis: { type: Array, required: true },
  eventName: { type: String, required: true },
  compareEventName: { type: String, required: true },
  colors: {
    type: Object,
    default: () => ({ current: "#27CE71", compare: "#9CA3AF" }),
  },
});
</script>

<style scoped>
.kpi-compare-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 12px; margin-bottom: 12px;
}
.kpi-compare-card {
  background: var(--card); border-radius: 10px; padding: 12px 16px 14px;
  box-shadow: var(--shadow);
  display: flex; flex-direction: column;
}
.kpi-compare-card .kpi-label {
  font-size: 16px; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-muted); font-weight: 600;
  padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; margin-bottom: 10px;
}
.kpi-line {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 12px;
}
.kpi-side { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.kpi-side--compare { align-items: flex-end; text-align: right; }
.kpi-side-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-muted); font-weight: 500;
  min-width: 0; max-width: 100%;
}
.kpi-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.kpi-side-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.kpi-side-value {
  font-weight: 700; color: var(--text); font-size: 25px; line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.kpi-side-sub {
  color: var(--text-muted); font-size: 13px; line-height: 1.3;
  min-height: 14px;
  font-variant-numeric: tabular-nums;
}
.kpi-delta-wrap { align-self: center; padding-top: 16px; }
.kpi-delta {
  font-weight: 700; font-size: 13px;
  padding: 4px 10px; border-radius: 12px; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
.kpi-delta--good { color: #047857; background: #d1fae5; }
.kpi-delta--bad { color: #b91c1c; background: #fee2e2; }
.kpi-delta--neutral { color: var(--text-muted); background: #f3f4f6; }
</style>
