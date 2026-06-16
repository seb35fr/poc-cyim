// Construction de la liste des "presents" pour UNE session, en croisant les
// 3 sources : scans audience (physique), live (ES), replay (ES). Resultat :
// 1 ligne = 1 personne, colonnes Physique/Live/Replay.
//
// Cles de jointure differentes selon la source :
//   - audience  : user_id ES = delegate.id Mongo (direct sur d.id)
//   - live/replay : user_id ES = Keycloak id, joint via
//     contact.emailAddresses[].source.id ou source.type === "ACCOUNT"
//
// Cle interne de dedup : delegateId Mongo quand connu, sinon keycloakId.
// Les viewers ES sans delegate matchant sont conserves (info ES brute).

import { delegateBadgeType } from "./checkinByType.js";
import { parisDateTime, toEpochMs } from "./parisTime.js";
import { hasValidCheckin, getRpps } from "./viewerJoin.js";

// Re-export pour compat (buildScanExport importe getRpps/delegateCoreFields ici).
export { getRpps };

// Le keycloakId est stocke dans contact.emailAddresses[i].source.id quand
// source.type === "ACCOUNT". Variante volontairement restreinte (ACCOUNT only,
// cf. getKeycloakId large de viewerJoin qui couvre aussi les externalIds).
function getKeycloakId(d) {
  const emails = d?.contact?.emailAddresses;
  if (!Array.isArray(emails)) return null;
  const account = emails.find((e) => e?.source?.type === "ACCOUNT");
  return account?.source?.id || null;
}

function buildDelegateLookup(delegates) {
  const byMongoId = new Map();
  const byKeycloakId = new Map();
  for (const d of delegates || []) {
    if (d.id) byMongoId.set(d.id, d);
    const kc = getKeycloakId(d);
    if (kc) byKeycloakId.set(kc, d);
  }
  return { byMongoId, byKeycloakId };
}

export function delegateCoreFields(d) {
  const practiceModes = Array.isArray(d.practiceModes)
    ? d.practiceModes.filter(Boolean).join(", ")
    : "";
  return {
    delegateId: d.id || "",
    civilite: d.title || "",
    prenom: d.givenName || "",
    nom: d.familyName || "",
    email: d.email || "",
    societe: d.company || "",
    occupation: d.occupation || "",
    jobTitle: d.jobTitle || "",
    qualification: d.qualification || "",
    practiceModes,
    rpps: getRpps(d),
    pays: d.primaryAddress?.country?.code || d.primaryAddress?.countryCode || "",
    typeBadge: delegateBadgeType(d) || "",
    checkInCongres: hasValidCheckin(d) ? "O" : "N",
    matched: true,
  };
}

function unmatchedCoreFields(es) {
  return {
    delegateId: "",
    civilite: "",
    prenom: "",
    nom: es?.fullName || "",
    email: es?.email || "",
    societe: "",
    occupation: "",
    jobTitle: "",
    qualification: "",
    practiceModes: "",
    rpps: "",
    pays: "",
    typeBadge: "",
    checkInCongres: "",
    matched: false,
  };
}

