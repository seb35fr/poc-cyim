<template>
  <div v-if="hasFilters" class="filter-banner">
    <span class="filter-info">{{ filteredCount }} / {{ totalCount }} inscrits</span>
    <div class="filter-tags">
      <span v-for="f in activeFilters" :key="f.key" class="filter-tag" @click="$emit('remove', f.key)">
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
