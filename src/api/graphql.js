const GRAPHQL_URL = import.meta.env.DEV ? "/api/graphql" : import.meta.env.VITE_GRAPHQL_URL;
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN;

// Extrait "OpName" depuis "query OpName(...)" / "mutation OpName(...)".
// Utilise dans les logs pour identifier la requete fautive sans dump le body.
function extractOpName(query) {
  const m = query.match(/^\s*(?:query|mutation|subscription)\s+(\w+)/);
  return m?.[1] || "anonymous";
}

// Heuristique : detecte si une erreur GraphQL (cote serveur) ressemble a
// un timeout. Couvre les messages explicites + les codes d'extensions
// communs (Apollo Gateway, Apollo Federation).
function looksLikeTimeout(err) {
  const msg = err?.message || "";
  if (/timeout|timed out|deadline|exceeded.*time|ECONNABORTED|ETIMEDOUT/i.test(msg)) return true;
  const code = err?.extensions?.code;
  return code === "GRAPHQL_TIMEOUT" || code === "REQUEST_TIMEOUT" || code === "GATEWAY_TIMEOUT";
}

async function gqlFetch(query, variables = {}) {
  const opName = extractOpName(query);
  const startedAt = performance.now();

  let res;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    // TypeError "Failed to fetch" = soit connexion refusee, soit timeout
    // navigateur/proxy/loadbalancer. La duree aide a distinguer les deux.
    const elapsed = Math.round(performance.now() - startedAt);
    const hint = elapsed > 10_000 ? " (probable timeout)" : "";
    console.error(
      `[GraphQL] ${opName} — network error after ${elapsed}ms${hint}:`,
      err?.message || err,
      { variables }
    );
    throw err;
  }

  const elapsed = Math.round(performance.now() - startedAt);

  if (!res.ok) {
    const isTimeout = res.status === 504 || res.status === 408 || res.status === 524;
    console.error(
      `[GraphQL] ${opName} — HTTP ${res.status} ${res.statusText} after ${elapsed}ms${
        isTimeout ? " (gateway timeout)" : ""
      }`,
      { variables }
    );
    throw new Error(`HTTP ${res.status} on ${opName}`);
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    console.error(`[GraphQL] ${opName} — invalid JSON after ${elapsed}ms:`, err);
    throw err;
  }

  if (json.errors) {
    const timeoutHit = json.errors.some(looksLikeTimeout);
    const label = `[GraphQL] ${opName} — ${json.errors.length} error(s) after ${elapsed}ms${
      timeoutHit ? " (timeout detected server-side)" : ""
    }`;
    if (timeoutHit) console.error(label, json.errors, { variables });
    else console.error(label, json.errors);
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  if (elapsed > 5000) {
    console.warn(`[GraphQL] ${opName} — slow query: ${elapsed}ms`, { variables });
  }

  return json.data;
}

const DELEGATE_FIELDS = `
  id
  givenName
  familyName
  email
  status
  gender
  company
  occupation
  jobTitle
  qualification
  practiceModes
  title
  createdAt
  updatedAt
  checkedInDate
  gdpr
  categories
  contactId
  externalContactId
  externalId
  firstOnboardingConnection
  notes
  primaryAddress {
    countryCode
    city
    zipCode
    country {
      code
    }
  }
  options
  registrations {
    id
    type
    status
    categories
    accessDays
  }
  badges {
    id
    type
    deliveredAt
    deliveredBy
    storage {
      publicUrl
    }
    qrCode {
      value
      decodedValue
    }
  }
  contact {
    ... on Person {
      externalIds {
        value
        type
      }
      emailAddresses {
        value
        source {
          id
          type
        }
      }
      memberships(first: 50, includeFormer: false) {
        items {
          type
        }
      }
      apps {
        id
        lastUsed
        version
        name
        platform
      }
    }
  }
`;

export async function fetchMetrics(eventId) {
  const query = `
    query GetMetrics($eventId: ID!) {
      event(id: $eventId) {
        metrics {
          registration {
            totalDelegatesCount
            checkedInCount
            notCheckedInCount
            firstOnboardingConnectionTotalCount
            withoutIdentityIdTotalCount
            statuses { value totalCount }
            categories { value totalCount }
            types { value totalCount }
            companies { value totalCount }
            accessDays { value totalCount }
          }
        }
      }
    }
  `;
  const data = await gqlFetch(query, { eventId });
  return data.event.metrics.registration;
}

