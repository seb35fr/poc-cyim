import { parisDateParts } from "./parisTime.js";
import { makeInRange } from "./dateRange.js";

// Normalisation d'un hit ES vers un format unifie : audience/checkin/zone
// portent des noms de champs differents (user_id vs delegate_id, badge_type
// vs registration_type, session_id vs zone_id), on les ramene a un schema commun.
function normalizeAudience(hit) {
  const s = hit._source || {};
  // Les 3 index audience / checkin / zone ecrivent tous le meme
  // identifiant cote Flink : badge.registrationByBadgeQRCode['delegate']['id']
  // = delegate.id Mongo. Le nom du champ ES differe juste (user_id vs
  // delegate_id), mais le contenu est identique. Pas besoin de traduction.
  return {
    kind: "audience",
    id: hit._id,
    delegateId: s.user_id || s.user_identity_id || null,
    fullName: s.user_fullName || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ") || "—",
    email: s.user_email || "",
    badgeType: s.badge_type || "Inconnu",
    sessionId: s.session_id || null,
    sessionTitle: s.session_title || "",
    sessionStart: s.session_start || null,
    roomId: s.room_id || null,
    roomName: s.room_name || "",
    zoneId: null,
    industryName: s.industry_name || "",
    direction: normalizeDirection(s.direction),
    approval: s.room_entry_approval || null,
    timestamp: s.timestamp || null,
    rawQrCode: s.raw_qr_code || "",
  };
}

function normalizeCheckin(hit) {
  const s = hit._source || {};
  return {
    kind: "checkin",
    id: hit._id,
    delegateId: s.delegate_id || s.delegate_identity_id || null,
    fullName: s.user_fullName || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ") || "—",
    email: s.user_email || "",
    badgeType: s.registration_type || "Inconnu",
    sessionId: null,
    sessionTitle: "",
    sessionStart: null,
    roomId: null,
    roomName: "",
    zoneId: null,
    industryName: "",
    direction: normalizeDirection(s.direction),
    approval: s.room_entry_approval || null,
    timestamp: s.timestamp || null,
    rawQrCode: s.raw_qr_code || "",
  };
}

function normalizeZone(hit) {
  const s = hit._source || {};
  return {
    kind: "zone",
    id: hit._id,
    delegateId: s.delegate_id || s.delegate_identity_id || null,
    fullName: s.user_fullName || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ") || "—",
    email: s.user_email || "",
    badgeType: s.registration_type || "Inconnu",
    sessionId: null,
    sessionTitle: "",
    sessionStart: null,
    roomId: null,
    roomName: "",
    zoneId: s.zone_id || null,
    industryName: "",
    direction: normalizeDirection(s.direction),
    approval: s.room_entry_approval || null,
    timestamp: s.timestamp || null,
    rawQrCode: s.raw_qr_code || "",
  };
}

function normalizeDirection(raw) {
  if (!raw) return "unknown";
  const v = String(raw).toLowerCase();
  if (v.includes("in") || v.includes("entr")) return "in";
  if (v.includes("out") || v.includes("sort")) return "out";
  return "unknown";
}

function dayHourFromTimestamp(ts) {
  if (!ts) return null;
  // Les timestamps Flink peuvent etre ms ou s (cf. normalisation cote SQL).
  // Heuristique simple : un nombre < 10^12 est en secondes (avant 2001 en ms).
  let parsed = ts;
  if (typeof ts === "number" && ts < 10 ** 12) parsed = ts * 1000;
  const parts = parisDateParts(parsed);
  if (!parts) return null;
  return { day: parts.ymd, hour: String(parts.hour).padStart(2, "0") };
}

// Cote Flink (stats_room_scans.sql), checkin et zone sont en LEFT JOIN avec
// un CASE WHEN ... ELSE '-'. Quand un QR scanne ne matche aucun delegate
// (badge invalide, mauvais event), delegate_id est ecrit litteralement '-'.
// Tous ces scans aboutissent au meme "delegateId = '-'" et seraient fusionnes
// en 1 faux delegue unique -> on doit les exclure.
function isRealDelegateId(id) {
  return !!id && id !== "-";
}

