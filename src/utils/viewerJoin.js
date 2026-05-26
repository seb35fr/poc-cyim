// Jointure ES (Live / Replay) <-> delegates de la registration.
// Le user_id ES est un IDENTIFIANT KEYCLOAK. Cote delegate, on le retrouve
// dans contact.emailAddresses[].source.id quand source.type === "ACCOUNT"
// (lien email <-> compte Keycloak cote service contacts).
//
// Diagnostics (cf. _warnedFingerprints + checkCoverage* ci-dessous) : on
// emet un console.warn si la couverture Keycloak cote delegues tombe sous
// 50% (= le schema contacts a probablement bouge), ou si le taux de match
// cote hits ES devient anormalement bas (= les user_id ES ne sont plus des
// Keycloak IDs). Permet de detecter en prod les KPI "sans presence physique"
// silencieusement faux. Dedupe par fingerprint pour ne pas spammer la
// console — un warn par dataset.

// Module-level set des fingerprints deja warned (evite spam quand un meme
// computed se recalcule sur le meme dataset).
const _warnedFingerprints = new Set();

// Seuils en dessous desquels on warn. Modifiables si on veut etre plus strict.
const COVERAGE_WARN_THRESHOLD = 0.5;
const MIN_DATASET_SIZE = 50; // pas de warn sur les petits datasets / etat initial vide

export function getKeycloakId(delegate) {
  const emails = delegate?.contact?.emailAddresses;
  if (!Array.isArray(emails)) return null;
  const accountEmail = emails.find((e) => e?.source?.type === "ACCOUNT");
  return accountEmail?.source?.id || null;
}

export function hasValidCheckin(delegate) {
  if (!delegate?.checkedInDate) return false;
  const t = Date.parse(delegate.checkedInDate);
  return Number.isFinite(t);
}

// Map<keycloakId, { checkedIn: boolean, delegate }>
// First-write-wins en cas de collision (anomalie data : 2 delegues partagent
// le meme compte Keycloak).
//
// `datasetLabel` est juste un identifiant lisible pour le warn (ex: "current",
// "compare", "live", "replay"). Pas obligatoire mais utile pour distinguer
// quel KPI est affecte quand un warn arrive.
export function buildDelegateLookup(delegates, { datasetLabel = "" } = {}) {
  const map = new Map();
  let withKeycloakId = 0;
  const total = (delegates || []).length;

  for (const d of delegates || []) {
    const kcId = getKeycloakId(d);
    if (!kcId) continue;
    withKeycloakId++;
    if (map.has(kcId)) continue;
    map.set(kcId, { checkedIn: hasValidCheckin(d), delegate: d });
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
        console.warn(
          `[viewerJoin] Faible couverture Keycloak${label} : ${withKeycloakId}/${total} ` +
            `(${(coverage * 100).toFixed(1)}%) — la jointure live/replay va manquer ` +
            `${total - withKeycloakId} delegues. Verifier contact.emailAddresses[].source.type === "ACCOUNT" ` +
            `cote service contacts (les KPI "sans presence physique" seront sous-estimes).`,
        );
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

// Set<delegate.id Mongo> des delegues physiquement checked-in (date valide).
export function getCheckedInDelegateIds(delegates) {
  const set = new Set();
  for (const d of delegates || []) {
    if (d.id && hasValidCheckin(d)) set.add(d.id);
  }
  return set;
}
