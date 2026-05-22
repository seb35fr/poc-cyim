import { parisDateParts } from "./parisTime.js";

// Normalisation d'un hit ES vers un format unifie : audience/checkin/zone
// portent des noms de champs differents (user_id vs delegate_id, badge_type
// vs registration_type, session_id vs zone_id), on les ramene a un schema commun.
function normalizeAudience(hit) {
  const s = hit._source || {};
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

function uniqueDelegates(scans) {
  const set = new Set();
  for (const s of scans) if (s.delegateId) set.add(s.delegateId);
  return set.size;
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
  // { day: Set<delegateId> } puis cardinalite
  const sets = new Map();
  for (const s of scans) {
    if (!s.delegateId) continue;
    const dh = dayHourFromTimestamp(s.timestamp);
    if (!dh) continue;
    if (!sets.has(dh.day)) sets.set(dh.day, new Set());
    sets.get(dh.day).add(s.delegateId);
  }
  const out = {};
  for (const [day, set] of sets) out[day] = set.size;
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

export function computeAllScanStats({ audience = [], checkin = [], zone = [] }) {
  const audienceScans = audience.map(normalizeAudience);
  const checkinScans = checkin.map(normalizeCheckin);
  const zoneScans = zone.map(normalizeZone);
  const allScans = [...audienceScans, ...checkinScans, ...zoneScans];

  const audienceBySession = countBy(audienceScans, (s) => s.sessionId);
  const sessionLabels = sessionLabelMap(audienceScans);

  const topSessions = topN(audienceBySession, 20, (id) => sessionLabels.get(id) || id);

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
      uniqueDelegatesByDayAudience: uniqueDelegatesByDay(audienceScans),
      uniqueDelegatesByDayCheckin: uniqueDelegatesByDay(checkinScans),
      uniqueDelegatesByDayZone: uniqueDelegatesByDay(zoneScans),
    },
    all: allScans,
  };
}
