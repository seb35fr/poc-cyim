<template>
  <div v-if="hasFilters" class="filter-banner">
    <span class="filter-info">{{ filteredCount }} / {{ totalCount }} inscrits</span>
    <div class="filter-tags">
      <span v-for="(f, i) in activeFilters" :key="f.key + '-' + f.label" class="filter-tag" @click="$emit('remove', f.key, f.label)">
        {{ f.label }} ✕
      </span>
    </div>
    <button class="filter-clear" @click="$emit('clear')">Tout effacer</button>
  </div>
</template>

<script setup>
defineProps({
  hasFilters: Boolean,
  activeFilters: Array,
  filteredCount: Number,
  totalCount: Number,
});
defineEmits(["remove", "clear"]);
</script>
