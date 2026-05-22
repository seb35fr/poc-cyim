// Client Elasticsearch direct depuis le browser.
//
// En dev : passe par le proxy Vite /api/es (cf. vite.config.js) qui forwarde
// vers VITE_ES_URL (defaut http://192.168.201.176:9200). En prod il faudra
// proxyfier /api/es cote nginx vers le cluster ES interne.
//
// Aucune auth ES configuree cote cluster (cf. xlsx-stats/datasources/els.js).

const ES_BASE = import.meta.env.DEV ? "/api/es" : import.meta.env.VITE_ES_URL;
const BATCH_SIZE = 2000;

// Noms d'index exacts (cf. congress/microservices/xlsx-stats/datasources/events.js).
// Attention : l'index audience utilise des tirets, les deux autres des underscores.
const INDEX = {
  audience: "stats_user__onsite-audience-per-session-per-user",
  checkin: "stats_user__onsite_congress_checkin_per_user",
  zone: "stats_user__onsite_zone_checkin_per_user",
  live: "stats_user__live-view-duration-per-user-per-session",
  replay: "stats_user__vod-view-per-user-per-session-per-origin",
};

async function esSearch(index, body) {
  const res = await fetch(`${ES_BASE}/${encodeURIComponent(index)}/_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ES ${index} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Pagination search_after, equivalent de Els.fetchAllHits dans xlsx-stats.
// onProgress({ index, loaded, page }) est appele apres chaque batch.
async function fetchAllHits(index, query, onProgress) {
  const hits = [];
  const body = {
    query,
    sort: [{ _id: "desc" }],
    size: BATCH_SIZE,
  };
  let page = 0;
  while (true) {
    const result = await esSearch(index, body);
    const batch = result?.hits?.hits || [];
    if (batch.length === 0) break;
    hits.push(...batch);
    page++;
    if (onProgress) onProgress({ index, loaded: hits.length, page });
    if (batch.length < BATCH_SIZE) break;
    body.search_after = batch[batch.length - 1].sort;
  }
  return hits;
}

function termCongress(congressId) {
  return { term: { "congress_id.keyword": congressId } };
}

export async function fetchRoomAudience(congressId, onProgress) {
  // stats_user__onsite-audience-per-session-per-user : 1 doc par (user, session)
  return fetchAllHits(INDEX.audience, termCongress(congressId), onProgress);
}

export async function fetchCongressCheckin(congressId, onProgress) {
  return fetchAllHits(INDEX.checkin, termCongress(congressId), onProgress);
}

export async function fetchZoneAccess(congressId, onProgress) {
  return fetchAllHits(INDEX.zone, termCongress(congressId), onProgress);
}

export async function fetchLiveViews(congressId, onProgress) {
  // stats_user__live-view-duration-per-user-per-session : 1 doc par (user, session)
  // Exclut les comptes internes CYIM (testeurs) pour rester sur les vrais delegues.
  const query = {
    bool: {
      must: [termCongress(congressId)],
      must_not: [{ wildcard: { "user_email.keyword": "*@cyim.com" } }],
    },
  };
  return fetchAllHits(INDEX.live, query, onProgress);
}

export async function fetchReplayViews(congressId, onProgress) {
  // stats_user__vod-view-per-user-per-session-per-origin : 1 doc par
  // (user, session, origin). Exclut les comptes internes CYIM (testeurs).
  const query = {
    bool: {
      must: [termCongress(congressId)],
      must_not: [{ wildcard: { "user_email.keyword": "*@cyim.com" } }],
    },
  };
  return fetchAllHits(INDEX.replay, query, onProgress);
}

export { INDEX };
