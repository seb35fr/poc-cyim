// Parcours d'une personne : 1 ligne par session sur laquelle elle a interagi
// (scan audience physique + vue live + vue replay). Symetrique de
// buildSessionAttendance.js (qui regroupe par session). Cle de jointure :
//   - audience : delegate.id Mongo (direct sur s.delegateId)
//   - live / replay : keycloakId via contact.emailAddresses[].source.id quand
//     source.type === "ACCOUNT" (cf. viewerJoin.js)
// Si l'email n'est pas trouve dans les delegues, on tente un fallback ES
// (un viewer live/replay non rapproche peut quand meme avoir un email).

import { delegateBadgeType } from "./checkinByType.js";
import { parisDateTime, toEpochMs } from "./parisTime.js";
import { getKeycloakId, hasValidCheckin, getRpps } from "./viewerJoin.js";
import { countryName } from "./countries.js";

// Formatage unifie en heure de Paris (cf. buildSessionAttendance.js).
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

// Présence stockée "O"/"N" en interne, exposée YES/NO dans les CSV clients.
function yesNo(v) {
  if (v === "O") return "YES";
  if (v === "N") return "NO";
  return v || "";
}

/**
 * Resout les identifiants d'une personne a partir d'un email.
 * 1) cherche un delegue dont d.email matche (case-insensitive)
 * 2) sinon, tente un viewer ES (live ou replay) ayant cet email pour
 *    recuperer au moins un userId Keycloak.
 */
export function resolveByEmail(email, { delegates = [], liveItems = [], replayItems = [] } = {}) {
  const target = (email || "").trim().toLowerCase();
  if (!target) {
    return { delegate: null, delegateId: null, keycloakId: null, esFallback: null };
  }

  const delegate =
    (delegates || []).find((d) => (d?.email || "").toLowerCase() === target) || null;

  if (delegate) {
    return {
      delegate,
      delegateId: delegate.id || null,
      keycloakId: getKeycloakId(delegate),
      esFallback: null,
    };
  }

  // Pas de delegue : fallback ES (viewer non rapproche)
  const liveMatch = (liveItems || []).find((it) => (it?.email || "").toLowerCase() === target);
  const replayMatch = (replayItems || []).find((it) => (it?.email || "").toLowerCase() === target);
  const esFallback = liveMatch || replayMatch || null;

  return {
    delegate: null,
    delegateId: null,
    keycloakId: esFallback?.userId || null,
    esFallback,
  };
}

/**
 * Construit le parcours d'une personne : 1 ligne par session interaction.
 * Sources : audience scans (kind=audience), live items, replay items.
 *
 * @returns {{ delegate, keycloakId, esFallback, rows, counts }}
 *   counts = { physique, live, replay, sessions } (compteurs synthetiques pour l'UI)
 */
