<template>
  <div v-if="types.length > 0" class="badge-type-filter">
    <span class="badge-type-filter-label">Filtrer la page par type de badge :</span>
    <div class="period-selector">
      <button
        :class="['period-btn', { active: selected.size === 0 }]"
        @click="$emit('clear')"
      >Tous</button>
      <button v-for="t in types" :key="t"
        :class="['period-btn', { active: selected.has(t) }]"
        @click="$emit('toggle', t)"
      >{{ t }}</button>
    </div>
  </div>
</template>

<script setup>
// Pills multi-select pour le filtre badge type. Composant UI uniquement —
// l'etat (selection + toggle/clear) est gere par le composable
// useBadgeTypeFilter, instancie au niveau StatisticsView.
defineProps({
  types: { type: Array, required: true },
  selected: { type: Set, required: true },
});
defineEmits(["toggle", "clear"]);
</script>

<style scoped>
.badge-type-filter {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 12px;
}
.badge-type-filter-label {
  font-size: 11px; color: var(--text-muted); font-weight: 500;
}
.period-selector {
  display: inline-flex; gap: 4px; background: var(--card);
  padding: 3px; border-radius: 6px; box-shadow: var(--shadow);
}
.period-btn {
  padding: 4px 10px; border: none; background: transparent;
  font-size: 11px; color: var(--text-muted); font-weight: 500;
  border-radius: 4px; cursor: pointer;
  transition: background .12s, color .12s;
}
.period-btn:hover { color: var(--text); }
.period-btn.active {
  background: var(--primary); color: #fff; font-weight: 600;
}
</style>
