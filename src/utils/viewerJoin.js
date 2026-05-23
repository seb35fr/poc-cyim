// Jointure ES (Live / Replay) <-> delegates de la registration.
// Le user_id ES est un IDENTIFIANT KEYCLOAK. Cote delegate, on le retrouve
// dans contact.emailAddresses[].source.id quand source.type === "ACCOUNT"
// (lien email <-> compte Keycloak cote service contacts).

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
// le meme compte Keycloak). Le caller peut emettre un warn si besoin.
export function buildDelegateLookup(delegates) {
  const map = new Map();
  for (const d of delegates || []) {
    const kcId = getKeycloakId(d);
    if (!kcId) continue;
    if (map.has(kcId)) continue;
    map.set(kcId, { checkedIn: hasValidCheckin(d), delegate: d });
  }
  return map;
}

// Set<delegate.id Mongo> des delegues qui ont consulte (via items.userId)
// ET qui ne sont PAS physiquement checked-in. Sert au calcul du KPI
// "total participants" (check-in + distanciels) et a chaque KPI
// "Sans presence physique" cote LiveTab/ReplayTab.
export function getRemoteOnlyDelegateIds(items, lookup) {
  const set = new Set();
  if (!items || !lookup) return set;
  for (const it of items) {
    const kcId = it.userId;
    if (!kcId) continue;
    const entry = lookup.get(kcId);
    if (entry && !entry.checkedIn && entry.delegate?.id) {
      set.add(entry.delegate.id);
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