export function buildDelegateJourney({
  email,
  delegates = [],
  audienceScans = [],
  liveItems = [],
  replayItems = [],
  zoneScans = [],
  zoneNames = null,
} = {}) {
  const resolved = resolveByEmail(email, { delegates, liveItems, replayItems });
  const { delegate, delegateId, keycloakId, esFallback } = resolved;

  // Champs personne, repetes sur chaque ligne du CSV (facilite le merge multi-CSV).
  const personFields = delegate
    ? {
        delegateId: delegate.id || "",
        keycloakId: keycloakId || "",
        civilite: delegate.title || "",
        prenom: delegate.givenName || "",
        nom: delegate.familyName || "",
        email: delegate.email || "",
        societe: delegate.company || "",
        occupation: delegate.occupation || "",
        jobTitle: delegate.jobTitle || "",
        qualification: delegate.qualification || "",
        rpps: getRpps(delegate),
        pays:
          delegate.primaryAddress?.country?.code ||
          delegate.primaryAddress?.countryCode ||
          "",
        typeBadge: delegateBadgeType(delegate) || "",
        checkInCongres: hasValidCheckin(delegate) ? "O" : "N",
      }
    : {
        delegateId: "",
        keycloakId: keycloakId || "",
        civilite: "",
        prenom: "",
        nom: esFallback?.fullName || "",
        email: email || "",
        societe: "",
        occupation: "",
        jobTitle: "",
        qualification: "",
        rpps: "",
        pays: "",
        typeBadge: "",
        checkInCongres: "",
      };

  // Map<sessionId, row>
  const rows = new Map();
  const ensure = (sessionId, { title, start, end } = {}) => {
    let r = rows.get(sessionId);
    if (r) {
      if (title && !r.sessionTitle) r.sessionTitle = title;
      if (start && !r._rawStart) r._rawStart = start;
      if (end && !r._rawEnd) r._rawEnd = end;
      return r;
    }
    r = {
      ...personFields,
      kind: "session",
      sessionId,
      sessionTitle: title || "",
      _rawStart: start || null,
      _rawEnd: end || null,
      physiquePresent: "N",
      nbScansPhysiques: 0,
      premierScanPhysique: "",
      live: "N",
      nbVuesLive: 0,
      dureeLiveSec: 0,
      replay: "N",
      nbVuesReplay: 0,
      dureeReplaySec: 0,
    };
    rows.set(sessionId, r);
    return r;
  };

  // 1) Audience (presence physique en salle) - jointure delegateId Mongo
  if (delegateId) {
    for (const s of audienceScans || []) {
      if (s.delegateId !== delegateId) continue;
      if (!s.sessionId) continue;
      const r = ensure(s.sessionId, { title: s.sessionTitle });
      r.physiquePresent = "O";
      r.nbScansPhysiques += 1;
      const ts = fmtParis(s.timestamp);
      if (ts && (!r.premierScanPhysique || ts < r.premierScanPhysique)) {
        r.premierScanPhysique = ts;
      }
    }
  }

  // 2) Live - jointure keycloakId
  if (keycloakId) {
    for (const it of liveItems || []) {
      if (it.userId !== keycloakId) continue;
      if (!it.sessionId) continue;
      const r = ensure(it.sessionId, {
        title: it.sessionTitle,
        start: it.sessionStart,
        end: it.sessionEnd,
      });
      r.live = "O";
      r.nbVuesLive += 1;
      r.dureeLiveSec += it.duration || 0;
    }
  }

  // 3) Replay - idem
  if (keycloakId) {
    for (const it of replayItems || []) {
      if (it.userId !== keycloakId) continue;
      if (!it.sessionId) continue;
      const r = ensure(it.sessionId, {
        title: it.sessionTitle,
        start: it.sessionStart,
        end: it.sessionEnd,
      });
      r.replay = "O";
      r.nbVuesReplay += 1;
      r.dureeReplaySec += it.duration || 0;
    }
  }

  // 4) Zones (presence physique HORS session : stands, lounges, espaces...) -
  // jointure delegateId Mongo, comme l'audience. 1 ligne par zone distincte.
  // Une personne scannee dans une zone EST physiquement presente, meme sans
  // avoir suivi de session en salle -> compte dans "Presence physique".
  const zoneRows = new Map();
  if (delegateId) {
    for (const z of zoneScans || []) {
      if (z.delegateId !== delegateId || !z.zoneId) continue;
      let zr = zoneRows.get(z.zoneId);
      if (!zr) {
        zr = {
          ...personFields,
          kind: "zone",
          sessionId: `zone:${z.zoneId}`,
          sessionTitle: (zoneNames && zoneNames.get && zoneNames.get(z.zoneId)) || z.zoneId,
          _rawStart: null,
          _rawEnd: null,
          physiquePresent: "O",
          nbScansPhysiques: 0,
          premierScanPhysique: "",
          live: "N",
          nbVuesLive: 0,
          dureeLiveSec: 0,
          replay: "N",
          nbVuesReplay: 0,
          dureeReplaySec: 0,
        };
        zoneRows.set(z.zoneId, zr);
      }
      zr.nbScansPhysiques += 1;
      const ts = fmtParis(z.timestamp);
      if (ts && (!zr.premierScanPhysique || ts < zr.premierScanPhysique)) zr.premierScanPhysique = ts;
    }
  }

  // Tri : sessions par debut puis titre (sur ISO brut), puis zones (pas de date
  // de session) triees par libelle, ajoutees a la suite.
  const sessionList = [...rows.values()].sort((a, b) => {
    const sa = a._rawStart || "";
    const sb = b._rawStart || "";
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.sessionTitle || "").localeCompare(b.sessionTitle || "");
  });
  const zoneList = [...zoneRows.values()].sort((a, b) =>
    (a.sessionTitle || "").localeCompare(b.sessionTitle || ""),
  );
  const list = [...sessionList, ...zoneList];

  // Format final : dates Paris, on retire les champs internes
  const out = list.map((r) => {
    const { _rawStart, _rawEnd, ...rest } = r;
    return {
      ...rest,
      sessionStart: fmtParis(_rawStart),
      sessionEnd: fmtParis(_rawEnd),
    };
  });

  const counts = {
    // "Sessions interagies" = sessions du programme uniquement (hors zones).
    sessions: out.filter((r) => r.kind !== "zone").length,
    // Presence physique DISSOCIEE : salle (sessions suivies en salle) vs zones
    // (stands, lounges...). `physique` = total des deux (conserve pour compat).
    physiqueSalle: out.filter((r) => r.kind !== "zone" && r.physiquePresent === "O").length,
    zones: out.filter((r) => r.kind === "zone").length,
    physique: out.filter((r) => r.physiquePresent === "O").length,
    live: out.filter((r) => r.live === "O").length,
    replay: out.filter((r) => r.replay === "O").length,
  };

  return { delegate, keycloakId, esFallback, rows: out, counts };
}

export const JOURNEY_HEADERS = [
  "Délégué ID",
  "Keycloak ID",
  "Civilité",
  "Prénom",
  "Nom",
  "Email",
  "Société",
  "Profession (occupation)",
  "Fonction (jobTitle)",
  "Spécialité (qualification)",
  "RPPS",
  "Pays",
  "Pays (nom)",
  "Type badge",
  "Check-in congrès",
  "Nature",
  "Session/Zone ID",
  "Session/Zone",
  "Session début",
  "Session fin",
  "Présent physique",
  "Nb scans physiques",
  "1er scan physique",
  "Vu en live",
  "Nb vues live",
  "Durée live cumulée (mm:ss)",
  "Vu en replay",
  "Nb vues replay",
  "Durée replay cumulée (mm:ss)",
];

export function journeyRowToCsv(row) {
  return [
    row.delegateId,
    row.keycloakId,
    row.civilite,
    row.prenom,
    row.nom,
    row.email,
    row.societe,
    row.occupation,
    row.jobTitle,
    row.qualification,
    row.rpps,
    row.pays,
    countryName(row.pays),
    row.typeBadge,
    yesNo(row.checkInCongres),
    row.kind === "zone" ? "Zone" : "Session",
    row.sessionId,
    row.sessionTitle,
    row.sessionStart,
    row.sessionEnd,
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
