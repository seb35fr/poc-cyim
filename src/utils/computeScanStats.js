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
    badgeId: s.badge_id || null,
    fullName: s.user_fullName || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ") || "—",
    email: s.user_email || "",
    badgeType: s.badge_type || "Inconnu",
    sessionId: s.session_id || null,
    sessionTitle: s.session_title || "",
    // Type de session "precis" = champ ES session_type (alimente par Flink depuis
    // events.category SI-Views, comme l'export xlsx-stats et les index Live/Replay).
    sessionType: s.session_type || s.sessionType || "",
    sessionStart: s.session_start || null,
    roomId: s.room_id || null,
    roomName: s.room_name || "",
    zoneId: null,
    industryName: s.industry_name || "",
    direction: normalizeDirection(s.direction),
    approval: s.room_entry_approval || null,
    timestamp: s.timestamp || null,
    rawQrCode: s.raw_qr_code || "",
    // _source ES brut conserve pour l'inspection (modal "Details").
    raw: s,
  };
}

function normalizeCheckin(hit) {
  const s = hit._source || {};
  return {
    kind: "checkin",
    id: hit._id,
    delegateId: s.delegate_id || s.delegate_identity_id || null,
    badgeId: s.badge_id || null,
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
    raw: s,
  };
}

function normalizeZone(hit) {
  const s = hit._source || {};
  return {
    kind: "zone",
    id: hit._id,
    delegateId: s.delegate_id || s.delegate_identity_id || null,
    badgeId: s.badge_id || null,
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
    raw: s,
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

// Normalisation d'un QR code pour la jointure client-side. On genere PLUSIEURS
// cles candidates pour tolerer les ecarts de format entre le QR scanne
// (raw_qr_code) et le qrCode stocke sur le badge :
//   - cle "souple" : trim + minuscules (ex. "ER LDAS67…" -> "er ldas67…")
//   - cle "stricte" : alphanumerique uniquement (ignore espaces/prefixe ponctue
//     "ER ", casse) -> "erldas67…". Le payload base32 reste discriminant, donc
//     pas de collision en pratique.
// Memes cles des 2 cotes (indexation badges ET lookup scan) = coherence garantie.
function normQr(v) {
  return v == null ? "" : String(v).trim().toLowerCase();
}
function normQrStrict(v) {
  return v == null ? "" : String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}
// Cles candidates d'un QR, de la plus specifique a la plus tolerante (sans doublon).
function qrKeys(v) {
  const keys = [];
  const soft = normQr(v);
  if (soft) keys.push(soft);
  const strict = normQrStrict(v);
  if (strict && strict !== soft) keys.push(strict);
  return keys;
}

// Construit une Map<qr normalise, { id, fullName, email, badgeType }> a partir
// des delegues DEJA charges (avec leurs badges.qrCode.value/decodedValue). On
// indexe les DEUX formes (value + decodedValue) car le scanner peut emettre
// l'une ou l'autre. Permet de RE-ASSOCIER cote navigateur les scans dont Flink
// a ecrit delegate_id = '-' alors que le badge/delegue existe bel et bien en
// base (coquille de jointure cote pipeline). AUCUN appel reseau : tout vient
// des delegues en memoire.
export function buildQrDelegateLookup(delegates = []) {
  const map = new Map();
  for (const d of delegates) {
    if (!d?.id) continue;
    // fullName au format "givenName familyName (delegateId)" — meme forme que
    // ce que Flink ecrit dans user_fullName pour les lignes matchees (cf.
    // stats_room_scans.sql), pour la coherence du tableau/exports.
    const namePart = [d.givenName, d.familyName].filter(Boolean).join(" ");
    const base = {
      id: d.id,
      fullName: namePart ? `${namePart} (${d.id})` : `(${d.id})`,
      email: d.email || "",
    };
    const badges = Array.isArray(d.badges) ? d.badges : [];
    // Cle par delegateId : enrichit les scans DEJA associes (les champs ES
    // user_fullName/user_email/badge_type/badge_id sont souvent vides). badge = 1er.
    if (!map.has(d.id)) {
      map.set(d.id, { ...base, badgeId: badges[0]?.id || null, badgeType: badges[0]?.type || "Inconnu" });
    }
    // Cles par QR : recuperation des scans '-' + badge PRECIS (id + type) matche.
    for (const b of badges) {
      const e = { ...base, badgeId: b.id || null, badgeType: b.type || "Inconnu" };
      for (const raw of [b.qrCode?.value, b.qrCode?.decodedValue]) {
        for (const k of qrKeys(raw)) {
          if (!map.has(k)) map.set(k, e);
        }
      }
    }
  }
  return map;
}

// Remplit fullName/email/badgeType depuis le delegue rapproche QUAND la valeur ES
// est vide/placeholder (on ne surcharge pas une vraie valeur ES). Pose un flag par
// champ enrichi pour le marquage UI.
// Une valeur ES est "vide" si absente OU egale a un placeholder Flink. Les
// lignes non matchees ecrivent litteralement '-' (cf. CASE WHEN ... ELSE '-'
// cote stats_room_scans.sql) pour user_email/user_fullName/etc. — il faut donc
// les traiter comme vides, sinon l'enrichissement ne se declenche jamais.
function isBlankField(v) {
  if (v == null) return true;
  const t = String(v).trim();
  return t === "" || t === "-" || t === "—";
}

function applyDelegateFields(s, hit) {
  if (hit.fullName && hit.fullName !== "—" && isBlankField(s.fullName)) {
    s.fullName = hit.fullName;
    s.fullNameEnriched = true;
  }
  if (hit.email && isBlankField(s.email)) {
    s.email = hit.email;
    s.emailEnriched = true;
  }
  if (hit.badgeType && (isBlankField(s.badgeType) || s.badgeType === "Inconnu")) {
    s.badgeType = hit.badgeType;
    s.badgeTypeEnriched = true;
  }
  if (hit.badgeId && isBlankField(s.badgeId)) {
    s.badgeId = hit.badgeId;
    s.badgeIdEnriched = true;
  }
}

// Resout l'entree de lookup la plus precise pour un scan : match QR d'abord
// (badge exact -> badgeId/badgeType fiables), sinon par delegateId.
function lookupForScan(s, lookup) {
  for (const k of qrKeys(s.rawQrCode)) {
    const h = lookup.get(k);
    if (h) return h;
  }
  return isRealDelegateId(s.delegateId) ? lookup.get(s.delegateId) : null;
}

// Re-associe in place les scans non matches ('-'/null) via leur raw_qr_code et
// le lookup QR->delegue, puis enrichit nom/email/type de badge. Retourne le nombre
// de scans recuperes.
function recoverDelegateIds(scans, qrLookup) {
  if (!qrLookup || qrLookup.size === 0) return 0;
  let recovered = 0;
  for (const s of scans) {
    if (isRealDelegateId(s.delegateId)) continue;
    // Essaie les cles de la plus specifique a la plus tolerante ; 1ʳᵉ qui matche gagne.
    let hit = null;
    for (const k of qrKeys(s.rawQrCode)) {
      hit = qrLookup.get(k);
      if (hit) break;
    }
    if (!hit) continue;
    s.delegateId = hit.id;
    s.recovered = true; // delegateId recupere (marqueur diagnostic)
    applyDelegateFields(s, hit);
    recovered++;
  }
  return recovered;
}

// Enrichit fullName/email/badgeType des scans DEJA associes (delegateId reel) a
// partir du delegue charge — l'index ES laisse souvent ces champs vides.
function enrichFromLookup(scans, lookup) {
  if (!lookup || lookup.size === 0) return;
  for (const s of scans) {
    if (!isRealDelegateId(s.delegateId)) continue;
    const hit = lookupForScan(s, lookup);
    if (hit) applyDelegateFields(s, hit);
  }
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

// Presence par type de session (salle) : pour chaque session_type, le nombre de
// scans (presences cumulees) et de delegues distincts. Alimente le camembert
// "Presence par type de session" + le filtre cross-clic du Top sessions audience.
function audienceSessionTypes(audienceScans) {
  const map = new Map(); // type -> { scans, delegates:Set }
  for (const s of audienceScans) {
    const type = s.sessionType || "Non renseigné";
    if (!map.has(type)) map.set(type, { scans: 0, delegates: new Set() });
    const e = map.get(type);
    e.scans++;
    if (isRealDelegateId(s.delegateId)) e.delegates.add(s.delegateId);
  }
  return [...map.entries()]
    .map(([type, v]) => ({ type, scans: v.scans, uniqueDelegates: v.delegates.size }))
    .sort((a, b) => b.scans - a.scans);
}

// Engagement : nombre de sessions DISTINCTES suivies en salle par delegue.
// 1 ligne par delegue (filtre les '-' non matches), enrichie nom/email/type de
// badge (1er scan rencontre) pour l'export detaille. Plusieurs scans d'une meme
// session ne comptent qu'une fois (Set de sessionId). Trie par nb de sessions desc.
function sessionsPerDelegate(audienceScans) {
  const byDelegate = new Map(); // delegateId -> { sessions:Set, fullName, email, badgeType }
  for (const s of audienceScans) {
    if (!s.sessionId || !isRealDelegateId(s.delegateId)) continue;
    if (!byDelegate.has(s.delegateId)) {
      byDelegate.set(s.delegateId, {
        delegateId: s.delegateId,
        fullName: s.fullName,
        email: s.email,
        badgeType: s.badgeType,
        sessions: new Set(),
      });
    }
    byDelegate.get(s.delegateId).sessions.add(s.sessionId);
  }
  return [...byDelegate.values()]
    .map((d) => ({
      delegateId: d.delegateId,
      fullName: d.fullName,
      email: d.email,
      badgeType: d.badgeType,
      sessions: d.sessions.size,
    }))
    .sort((a, b) => b.sessions - a.sessions);
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
  const { dateRange = null, badgeTypes = null, qrLookup = null } = options;
  // Filtre date global : un scan n'est compte que si son timestamp tombe dans
  // la plage. Filtre badge type global : si un set de types est fourni (non
  // vide), on ne garde que les scans de ces types de badge.
  const inRange = makeInRange(dateRange);
  const hasBadgeFilter = badgeTypes && badgeTypes.size > 0;
  const keep = (s) =>
    (!dateRange || inRange(s.timestamp)) &&
    (!hasBadgeFilter || badgeTypes.has(s.badgeType));

  // Normalisation -> RE-ASSOCIATION client-side (avant filtrage : un type de
  // badge recupere doit etre pris en compte par le filtre badge) -> filtrage.
  // Note : l'audience (salle) est en INNER JOIN cote Flink, donc ses QR non
  // matches sont ABSENTS de l'index (rien a recuperer) ; seuls checkin et zone
  // (LEFT JOIN, placeholder '-') beneficient reellement de la recuperation.
  const audienceN = audience.map(normalizeAudience);
  const checkinN = checkin.map(normalizeCheckin);
  const zoneN = zone.map(normalizeZone);
  const recovered = {
    audience: recoverDelegateIds(audienceN, qrLookup),
    checkin: recoverDelegateIds(checkinN, qrLookup),
    zone: recoverDelegateIds(zoneN, qrLookup),
  };
  recovered.total = recovered.audience + recovered.checkin + recovered.zone;
  // Enrichit fullName/email/badgeType des scans deja associes (champs ES vides).
  enrichFromLookup(audienceN, qrLookup);
  enrichFromLookup(checkinN, qrLookup);
  enrichFromLookup(zoneN, qrLookup);

  const audienceScans = audienceN.filter(keep);
  const checkinScans = checkinN.filter(keep);
  const zoneScans = zoneN.filter(keep);
  const allScans = [...audienceScans, ...checkinScans, ...zoneScans];

  // Scans restant non associes APRES recuperation (sur les sets filtres affiches) :
  // vrais QR inconnus (badge d'un autre event, badge de test, QR illisible…).
  const stillUnmatched = (scans) => scans.filter((s) => !isRealDelegateId(s.delegateId)).length;
  const unmatched = {
    checkin: stillUnmatched(checkinScans),
    zone: stillUnmatched(zoneScans),
  };
  unmatched.total = unmatched.checkin + unmatched.zone;

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
      // Re-association client-side : scans dont le delegate_id Flink etait '-'
      // mais dont le QR matche un badge/delegue charge (coquille pipeline corrigee
      // a l'affichage). `unmatched` = scans restant vraiment orphelins.
      recoveredScans: recovered,
      unmatchedScans: unmatched,
    },
    audience: {
      scans: audienceScans,
      topSessions,
      topRooms,
      byHour: flowByDayHour(audienceScans),
      byDirection: directionBreakdown(audienceScans),
      byBadgeType: audienceByBadgeType,
      // Engagement : sessions salle distinctes par delegue (liste, 1 ligne/delegue).
      sessionsPerDelegate: sessionsPerDelegate(audienceScans),
      // Presence par type de session (salle) — camembert + filtre Top sessions.
      sessionTypes: audienceSessionTypes(audienceScans),
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