export async function fetchAllDelegates(eventId, onProgress) {
  const PAGE_SIZE = 500;
  let allDelegates = [];
  let pageToken = null;
  let totalCount = 0;
  let page = 0;

  const query = `
    query SearchDelegates($eventId: ID!, $limit: Int!, $pageToken: String) {
      event(id: $eventId) {
        searchDelegates(
          limit: $limit
          pageToken: $pageToken
          sort: "createdAt"
          sortDir: "asc"
        ) {
          items { ${DELEGATE_FIELDS} }
          totalCount
          nextPageToken
        }
      }
    }
  `;

  do {
    const data = await gqlFetch(query, {
      eventId,
      limit: PAGE_SIZE,
      pageToken,
    });
    const result = data.event.searchDelegates;
    allDelegates = allDelegates.concat(result.items);
    totalCount = result.totalCount;
    pageToken = result.nextPageToken;
    page++;
    if (onProgress) {
      onProgress({
        loaded: allDelegates.length,
        total: totalCount,
        page,
      });
    }
  } while (pageToken && allDelegates.length < totalCount);

  return { items: allDelegates, totalCount };
}

export async function fetchEventSessions(eventId, onProgress) {
  // Fetch toutes les sessions d'un congres via event(id).children(eventType: SESSION).
  // Pagination par pageToken (max 500/page selon le defaut backend).
  const query = `
    query GetSessions($eventId: ID!, $pageToken: ID) {
      event(id: $eventId) {
        children(eventType: [SESSION], first: 500, pageToken: $pageToken) {
          items {
            id
            title
            type
            start(utc: true)
            end(utc: true)
            duration
            organizers {
              id
              displayName
            }
          }
          nextPageToken
        }
      }
    }
  `;
  let all = [];
  let pageToken = null;
  let page = 0;
  do {
    const data = await gqlFetch(query, { eventId, pageToken });
    const result = data?.event?.children;
    const items = result?.items || [];
    all = all.concat(items);
    pageToken = result?.nextPageToken || null;
    page++;
    if (onProgress) onProgress({ loaded: all.length, page });
  } while (pageToken);
  return all;
}

// Resout des location.id -> name via la query racine fédérée `location(id){name}`
// (meme mécanisme que xlsx-stats getRoomName). Utilise pour donner un libellé
// lisible aux scans de zone : le `zone_id` ES EST un location.id, mais l'index
// de scans ne porte que l'id, pas le nom. Best-effort : un id non résolu (zone
// supprimée, "-", erreur) est simplement absent de la Map -> fallback sur l'id.
// Batch aliasé (1 requête / chunk de 50) avec variables typées pour éviter
// toute injection. Retourne Map<id, name>.
export async function fetchLocationNames(ids) {
  const unique = [...new Set((ids || []).filter((x) => x && x !== "-"))];
  const out = new Map();
  if (unique.length === 0) return out;
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const varDefs = chunk.map((_, j) => `$id${j}: ID!`).join(", ");
    const fields = chunk.map((_, j) => `l${j}: location(id: $id${j}) { id name }`).join("\n      ");
    const query = `query ZoneNames(${varDefs}) {\n      ${fields}\n    }`;
    const variables = {};
    chunk.forEach((id, j) => { variables[`id${j}`] = id; });
    try {
      const data = await gqlFetch(query, variables);
      chunk.forEach((id, j) => {
        const name = data?.[`l${j}`]?.name;
        if (name) out.set(id, name);
      });
    } catch (e) {
      // Resolution best-effort : on n'echoue jamais le chargement des scans
      // pour un nom de zone manquant. On garde les ids bruts en fallback.
      console.warn(`[GraphQL] fetchLocationNames — chunk ${i / CHUNK} échoué:`, e?.message || e);
    }
  }
  return out;
}

export async function fetchEventConfig(eventId) {
  const query = `
    query GetConfig($eventId: ID!) {
      event(id: $eventId) {
        config {
          branding {
            name
            logoURL
          }
        }
      }
    }
  `;
  const data = await gqlFetch(query, { eventId });
  const config = data.event.config || {};

  // Requete separee via getEvent pour le mobileApplicationId
  try {
    const regQuery = `
      query GetRegConfig($eventId: ID!) {
        getEvent(id: $eventId) {
          config {
            mobileApplicationId
          }
        }
      }
    `;
    const regData = await gqlFetch(regQuery, { eventId });
    config.mobileAppId = regData.getEvent?.config?.mobileApplicationId || null;
  } catch {
    config.mobileAppId = null;
  }

  return config;
}
