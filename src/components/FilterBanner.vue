<template>
  <div v-if="hasFilters" class="filter-banner">
    <span class="filter-info">{{ t("filterBanner.count", { filtered: filteredCount, total: totalCount }) }}</span>
    <div class="filter-tags">
      <span v-for="(f, i) in activeFilters" :key="f.key + '-' + f.label" class="filter-tag" @click="$emit('remove', f.key, f.label)">
        {{ f.label }} ✕
      </span>
    </div>
    <button class="filter-clear" @click="$emit('clear')">{{ t("filterBanner.clearAll") }}</button>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps({
  hasFilters: Boolean,
  activeFilters: Array,
  filteredCount: Number,
  totalCount: Number,
});
defineEmits(["remove", "clear"]);
</script>
