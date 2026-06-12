// Jointure ES (Live / Replay) <-> delegates de la registration.
// Le user_id ES est un IDENTIFIANT KEYCLOAK. Cote delegate, on le retrouve via
// DEUX sources (memes que la query contactByAccountId cote service contacts) :
//   1) contact.emailAddresses[].source.id  quand source.type === "ACCOUNT"
//      (lien email <-> compte Keycloak)
//   2) contact.externalIds[].value         quand type === "/kc"
//      (second rattachement Keycloak = branche fallback de contactByAccountId).
// La source 2 capte les delegues dont le compte Keycloak n'est PAS materialise
// dans emailAddresses : sans elle, la jointure les manque (couverture basse).
//
// Diagnostics : 2 warnings distincts.
// - Couverture Keycloak basse cote delegues (buildDelegateLookup) : remonte
//   en UI via pushDiagnostic ET en console. C'est un probleme actionnable
//   par l'admin qui voit le dashboard (il nous previent pour qu'on regarde
//   cote contacts MS).
// - Faible match ES cote hits (getRemoteOnlyDelegateIds) : console-only.
//   Symptome downstream d'un changement de pipeline Flink, l'admin n'y peut
//   rien — on le voit dans les logs internes.
// Dedupe par fingerprint pour ne pas spammer.

import { pushDiagnostic } from "@/composables/useDiagnostics.js";
import { i18n } from "@/i18n/index.js";
import { debug } from "@/utils/debug.js";

// Type d'externalId Keycloak cote service contacts (cf. getByExternalId({ type: "/kc" })).
const KC_EXTERNAL_ID_TYPE = "/kc";

// Module-level set des fingerprints deja warned (evite spam quand un meme
// computed se recalcule sur le meme dataset).
const _warnedFingerprints = new Set();

// Seuils en dessous desquels on warn. Modifiables si on veut etre plus strict.
const COVERAGE_WARN_THRESHOLD = 0.5;
const MIN_DATASET_SIZE = 50; // pas de warn sur les petits datasets / etat initial vide

// Source 1 : emailAddresses[].source.id (type ACCOUNT). Un contact peut avoir
// PLUSIEURS emailAddresses, chacune liee a un compte Keycloak distinct -> on
// collecte tous les ids (un viewer connecte avec n'importe lequel de ses comptes
// doit etre rapproche). Avant : seul le 1er via .find(), d'ou des "Inscrit non
// reconnu" pour les delegues multi-comptes.
function kcIdsFromEmails(delegate) {
  const emails = delegate?.contact?.emailAddresses;
  if (!Array.isArray(emails)) return [];
  const ids = [];
  for (const e of emails) {
    if (e?.source?.type === "ACCOUNT" && e.source.id) ids.push(e.source.id);
  }
  return ids;
}

// Source 2 : externalIds[].value (type "/kc"). Replique en memoire la branche
// fallback de contactByAccountId (getByExternalId type "/kc") sans requete
// reseau — la donnee externalIds est deja fetchee (cf. RPPS). Capte les comptes
// Keycloak non materialises dans emailAddresses.
function kcIdsFromExternalIds(delegate) {
  const externalIds = delegate?.contact?.externalIds;
  if (!Array.isArray(externalIds)) return [];
  const ids = [];
  for (const x of externalIds) {
    if (x?.value && String(x.type).toLowerCase() === KC_EXTERNAL_ID_TYPE) ids.push(x.value);
  }
  return ids;
}

// TOUS les identifiants Keycloak d'un delegue, dedupes, depuis les 2 sources.
export function getKeycloakIds(delegate) {
  return [...new Set([...kcIdsFromEmails(delegate), ...kcIdsFromExternalIds(delegate)])];
}

// Compat : 1er identifiant Keycloak (cf. getKeycloakIds pour la liste complete).
export function getKeycloakId(delegate) {
  return getKeycloakIds(delegate)[0] || null;
}

