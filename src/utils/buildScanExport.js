// Export "a plat" des scans ES (1 ligne = 1 scan), enrichi des informations du
// delegue et de son type de badge via la jointure deja appliquee cote
// computeScanStats (delegateId recupere/enrichi inclus). Deux variantes :
//   - scans de ZONE (stands, lounges...)
//   - scans de SESSION (audience = entree de salle)
//
// L'enrichissement va chercher les champs riches (profession, RPPS, pays...)
// DIRECTEMENT sur l'objet delegue charge (byMongoId), pas sur le scan : un scan
// '-' recupere a desormais un delegateId reel -> toutes ses infos remontent.

import { delegateCoreFields } from "./buildSessionAttendance.js";
import { parisDateTime, wallClock } from "./parisTime.js";

// En-tetes CSV (FR, non traduits — meme convention que les autres exports CSV).
const DELEGATE_HEADERS = [
  "delegateId",
  "badgeId",
  "Civilité",
  "Prénom",
  "Nom",
  "Email",
  "Société",
  "Profession",
  "Fonction",
  "Qualification",
  "Mode d'exercice",
  "RPPS",
  "Pays",
  "Type de badge",
  "Check-in congrès",
  "Rapproché",
];

export const ZONE_SCAN_HEADERS = [
  "Horodatage",
  "Zone",
  "Direction",
  "QR code",
  ...DELEGATE_HEADERS,
];

export const SESSION_SCAN_HEADERS = [
  "Horodatage",
  "SessionId",
  "Session",
  "Type de session",
  "Début session",
  "Fin session",
  "Salle",
  "Direction",
  "QR code",
  ...DELEGATE_HEADERS,
];

// Timestamp Flink (ms ou secondes) ou ISO -> "YYYY-MM-DD HH:mm:ss" heure de Paris.
function fmtParis(ts) {
  if (ts == null || ts === "") return "";
  let date;
  if (typeof ts === "number") date = new Date(ts < 1e12 ? ts * 1000 : ts);
  else if (typeof ts === "string" && /^\d+$/.test(ts)) {
    const n = Number(ts);
    date = new Date(n < 1e12 ? n * 1000 : n);
  } else date = new Date(ts);
  if (!date || !Number.isFinite(date.getTime())) return "";
  return parisDateTime(date.toISOString());
}

function dirLabel(dir) {
  if (dir === "in") return "Entrée";
  if (dir === "out") return "Sortie";
  return "";
}

// Colonnes delegue d'un scan : priorite a l'objet delegue charge (champs riches),
// repli sur les infos portees par le scan (deja enrichies cote computeScanStats).
function delegateColumns(scan, byMongoId) {
  const id = scan.delegateId && scan.delegateId !== "-" ? scan.delegateId : "";
  const d = id ? byMongoId.get(id) : null;
  if (d) {
    const f = delegateCoreFields(d);
    return {
      delegateId: f.delegateId,
      badgeId: scan.badgeId || "",
      civilite: f.civilite,
      prenom: f.prenom,
      nom: f.nom,
      email: f.email,
      societe: f.societe,
      occupation: f.occupation,
      jobTitle: f.jobTitle,
      qualification: f.qualification,
      practiceModes: f.practiceModes,
      rpps: f.rpps,
      pays: f.pays,
      typeBadge: f.typeBadge,
      checkIn: f.checkInCongres,
      matched: "O",
    };
  }
  return {
    delegateId: id,
    badgeId: scan.badgeId || "",
    civilite: "",
    prenom: "",
    nom: scan.fullName && scan.fullName !== "—" ? scan.fullName : "",
    email: scan.email || "",
    societe: "",
    occupation: "",
    jobTitle: "",
    qualification: "",
    practiceModes: "",
    rpps: "",
    pays: "",
    typeBadge: scan.badgeType && scan.badgeType !== "Inconnu" ? scan.badgeType : "",
    checkIn: "",
    matched: "N",
  };
}

function delegateCsvCells(c) {
  return [
    c.delegateId,
    c.badgeId,
    c.civilite,
    c.prenom,
    c.nom,
    c.email,
    c.societe,
    c.occupation,
    c.jobTitle,
    c.qualification,
    c.practiceModes,
    c.rpps,
    c.pays,
    c.typeBadge,
    c.checkIn,
    c.matched,
  ];
}

// ─── Scans de ZONE ───────────────────────────────────────────────────────────
export function buildZoneScanRows({ zoneScans = [], delegates = [], zoneNames = null } = {}) {
  const byMongoId = new Map((delegates || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const zname = zoneNames instanceof Map ? zoneNames : null;
  return (zoneScans || []).map((s) => {
    const c = delegateColumns(s, byMongoId);
    return {
      horodatage: fmtParis(s.timestamp),
      zone: (zname && s.zoneId && zname.get(s.zoneId)) || s.zoneId || "",
      direction: dirLabel(s.direction),
      qrCode: s.rawQrCode || "",
      ...c,
    };
  });
}

export function zoneScanRowToCsv(r) {
  return [r.horodatage, r.zone, r.direction, r.qrCode, ...delegateCsvCells(r)];
}

// ─── Scans de SESSION (audience = entree de salle) ────────────────────────────
// sessionTimesById : Map<sessionId, { start, end }> issue des sessions GraphQL
// (start/end en UTC) -> debut/fin convertis en heure de Paris. A defaut, on
// retombe sur le session_start brut du scan (heure murale SI-views, sans Z).
export function buildSessionScanRows({
  audienceScans = [],
  delegates = [],
  sessionTypeById = null,
  sessionTimesById = null,
} = {}) {
  const byMongoId = new Map((delegates || []).filter((d) => d?.id).map((d) => [d.id, d]));
  const typeMap = sessionTypeById instanceof Map ? sessionTypeById : null;
  const timeMap = sessionTimesById instanceof Map ? sessionTimesById : null;
  return (audienceScans || []).map((s) => {
    const c = delegateColumns(s, byMongoId);
    const type = s.sessionType || (typeMap && s.sessionId && typeMap.get(s.sessionId)) || "";
    const times = timeMap && s.sessionId ? timeMap.get(s.sessionId) : null;
    return {
      horodatage: fmtParis(s.timestamp),
      sessionId: s.sessionId || "",
      session: s.sessionTitle || s.sessionId || "",
      sessionType: type,
      // Début : session GraphQL (UTC -> Paris) sinon session_start brut du scan.
      sessionStart: times?.start ? parisDateTime(times.start) : wallClock(s.sessionStart),
      sessionEnd: times?.end ? parisDateTime(times.end) : "",
      salle: s.roomName || "",
      direction: dirLabel(s.direction),
      qrCode: s.rawQrCode || "",
      ...c,
    };
  });
}

export function sessionScanRowToCsv(r) {
  return [
    r.horodatage,
    r.sessionId,
    r.session,
    r.sessionType,
    r.sessionStart,
    r.sessionEnd,
    r.salle,
    r.direction,
    r.qrCode,
    ...delegateCsvCells(r),
  ];
}
