// Predicat de plage de dates partage par tous les calculs (registration + ES).
// Filtre date GLOBAL : une activite n'est comptee que si SA propre date tombe
// dans [start, end] (bornes ms inclusives). null/Infinity = borne ouverte.
// Si aucune borne effective, retourne un predicat toujours vrai (cout nul).
export function makeInRange(dateRange) {
  if (!dateRange) return () => true;
  const start = dateRange.start ?? -Infinity;
  const end = dateRange.end ?? Infinity;
  if (start === -Infinity && end === Infinity) return () => true;
  return (val) => {
    if (val == null || val === "") return false;
    // Accepte ms (number), secondes Flink (number < 10^12) ou ISO (string).
    let t = typeof val === "number" ? val : Date.parse(val);
    if (typeof val === "number" && val < 10 ** 12) t = val * 1000;
    return Number.isFinite(t) && t >= start && t <= end;
  };
}
