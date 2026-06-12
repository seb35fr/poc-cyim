// Construction de la liste des delegues ayant ete check-in (presents
// physiquement) sur le congres. La source de l'info de presence est le delegate
// lui-meme : `checkedInDate` (cf. hasValidCheckin). On expose 1 ligne par
// delegue check-in avec toutes ses informations utiles (identite, profession,
// RPPS, type de badge, statut, types/categories d'inscription, date de check-in).
//
// Reutilise la meme extraction de champs que buildSessionAttendance pour rester
// coherent (RPPS via contact.externalIds, type badge via delegateBadgeType...).

import { delegateBadgeType } from "./checkinByType.js";
import { hasValidCheckin } from "./viewerJoin.js";
import { parisDateTime } from "./parisTime.js";

// RPPS stocke comme externalId sur le Contact (Person), type "RPPS"
// (case-insensitive — cf. DataTab.getRpps).
function getRpps(d) {
  const externalIds = d?.contact?.externalIds || [];
  const rpps = externalIds.find(
    (e) => e?.type?.toUpperCase() === "RPPS" || e?.type?.toLowerCase().includes("rpps")
  );
  return rpps?.value || "";
}

function fmtParis(ts) {
  if (ts == null || ts === "") return "";
  return parisDateTime(ts);
}

function joinList(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean).join(", ") : "";
}

// Types et categories d'inscription : agreges sur l'ensemble des registrations
// du delegue (un delegue peut avoir plusieurs inscriptions).
function registrationTypes(d) {
  const types = (d.registrations || []).map((r) => r?.type).filter(Boolean);
  return [...new Set(types)].join(", ");
}

function registrationCategories(d) {
  const cats = [];
  for (const r of d.registrations || []) {
    for (const c of r?.categories || []) if (c) cats.push(c);
  }
  // Categories portees directement par le delegue (cf. champ d.categories).
  for (const c of d.categories || []) if (c) cats.push(c);
  return [...new Set(cats)].join(", ");
}

function delegateRow(d) {
  const practiceModes = joinList(d.practiceModes);
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
    ville: d.primaryAddress?.city || "",
    typeBadge: delegateBadgeType(d) || "",
    statut: d.status || "",
    typesInscription: registrationTypes(d),
    categories: registrationCategories(d),
    dateCheckin: fmtParis(d.checkedInDate),
  };
}

/**
 * Filtre les delegues check-in et construit les lignes d'export.
 * @param {Array} delegates - tous les delegues de l'event
 * @returns {Array<object>} rows pretes a etre serialisees en CSV (triees par nom)
 */
export function buildCheckedInDelegates(delegates = []) {
  return (delegates || [])
    .filter((d) => hasValidCheckin(d))
    .map(delegateRow)
    .sort((a, b) => {
      const an = `${a.nom} ${a.prenom}`.toLowerCase();
      const bn = `${b.nom} ${b.prenom}`.toLowerCase();
      return an.localeCompare(bn);
    });
}

export const CHECKED_IN_HEADERS = [
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
  "Ville",
  "Type badge",
  "Statut",
  "Types d'inscription",
  "Catégories",
  "Date de check-in",
];

export function checkedInRowToCsv(row) {
  return [
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
    row.ville,
    row.typeBadge,
    row.statut,
    row.typesInscription,
    row.categories,
    row.dateCheckin,
  ];
}
