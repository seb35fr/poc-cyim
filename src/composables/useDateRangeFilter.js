import { ref, computed } from "vue";

// Filtre par plage de dates GLOBAL (debut -> fin), lifte au niveau de
// StatisticsView et applique a toutes les pages. Le predicat de plage est
// transmis a computeAllStats (registration) et aux composables ES (live/replay/
// scans), ou chaque activite n'est comptee que si SA propre date tombe dans la
// plage.
//
// Bornes par defaut : debut = jour de l'inscription la plus ancienne (donnee la
// plus ancienne cote delegues), fin = aujourd'hui. L'utilisateur peut restreindre
// l'une ou l'autre ; tant qu'il ne touche pas a une borne, le defaut (reactif)
// s'applique.

function startOfDayMs(ymd) {
  if (!ymd) return null;
  const t = Date.parse(`${ymd}T00:00:00`);
  return Number.isFinite(t) ? t : null;
}
function endOfDayMs(ymd) {
  if (!ymd) return null;
  const t = Date.parse(`${ymd}T23:59:59.999`);
  return Number.isFinite(t) ? t : null;
}
function toYMD(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useDateRangeFilter(getDelegates) {
  // null = "utilise le defaut". Sinon override utilisateur (YYYY-MM-DD).
  const userStartYMD = ref(null);
  const userEndYMD = ref(null);

  // Defaut debut : inscription la plus ancienne (createdAt min).
  const defaultStartYMD = computed(() => {
    let min = null;
    for (const d of getDelegates() || []) {
      const t = Date.parse(d.createdAt);
      if (Number.isFinite(t) && (min === null || t < min)) min = t;
    }
    return min !== null ? toYMD(min) : "";
  });
  // Defaut fin : aujourd'hui.
  const defaultEndYMD = computed(() => toYMD(Date.now()));

  const startYMD = computed({
    get: () => userStartYMD.value ?? defaultStartYMD.value,
    set: (v) => {
      userStartYMD.value = v || null;
    },
  });
  const endYMD = computed({
    get: () => userEndYMD.value ?? defaultEndYMD.value,
    set: (v) => {
      userEndYMD.value = v || null;
    },
  });

  // Plage appliquee : start au debut du jour, end a la fin du jour (inclusif).
  const range = computed(() => ({
    start: startOfDayMs(startYMD.value),
    end: endOfDayMs(endYMD.value),
  }));

  // true tant que l'utilisateur n'a pas touche aux bornes (defaut = plage pleine).
  const isDefault = computed(() => userStartYMD.value === null && userEndYMD.value === null);

  function reset() {
    userStartYMD.value = null;
    userEndYMD.value = null;
  }

  return { startYMD, endYMD, range, isDefault, reset };
}
