// Helpers de formatage partages dans tout le dashboard. Avant: redefinis
// 15x dans les tabs/utils. Centraliser ici evite les divergences (ex:
// DataTab utilisait (n || 0) qui collapse 0 en "0" via une autre branche).

const NUMBER_FMT_FR = new Intl.NumberFormat("fr-FR");

// Nombre formate FR ("1 234"). null/undefined -> "0". 0 reste "0".
export const fmt = (n) => NUMBER_FMT_FR.format(n ?? 0);

// Pourcentage formate "12.3%". Si denominateur <= 0 -> "0%".
export const pct = (numerator, denominator, decimals = 1) => {
  if (!(denominator > 0)) return "0%";
  return `${((numerator / denominator) * 100).toFixed(decimals)}%`;
};

// Tronque un nom d'event/session a maxLen chars (avec "...") pour les
// labels de chart/legende. Default 38 (cf. Live/ReplayComparison),
// ComparisonTab utilise 26 (cards plus etroites).
export const shortName = (name, maxLen = 38) => {
  if (!name) return "—";
  return name.length > maxLen ? `${name.slice(0, maxLen - 2)}…` : name;
};

// Duree humaine "1h 23m 45s" / "23m 45s" / "45s" depuis des secondes.
// Utilise par Live/Replay (durees cumulees de visionnage).
export const formatDurationHMS = (sec) => {
  if (!sec || sec < 0) return "0s";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