function uniqueDelegates(scans) {
  const set = new Set();
  for (const s of scans) if (isRealDelegateId(s.delegateId)) set.add(s.delegateId);
  return set.size;
}

// Delegues scannes PAR session : Map<sessionId, Set<delegateId>>.
// Regle de comptage de "vues en salle" (somme des cardinalites) :
//   - un delegue compte 1x POUR CHAQUE session distincte qu'il a suivie
//     (present a 3 sessions => +3) ;
//   - en revanche, plusieurs scans de la MEME session (re-entrees, allers-
//     retours) ne comptent qu'une fois pour cette session.
// C'est l'affluence totale des conferences, vs le nombre brut de scans qui
// sur-compte les multi-passages a l'interieur d'une meme session.
function uniqueDelegatesBySession(scans) {
  const bySession = new Map();
  for (const s of scans) {
    if (!s.sessionId || !isRealDelegateId(s.delegateId)) continue;
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, new Set());
    bySession.get(s.sessionId).add(s.delegateId);
  }
  return bySession;
}

function countBy(scans, getKey) {
  const map = new Map();
  for (const s of scans) {
    const k = getKey(s);
    if (k == null || k === "") continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function topN(map, n, fallbackLabel = (k) => k) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, label: fallbackLabel(key), count }));
}

function directionBreakdown(scans) {
  const out = { in: 0, out: 0, unknown: 0 };
  for (const s of scans) out[s.direction]++;
  return out;
}

function flowByDayHour(scans) {
  // { day: { hour: count } } pour timeline LineChart par jour
  const out = {};
  for (const s of scans) {
    const dh = dayHourFromTimestamp(s.timestamp);
    if (!dh) continue;
    if (!out[dh.day]) out[dh.day] = {};
    out[dh.day][dh.hour] = (out[dh.day][dh.hour] || 0) + 1;
  }
  return out;
}

function uniqueDelegatesByDay(scans) {
  // { day: Set<delegateId Mongo> } puis cardinalite. Filtre les '-' (cf.
  // isRealDelegateId : placeholder Flink pour les QR non matches).
  const sets = new Map();
  for (const s of scans) {
    if (!isRealDelegateId(s.delegateId)) continue;
    const dh = dayHourFromTimestamp(s.timestamp);
    if (!dh) continue;
    if (!sets.has(dh.day)) sets.set(dh.day, new Set());
    sets.get(dh.day).add(s.delegateId);
  }
  const out = {};
  for (const [day, set] of sets) out[day] = set.size;
  return out;
}

function uniqueDelegatesByDayByBadgeType(scans) {
  // { day: { badgeType: count } } — delegues uniques par jour, ventiles par
  // type de badge. Pour que la somme par jour reste egale au total de delegues
  // uniques du jour (uniqueDelegatesByDay), chaque delegue est rattache a UN
  // seul type par jour (premier rencontre) : un delegue ne peut pas etre
  // double-compte meme si ses scans portent 2 types differents (cas rare :
  // badge_type cote audience vs registration_type cote checkin).
  const seen = new Map(); // day -> Map<delegateId, badgeType>
  for (const s of scans) {
    if (!isRealDelegateId(s.delegateId)) continue;
    const dh = dayHourFromTimestamp(s.timestamp);
    if (!dh) continue;
    if (!seen.has(dh.day)) seen.set(dh.day, new Map());
    const dayMap = seen.get(dh.day);
    if (!dayMap.has(s.delegateId)) dayMap.set(s.delegateId, s.badgeType || "Inconnu");
  }
  const out = {};
  for (const [day, dayMap] of seen) {
    const byType = {};
    for (const type of dayMap.values()) byType[type] = (byType[type] || 0) + 1;
    out[day] = byType;
  }
  return out;
}

function sessionLabelMap(audienceScans) {
  // Map session_id -> session_title (premier titre rencontre)
  const map = new Map();
  for (const s of audienceScans) {
    if (s.sessionId && !map.has(s.sessionId)) {
      map.set(s.sessionId, s.sessionTitle || s.sessionId);
    }
  }
  return map;
}

