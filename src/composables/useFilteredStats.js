import { ref, computed } from "vue";
import { computeAllStats } from "../utils/computeStats.js";

/**
 * Composable de cross-filtering : filtre les delegates bruts et recalcule les stats.
 * @param {Function} getDelegates - getter qui retourne le tableau de delegates
 */
export function useFilteredStats(getDelegates, getMobileAppId = () => null) {
  const filters = ref(new Map());

  function toggleFilter(key, label, filterFn) {
    const next = new Map(filters.value);
    if (filters.value.has(key) && filters.value.get(key).label === label) {
      next.delete(key);
    } else {
      next.set(key, { label, filterFn });
    }
    filters.value = next;
  }

  function removeFilter(key) {
    const next = new Map(filters.value);
    next.delete(key);
    filters.value = next;
  }

  function clearFilters() {
    filters.value = new Map();
  }

  const filteredDelegates = computed(() => {
    let result = getDelegates();
    if (!result) return [];
    for (const { filterFn } of filters.value.values()) {
      result = result.filter(filterFn);
    }
    return result;
  });

  const filteredStats = computed(() => computeAllStats(filteredDelegates.value, getMobileAppId()));
  const hasFilters = computed(() => filters.value.size > 0);
  const filteredCount = computed(() => filteredDelegates.value.length);

  const activeFilters = computed(() => {
    const arr = [];
    for (const [key, { label }] of filters.value) {
      arr.push({ key, label });
    }
    return arr;
  });

  // Map key → label pour passer activeLabel aux charts
  const activeFilterMap = computed(() => {
    const map = {};
    for (const [key, { label }] of filters.value) {
      map[key] = label;
    }
    return map;
  });

  return {
    filteredStats,
    activeFilters,
    activeFilterMap,
    hasFilters,
    filteredCount,
    toggleFilter,
    removeFilter,
    clearFilters,
  };
}
