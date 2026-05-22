import { ref, computed } from "vue";
import { computeAllStats } from "../utils/computeStats.js";

/**
 * Composable de cross-filtering : filtre les delegates bruts et recalcule les stats.
 * Supporte le multi-select : plusieurs labels par clé (OR intra-clé, AND inter-clés).
 * @param {Function} getDelegates - getter qui retourne le tableau de delegates
 */
export function useFilteredStats(getDelegates, getMobileAppId = () => null) {
  // Map<key, Map<label, filterFn>>
  const filters = ref(new Map());

  function toggleFilter(key, label, filterFn) {
    const next = new Map(filters.value);
    if (next.has(key)) {
      const entry = new Map(next.get(key));
      if (entry.has(label)) {
        entry.delete(label);
        if (entry.size === 0) next.delete(key);
        else next.set(key, entry);
      } else {
        entry.set(label, filterFn);
        next.set(key, entry);
      }
    } else {
      next.set(key, new Map([[label, filterFn]]));
    }
    filters.value = next;
  }

  function removeFilter(key, label) {
    const next = new Map(filters.value);
    if (label !== undefined && next.has(key)) {
      const entry = new Map(next.get(key));
      entry.delete(label);
      if (entry.size === 0) next.delete(key);
      else next.set(key, entry);
    } else {
      next.delete(key);
    }
    filters.value = next;
  }

  function clearFilters() {
    filters.value = new Map();
  }

  const filteredDelegates = computed(() => {
    let result = getDelegates();
    if (!result) return [];
    for (const fns of filters.value.values()) {
      // OR intra-clé : le delegate doit matcher au moins un filterFn du groupe
      const fnList = [...fns.values()];
      result = result.filter((d) => fnList.some((fn) => fn(d)));
    }
    return result;
  });

  const filteredStats = computed(() => computeAllStats(filteredDelegates.value, getMobileAppId()));
  const hasFilters = computed(() => filters.value.size > 0);
  const filteredCount = computed(() => filteredDelegates.value.length);

  const activeFilters = computed(() => {
    const arr = [];
    for (const [key, entry] of filters.value) {
      for (const label of entry.keys()) {
        arr.push({ key, label });
      }
    }
    return arr;
  });

  // Map key → label(s) pour passer activeLabel aux charts
  // Un seul label → string, plusieurs → array
  const activeFilterMap = computed(() => {
    const map = {};
    for (const [key, entry] of filters.value) {
      const labels = [...entry.keys()];
      map[key] = labels.length === 1 ? labels[0] : labels;
    }
    return map;
  });

  return {
    filteredDelegates,
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
