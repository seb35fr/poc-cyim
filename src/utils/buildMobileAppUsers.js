// Export des personnes ayant utilise l'application mobile de l'event dans les
// N derniers mois (defaut 3). Meme regle que le KPI « App mobile » de
// computeStats (computeMobileApp / mobileAppCount) : une entree de
// `contact.apps` dont l'id = mobileApplicationId de la config event, avec un
// `lastUsed` posterieur a maintenant - N mois ; dedoublonnage par contactId
// (un contact porte par plusieurs delegues ne compte qu'une fois).
//
// Colonnes d'identite partagees avec les exports par session
// (delegateCoreFields : Id externe, categories, GDPR...).

import { delegateCoreFields } from "./buildSessionAttendance.js";
import { parisDateTime, toEpochMs } from "./parisTime.js";
import { countryName } from "./countries.js";

export const MOBILE_APP_SINCE_MONTHS = 3;

export const MOBILE_APP_USER_HEADERS = [
  "Délégué ID",
  "Id externe",
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
  "Pays (nom)",
  "Type badge",
  "Catégories",
  "GDPR",
  "Inscrit",
  "Statut inscription",
  "Check-in congrès",
  "Dernière utilisation app",
  "Version app",
  "Plateforme",
];

/**
 * @param {Array}  delegates    - delegues de l'event (pseudo-delegues viewers exclus)
 * @param {string} mobileAppId  - config.mobileApplicationId de l'event
 * @param {number|null} [sinceMonths=3] - null = toutes dates (toute utilisation connue)
 * @param {Array}  [extraUsers=[]] - utilisateurs NON inscrits (useViewerMembers.mobileAppUsersAll,
 *                                   deja filtres sur l'app ; borne de date appliquee ici)
 * @returns {Array<object>} 1 ligne par contact, tri par derniere utilisation decroissante
 */
export function buildMobileAppUsers(delegates = [], mobileAppId = null, sinceMonths = MOBILE_APP_SINCE_MONTHS, extraUsers = []) {
  if (!mobileAppId) return [];
  let sinceMs = 0;
  if (sinceMonths != null) {
    const since = new Date();
    since.setMonth(since.getMonth() - sinceMonths);
    sinceMs = since.getTime();
  }

  const seenContactIds = new Set();
  const rows = [];
  for (const d of delegates || []) {
    if (d?.isMemberViewer || d?.isViewerAlias) continue;
    if (d.contactId && seenContactIds.has(d.contactId)) continue;
    const app = (d.contact?.apps || []).find((a) => a?.id === mobileAppId && a.lastUsed);
    if (!app) continue;
    if (d.contactId) seenContactIds.add(d.contactId);
    const lastUsedMs = toEpochMs(app.lastUsed);
    if (!lastUsedMs || lastUsedMs < sinceMs) continue;
    rows.push({
      ...delegateCoreFields(d),
      inscrit: "O",
      statut: d.status || "",
      lastUsedMs,
      lastUsed: parisDateTime(lastUsedMs),
      version: app.version || "",
      platform: app.platform || "",
    });
  }
  // Non inscrits (reperes via les viewers live/replay) : identite issue du
  // contact, colonnes d'inscription vides. statut = adhesion (member, etc.).
  for (const u of extraUsers || []) {
    const lastUsedMs = toEpochMs(u.lastUsed);
    if (!lastUsedMs || lastUsedMs < sinceMs) continue;
    const rpps = (u.externalIds || []).find((x) => String(x?.type).toUpperCase() === "RPPS")?.value || "";
    rows.push({
      delegateId: "",
      externalId: "",
      civilite: u.title || "",
      prenom: u.givenName || "",
      nom: u.familyName || "",
      email: u.email || "",
      societe: "",
      occupation: "",
      jobTitle: "",
      qualification: "",
      practiceModes: "",
      rpps,
      pays: u.countryCode || "",
      typeBadge: u.status === "member" ? "Membre" : "",
      categories: "",
      gdpr: "",
      checkInCongres: "",
      inscrit: "N",
      statut: u.status === "member" ? "membre non inscrit" : u.status === "formerMember" ? "ancien membre non inscrit" : "non inscrit",
      lastUsedMs,
      lastUsed: parisDateTime(lastUsedMs),
      version: u.version || "",
      platform: u.platform || "",
    });
  }
  return rows.sort((a, b) => b.lastUsedMs - a.lastUsedMs);
}

const yesNo = (v) => (v === "O" ? "YES" : v === "N" ? "NO" : v || "");

export function mobileAppUserRowToCsv(row) {
  return [
    row.delegateId,
    row.externalId,
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
    countryName(row.pays),
    row.typeBadge,
    row.categories,
    yesNo(row.gdpr),
    yesNo(row.inscrit),
    row.statut,
    yesNo(row.checkInCongres),
    row.lastUsed,
    row.version,
    row.platform,
  ];
}
