// Predicat de plage de dates partage par tous les calculs (registration + ES).
// Filtre date GLOBAL : une activite n'est comptee que si SA propre date tombe
// dans [start, end] (bornes ms inclusives). null/Infinity = borne ouverte.
// Si aucune borne effective, retourne un predicat toujours vrai (cout nul).
import { toEpochMs } from "./parisTime.js";

export function makeInRange(dateRange) {
  if (!dateRange) return () => true;
  const start = dateRange.start ?? -Infinity;
  const end = dateRange.end ?? Infinity;
  if (start === -Infinity && end === Infinity) return () => true;
  return (val) => {
    // Accepte ms / secondes Flink / ISO — normalise via toEpochMs (source unique).
    const t = toEpochMs(val);
    return t != null && t >= start && t <= end;
  };
}