export function computeAllScanStats({ audience = [], checkin = [], zone = [] }, options = {}) {
  const { dateRange = null, badgeTypes = null } = options;
  // Filtre date global : un scan n'est compte que si son timestamp tombe dans
  // la plage. Filtre badge type global : si un set de types est fourni (non
  // vide), on ne garde que les scans de ces types de badge.
  const inRange = makeInRange(dateRange);
  const hasBadgeFilter = badgeTypes && badgeTypes.size > 0;
  const keep = (s) =>
    (!dateRange || inRange(s.timestamp)) &&
    (!hasBadgeFilter || badgeTypes.has(s.badgeType));

  const audienceScans = audience.map(normalizeAudience).filter(keep);
  const checkinScans = checkin.map(normalizeCheckin).filter(keep);
  const zoneScans = zone.map(normalizeZone).filter(keep);
  const allScans = [...audienceScans, ...checkinScans, ...zoneScans];

  const audienceBySession = countBy(audienceScans, (s) => s.sessionId);
  const sessionLabels = sessionLabelMap(audienceScans);

  // Delegues uniques par session + "vues en salle" = somme cumulee par session.
  const audienceUniqBySession = uniqueDelegatesBySession(audienceScans);
  const audienceUniqueDelegateSessions = [...audienceUniqBySession.values()].reduce(
    (sum, set) => sum + set.size,
    0,
  );

  // topSessions trie par scans bruts mais enrichi de uniqueDelegates (delegues
  // distincts ayant scanne cette session) pour les vues comparatives.
  const topSessions = [...audienceBySession.entries()]
    .map(([id, count]) => ({
      key: id,
      label: sessionLabels.get(id) || id,
      count,
      uniqueDelegates: audienceUniqBySession.get(id)?.size || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const audienceByRoom = countBy(audienceScans, (s) => s.roomName || s.roomId);
  const topRooms = topN(audienceByRoom, 15);

  const zoneByName = countBy(zoneScans, (s) => s.zoneId);
  const topZones = topN(zoneByName, 15);

  const audienceByBadgeType = Object.fromEntries(countBy(audienceScans, (s) => s.badgeType));
  const checkinByBadgeType = Object.fromEntries(countBy(checkinScans, (s) => s.badgeType));

  return {
    global: {
      totalAudienceScans: audienceScans.length,
      totalCheckinScans: checkinScans.length,
      totalZoneScans: zoneScans.length,
      totalScans: allScans.length,
      uniqueAudienceDelegates: uniqueDelegates(audienceScans),
      uniqueCheckinDelegates: uniqueDelegates(checkinScans),
      uniqueZoneDelegates: uniqueDelegates(zoneScans),
      uniqueDelegatesAll: uniqueDelegates(allScans),
      // "Vues en salle" : delegues uniques scannes en salle, cumules par session
      // (audience reelle des conferences, dedoublonnee a l'interieur de chaque session).
      audienceUniqueDelegateSessions,
      distinctSessions: audienceBySession.size,
      distinctRooms: audienceByRoom.size,
      distinctZones: zoneByName.size,
    },
    audience: {
      scans: audienceScans,
      topSessions,
      topRooms,
      byHour: flowByDayHour(audienceScans),
      byDirection: directionBreakdown(audienceScans),
      byBadgeType: audienceByBadgeType,
    },
    checkin: {
      scans: checkinScans,
      byHour: flowByDayHour(checkinScans),
      byDirection: directionBreakdown(checkinScans),
      byBadgeType: checkinByBadgeType,
    },
    zone: {
      scans: zoneScans,
      topZones,
      byHour: flowByDayHour(zoneScans),
      byDirection: directionBreakdown(zoneScans),
    },
    combined: {
      byHour: flowByDayHour(allScans),
      uniqueDelegatesByDay: uniqueDelegatesByDay(allScans),
      uniqueDelegatesByDayByBadgeType: uniqueDelegatesByDayByBadgeType(allScans),
      uniqueDelegatesByDayAudience: uniqueDelegatesByDay(audienceScans),
      uniqueDelegatesByDayCheckin: uniqueDelegatesByDay(checkinScans),
      uniqueDelegatesByDayZone: uniqueDelegatesByDay(zoneScans),
    },
    all: allScans,
  };
}
