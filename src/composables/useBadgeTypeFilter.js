import { ref, computed } from "vue";
import { delegateBadgeType } from "@/utils/checkinByType.js";

// Filtre global page par type de badge (multi-select). Lifte au niveau de
// StatisticsView pour avoir UN SEUL niveau de filtrage commun a Overview /
// Badges / Comparison — avant cette refacto chaque tab avait sa propre
// instance + son propre pageFilteredDelegates, ce qui rendait incoherent
// entre 2 tabs et source de bugs (cf. fix recent BadgesTab device chart).
//
// La selection s'applique en amont de useFilteredStats. Si compare actif,
// le meme filtre s'applique aux 2 events pour que les % d'evolution restent
// comparables (mix de delegues homogene).
//
// Usage :
//   const badgeFilter = useBadgeTypeFilter(
//     () => delegates.value,
//     compareEventId ? () => compareDelegates.value : null,
//   );
//   // -> badgeFilter.filteredDelegates / filteredCompareDelegates / selected / toggle / clear
export function useBadgeTypeFilter(getDelegates, getCompareDelegates = null) {
  const selected = ref(new Set());

  const allBadgeTypes = computed(() => {
    const set = new Set();
    for (const d of getDelegates() || []) set.add(delegateBadgeType(d));
    if (getCompareDelegates) {
      for (const d of getCompareDelegates() || []) set.add(delegateBadgeType(d));
    }
    set.delete("Inconnu"); // pas un filtre utile
    return [...set].sort();
  });

  function filterList(list) {
    const sel = selected.value;
    if (sel.size === 0) return list || [];
    return (list || []).filter((d) => sel.has(delegateBadgeType(d)));
  }

  const filteredDelegates = computed(() => filterList(getDelegates()));
  const filteredCompareDelegates = computed(() =>
    getCompareDelegates ? filterList(getCompareDelegates()) : [],
  );

  function toggle(type) {
    const next = new Set(selected.value);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    selected.value = next;
  }

  function clear() {
    selected.value = new Set();
  }

  // Set complet — utile pour le dropdown "Tout cocher visible" qui sinon
  // genererait N toggles en cascade.
  function setSelection(types) {
    selected.value = new Set(types || []);
  }

  return {
    selected,
    allBadgeTypes,
    filteredDelegates,
    filteredCompareDelegates,
    toggle,
    clear,
    setSelection,
  };
}
