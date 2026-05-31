import { parisDay } from "@/utils/parisTime.js";

// Évolution journalière des délégués PHYSIQUEMENT présents (check-in valide)
// qui consultent du replay (VOD). C'est le funnel "venu sur place PUIS revu en
// replay" — utile pour mesurer la valeur de la VOD aupres des participants
// physiques.
//
// `items`  : replayStats.items (hits ES VOD normalises, cf. computeReplayStats)
// `lookup` : Map<keycloakId, { checkedIn, delegate }> (cf. viewerJoin.buildDelegateLookup
//            ou le delegateLookup inline de ViewersTab — meme shape).
//
// On ne garde que les viewers rapproches d'un delegue dont `checkedIn === true`.
// Bucketage par jour de VISIONNAGE (timestamp de la vue, heure de Paris).
// Par jour : delegues uniques (Set sur delegate.id Mongo) + nombre de vues.
export function buildPhysicalReplayByDay(items, lookup) {
  const byDay = new Map(); // day -> { delegates: Set, views: number }
  for (const it of items || []) {
    const entry = lookup?.get(it.userId);
    if (!entry || !entry.checkedIn) continue; // uniquement les presents physiques
    const day = parisDay(it.timestamp);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, { delegates: new Set(), views: 0 });
    const b = byDay.get(day);
    if (entry.delegate?.id) b.delegates.add(entry.delegate.id);
    b.views++;
  }
  return [...byDay.entries()]
    .map(([day, b]) => ({ day, uniqueDelegates: b.delegates.size, views: b.views }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// Variante CUMULEE : delegues physiquement presents distincts ayant deja
// consulte du replay, jour apres jour. Chaque delegue est compte UNE fois, le
// jour de sa 1ere vue replay (parmi les presents physiques), puis reporte. La
// courbe est donc croissante. Retourne [{ day, count }] (meme shape que
// computeReplayStats.cumulativeUniqueByDay, pour reutiliser alignDaysOnJ0).
export function buildPhysicalReplayCumulative(items, lookup) {
  const firstDay = new Map(); // delegateId -> jour de 1ere vue replay (presents physiques)
  for (const it of items || []) {
    const entry = lookup?.get(it.userId);
    if (!entry || !entry.checkedIn || !entry.delegate?.id) continue;
    const day = parisDay(it.timestamp);
    if (!day) continue;
    const id = entry.delegate.id;
    const prev = firstDay.get(id);
    if (!prev || day < prev) firstDay.set(id, day);
  }
  const newByDay = new Map(); // jour -> nb de nouveaux delegues distincts ce jour
  for (const day of firstDay.values()) newByDay.set(day, (newByDay.get(day) || 0) + 1);
  const days = [...newByDay.keys()].sort((a, b) => a.localeCompare(b));
  let cumul = 0;
  return days.map((day) => {
    cumul += newByDay.get(day);
    return { day, count: cumul };
  });
}