// Formatage unifie en heure de Paris pour les CSV : ISO "...Z" (GraphQL/Mongo) ou
// epoch Flink (ms/secondes). `toEpochMs` normalise, `parisDateTime` formate.
function fmtParis(ts) {
  return parisDateTime(toEpochMs(ts));
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Les indicateurs de presence sont stockes en interne "O"/"N" (concis pour la
// logique + l'UI). Dans les CSV livres aux clients on expose YES/NO (demande
// explicite). Une valeur vide (viewer ES non rapproche) reste vide.
function yesNo(v) {
  if (v === "O") return "YES";
  if (v === "N") return "NO";
  return v || "";
}

/**
 * Construit la liste des "presents" pour UNE session.
 * @param {object} args
 * @param {object} args.session       - { id, title, start, end } de la session
 * @param {Array} args.audienceScans  - scans audience normalises pour cette session
 * @param {Array} args.liveItems      - items live normalises (computeLiveStats.items) pour cette session
 * @param {Array} args.replayItems    - items replay normalises (computeReplayStats.items) pour cette session
 * @param {Array} args.delegates      - tous les delegues de l'event (pour enrichissement)
 * @returns {Array<object>} rows pretes a etre serialisees en CSV
 */
export function buildSessionAttendance({
  session = {},
  audienceScans = [],
  liveItems = [],
  replayItems = [],
  delegates = [],
} = {}) {
  const lookup = buildDelegateLookup(delegates);
  const rows = new Map(); // key -> row

  // Champs session repetes sur chaque ligne (cf. demande client : faciliter le
  // merge de plusieurs CSV par session dans un meme tableur).
  const sessionFields = {
    sessionId: session.id || "",
    sessionOrganizer: session.organizer || "",
    sessionTitle: session.title || "",
    sessionStart: fmtParis(session.start),
    sessionEnd: fmtParis(session.end),
  };

  function getOrCreate(key, delegate, esFallback) {
    let row = rows.get(key);
    if (row) return row;
    const core = delegate ? delegateCoreFields(delegate) : unmatchedCoreFields(esFallback);
    row = {
      ...sessionFields,
      ...core,
      physiquePresent: "N",
      qrCode: "",
      premierScanPhysique: "",
      nbScansPhysiques: 0,
      live: "N",
      dureeLiveSec: 0,
      nbVuesLive: 0,
      replay: "N",
      dureeReplaySec: 0,
      nbVuesReplay: 0,
    };
    rows.set(key, row);
    return row;
  }

  // --- 1) Audience (presence physique en salle) ---
  for (const s of audienceScans) {
    if (!s.delegateId || s.delegateId === "-") continue;
    const delegate = lookup.byMongoId.get(s.delegateId);
    const key = `mongo:${s.delegateId}`;
    const row = getOrCreate(key, delegate, s);
    row.physiquePresent = "O";
    row.nbScansPhysiques += 1;
    // QR reellement scanne a l'entree de salle (raw_qr_code) : trace de la presence.
    if (!row.qrCode && s.rawQrCode) row.qrCode = s.rawQrCode;
    const ts = fmtParis(s.timestamp);
    if (ts && (!row.premierScanPhysique || ts < row.premierScanPhysique)) {
      row.premierScanPhysique = ts;
    }
  }

  // --- 2) Live ---
  for (const it of liveItems) {
    if (!it.userId) continue;
    const delegate = lookup.byKeycloakId.get(it.userId);
    // Si on retrouve le delegate Mongo, on fusionne avec la cle Mongo
    // pour qu'un meme delegue n'apparaisse pas deux fois (physique vs live).
    const key = delegate?.id ? `mongo:${delegate.id}` : `kc:${it.userId}`;
    const row = getOrCreate(key, delegate, it);
    row.live = "O";
    row.dureeLiveSec += it.duration || 0;
    row.nbVuesLive += 1;
  }

  // --- 3) Replay ---
  for (const it of replayItems) {
    if (!it.userId) continue;
    const delegate = lookup.byKeycloakId.get(it.userId);
    const key = delegate?.id ? `mongo:${delegate.id}` : `kc:${it.userId}`;
    const row = getOrCreate(key, delegate, it);
    row.replay = "O";
    row.dureeReplaySec += it.duration || 0;
    row.nbVuesReplay += 1;
  }

  // Tri : delegues matches d'abord, puis par nom
  return [...rows.values()].sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const an = `${a.nom} ${a.prenom}`.toLowerCase();
    const bn = `${b.nom} ${b.prenom}`.toLowerCase();
    return an.localeCompare(bn);
  });
}

export const ATTENDANCE_HEADERS = [
  "Session ID",
  "Session titre",
  "Session début",
  "Session fin",
  "Délégué ID",
  "Civilité",
  "Prénom",
  "Nom",
  "Email",
  "Société",
  "Profession (occupation)",
  "Fonction (jobTitle)",
  "Spécialité (qualification)",
  "Mode d'exercice (practiceModes)",
  "RPPS",
  "Pays",
  "Type badge",
  "Check-in congrès",
  "Présent physique (session)",
  "Nb scans physiques",
  "1er scan physique",
  "Vu en live",
  "Nb vues live",
  "Durée live cumulée (mm:ss)",
  "Vu en replay",
  "Nb vues replay",
  "Durée replay cumulée (mm:ss)",
];