export function hasValidCheckin(delegate) {
  if (!delegate?.checkedInDate) return false;
  const t = Date.parse(delegate.checkedInDate);
  return Number.isFinite(t);
}

// RPPS : stocke comme externalId de type "RPPS" (case-insensitive) sur le
// Contact (Person). Source unique — reutilise par DataTab, buildSessionAttendance,
// buildDelegateJourney, buildCheckedInDelegates, buildScanExport.
export function getRpps(delegate) {
  const externalIds = delegate?.contact?.externalIds || [];
  const rpps = externalIds.find(
    (e) => e?.type?.toUpperCase() === "RPPS" || e?.type?.toLowerCase().includes("rpps"),
  );
  return rpps?.value || "";
}

// Map<keycloakId, { checkedIn: boolean, delegate }>
// Un delegue est indexe sous CHACUN de ses identifiants Keycloak (cf.
// getKeycloakIds — un contact multi-emails peut avoir plusieurs comptes).
// First-write-wins en cas de collision (anomalie data : 2 delegues partagent
// le meme compte Keycloak).
//
// `datasetLabel` est juste un identifiant lisible pour le warn (ex: "current",
// "compare", "live", "replay"). Pas obligatoire mais utile pour distinguer
// quel KPI est affecte quand un warn arrive.
export function buildDelegateLookup(delegates, { datasetLabel = "" } = {}) {
  const map = new Map();
  let withKeycloakId = 0;
  let onlyViaExternalKc = 0; // rattaches via externalIds "/kc" MAIS pas via emailAddresses
  const total = (delegates || []).length;

  for (const d of delegates || []) {
    const emailKc = kcIdsFromEmails(d);
    const externalKc = kcIdsFromExternalIds(d);
    const kcIds = [...new Set([...emailKc, ...externalKc])];
    if (kcIds.length === 0) continue;
    withKeycloakId++;
    if (emailKc.length === 0 && externalKc.length > 0) onlyViaExternalKc++;
    const checkedIn = hasValidCheckin(d);
    for (const kcId of kcIds) {
      if (map.has(kcId)) continue;
      map.set(kcId, { checkedIn, delegate: d });
    }
  }

  // Mesure (DEV-only) du gain de couverture apporte par la source externalIds
  // "/kc" : combien de delegues seraient manques si on ne regardait QUE
  // emailAddresses.source.id. Dedupe par fingerprint.
  if (onlyViaExternalKc > 0) {
    const fp = `kcgain:${datasetLabel}:${total}:${onlyViaExternalKc}`;
    if (!_warnedFingerprints.has(fp)) {
      _warnedFingerprints.add(fp);
      const label = datasetLabel ? ` (${datasetLabel})` : "";
      debug.log(
        `[viewerJoin] Couverture Keycloak${label} : ${withKeycloakId}/${total} délégués rattachés, ` +
          `dont ${onlyViaExternalKc} via externalIds "/kc" UNIQUEMENT ` +
          `(gain vs emailAddresses.source.id seul).`,
      );
    }
  }

  // Warn si la couverture Keycloak est anormalement basse : la jointure
  // live/replay va manquer beaucoup de delegues, les KPI "sans presence
  // physique" seront sous-estimes. Seuil 50%, taille mini 50 pour eviter
  // les warns sur les datasets vides au mount.
  if (total >= MIN_DATASET_SIZE) {
    const coverage = withKeycloakId / total;
    if (coverage < COVERAGE_WARN_THRESHOLD) {
      const fp = `lookup:${datasetLabel}:${total}:${withKeycloakId}`;
      if (!_warnedFingerprints.has(fp)) {
        _warnedFingerprints.add(fp);
        const label = datasetLabel ? ` (${datasetLabel})` : "";
        const pctStr = `${(coverage * 100).toFixed(1)}%`;
        const missing = total - withKeycloakId;
        // Console : message technique complet
        console.warn(
          `[viewerJoin] Faible couverture Keycloak${label} : ${withKeycloakId}/${total} ` +
            `(${pctStr}) — la jointure live/replay va manquer ${missing} delegues. ` +
            `Verifier contact.emailAddresses[].source.type === "ACCOUNT" cote service contacts ` +
            `(les KPI "sans presence physique" seront sous-estimes).`,
        );
        // UI : message synthetique pour l'admin qui consulte les stats.
        // Le fingerprint partage evite le double-push si plusieurs computeds
        // recalculent la meme lookup.
        pushDiagnostic({
          severity: "warn",
          title: i18n.global.t("diagnostics.dataAnomalyTitle"),
          message: i18n.global.t("diagnostics.kcCoverage", {
            pct: pctStr,
            label,
            missing,
            total,
          }),
          fingerprint: fp,
        });
      }
    }
  }

  return map;
}