export function attendanceRowToCsv(row) {
  return [
    row.sessionId,
    row.sessionTitle,
    row.sessionStart,
    row.sessionEnd,
    row.delegateId,
    row.civilite,
    row.prenom,
    row.nom,
    row.email,
    row.societe,
    row.occupation,
    row.jobTitle,
    row.qualification,
    row.practiceModes,
    row.rpps,
    row.pays,
    row.typeBadge,
    yesNo(row.checkInCongres),
    yesNo(row.physiquePresent),
    row.nbScansPhysiques || "",
    row.premierScanPhysique,
    yesNo(row.live),
    row.nbVuesLive || "",
    formatDuration(row.dureeLiveSec),
    yesNo(row.replay),
    row.nbVuesReplay || "",
    formatDuration(row.dureeReplaySec),
  ];
}

// ─── Exports mono-source (presentiel / live / replay) ──────────────────────
// Memes lignes que buildSessionAttendance, mais filtrees sur UNE source de
// presence et serialisees avec les seules colonnes pertinentes pour celle-ci.
// On reutilise buildSessionAttendance (qui croise deja les 3 sources) puis on
// filtre : evite de dupliquer la logique de jointure delegate/keycloak.

// Champs d'identite communs a tous les exports mono-source.
const IDENTITY_HEADERS = [
  "Session ID",
  "Session organisateur",
  "Session titre",
  "Session début",
  "Session fin",
  "Délégué ID",
  "Civilité",
  "Prénom",
  "Nom",
  "Email",
  "Société",
  "Profession (occupation)",
  "Fonction (jobTitle)",
  "Spécialité (qualification)",
  "Mode d'exercice (practiceModes)",
  "RPPS",
  "Pays",
  "Type badge",
  "Check-in congrès",
];

function identityCols(row) {
  return [
    row.sessionId,
    row.sessionOrganizer,
    row.sessionTitle,
    row.sessionStart,
    row.sessionEnd,
    row.delegateId,
    row.civilite,
    row.prenom,
    row.nom,
    row.email,
    row.societe,
    row.occupation,
    row.jobTitle,
    row.qualification,
    row.practiceModes,
    row.rpps,
    row.pays,
    row.typeBadge,
    yesNo(row.checkInCongres),
  ];
}

// Présentiel (présence physique en salle) : uniquement les personnes scannées.
export const PHYSICAL_ATTENDANCE_HEADERS = [
  ...IDENTITY_HEADERS,
  "QR code",
  "Nb scans physiques",
  "1er scan physique",
];

export function physicalAttendanceRowToCsv(row) {
  return [...identityCols(row), row.qrCode || "", row.nbScansPhysiques || "", row.premierScanPhysique];
}

// Live : uniquement les personnes ayant consulté du live.
export const LIVE_ATTENDANCE_HEADERS = [
  ...IDENTITY_HEADERS,
  "Nb vues live",
  "Durée live cumulée (mm:ss)",
];

export function liveAttendanceRowToCsv(row) {
  return [...identityCols(row), row.nbVuesLive || "", formatDuration(row.dureeLiveSec)];
}

// Replay : uniquement les personnes ayant consulté du replay.
export const REPLAY_ATTENDANCE_HEADERS = [
  ...IDENTITY_HEADERS,
  "Nb vues replay",
  "Durée replay cumulée (mm:ss)",
];

export function replayAttendanceRowToCsv(row) {
  return [...identityCols(row), row.nbVuesReplay || "", formatDuration(row.dureeReplaySec)];
}

// Filtre les lignes d'une session sur une seule source de présence.
//   source = "physique" | "live" | "replay"
export function filterAttendanceBySource(rows, source) {
  const flag = source === "live" ? "live" : source === "replay" ? "replay" : "physiquePresent";
  return (rows || []).filter((r) => r[flag] === "O");
}