// Set<delegate.id Mongo> des delegues qui ont consulte (via items.userId)
// ET qui ne sont PAS physiquement checked-in. Sert au calcul du KPI
// "total participants" (check-in + distanciels) et a chaque KPI
// "Sans presence physique" cote ViewersTab.
export function getRemoteOnlyDelegateIds(items, lookup, { datasetLabel = "" } = {}) {
  const set = new Set();
  if (!items || !lookup) return set;

  let matched = 0;
  let unmatched = 0;
  for (const it of items) {
    const kcId = it.userId;
    if (!kcId) continue;
    const entry = lookup.get(kcId);
    if (entry) {
      matched++;
      if (!entry.checkedIn && entry.delegate?.id) {
        set.add(entry.delegate.id);
      }
    } else {
      unmatched++;
    }
  }

  // Warn si plus de la moitie des hits ES n'a pas de delegue matchant. Soit
  // la lookup est mal construite (deja warned plus haut), soit les user_id
  // ES ne sont plus des Keycloak IDs (changement cote pipeline Flink).
  const totalHits = matched + unmatched;
  if (totalHits >= MIN_DATASET_SIZE) {
    const matchRate = matched / totalHits;
    if (matchRate < COVERAGE_WARN_THRESHOLD) {
      const fp = `remote:${datasetLabel}:${totalHits}:${matched}`;
      if (!_warnedFingerprints.has(fp)) {
        _warnedFingerprints.add(fp);
        const label = datasetLabel ? ` (${datasetLabel})` : "";
        console.warn(
          `[viewerJoin] Faible match ES${label} : ${matched}/${totalHits} ` +
            `(${(matchRate * 100).toFixed(1)}%) — ${unmatched} hits viewer non rapproches ` +
            `d'un delegue. Verifier que user_id ES correspond a contact.emailAddresses[].source.id ` +
            `(type ACCOUNT) cote pipeline Flink.`,
        );
      }
    }
  }

  return set;
}

// Set<delegate.id Mongo> de TOUS les delegues rapproches d'au moins un hit ES
// (live OU replay selon `items`), SANS filtre sur le check-in. Sert a croiser
// la population physiquement presente avec la participation distancielle
// (ex: "presents qui ont aussi suivi en live"). Pas de warn ici — la couverture
// est deja diagnostiquee par buildDelegateLookup / getRemoteOnlyDelegateIds.
export function getMatchedViewerDelegateIds(items, lookup) {
  const set = new Set();
  if (!items || !lookup) return set;
  for (const it of items) {
    const kcId = it.userId;
    if (!kcId) continue;
    const entry = lookup.get(kcId);
    if (entry?.delegate?.id) set.add(entry.delegate.id);
  }
  return set;
}

// Set<delegate.id Mongo> des delegues physiquement checked-in (date valide).
export function getCheckedInDelegateIds(delegates) {
  const set = new Set();
  for (const d of delegates || []) {
    if (d.id && hasValidCheckin(d)) set.add(d.id);
  }
  return set;
}
