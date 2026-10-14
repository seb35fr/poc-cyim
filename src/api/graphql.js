import { version as APP_VERSION } from "../../package.json";
const GRAPHQL_URL = import.meta.env.DEV ? "/api/graphql" : import.meta.env.VITE_GRAPHQL_URL;
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN;

// Identification du client aupres du router GraphQL (REG-1402) : en-tetes Apollo
// standard sur tout appel sortant. Identification seulement, pas d'auth.
const CLIENT_HEADERS = {
  "apollographql-client-name": "poc-stats-congres",
  "apollographql-client-version": APP_VERSION,
};

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
        ...CLIENT_HEADERS,
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

  const buildQuery = (fields) => `
    query SearchDelegates($eventId: ID!, $limit: Int!, $pageToken: String) {
      event(id: $eventId) {
        searchDelegates(
          limit: $limit
          pageToken: $pageToken
          sort: "createdAt"
          sortDir: "asc"
        ) {
          items { ${fields} }
          totalCount
          nextPageToken
        }
      }
    }
  `;
  const query = buildQuery(DELEGATE_FIELDS);
  // Repli si le backend renvoie une erreur de non-nullite sur practiceModes
  // (`[String!]!` alors qu'un delegue a un element null en base, ex. [null] :
  // le resolver registration ne protege que le null global via `?? []`). Une
  // seule erreur de ce type fait tomber TOUTE la page (non-null propage jusqu'a
  // items). On recharge alors la page SANS ce champ plutot que de bloquer le
  // dashboard. Correctif de fond : filtrer les null cote resolver registration.
  const queryWithoutPracticeModes = buildQuery(DELEGATE_FIELDS.replace(/^\s*practiceModes\s*$/m, ""));
  const isPracticeModesNullError = (e) =>
    /non-nullable field Delegate\.practiceModes/i.test(e?.message || "");

  do {
    const variables = { eventId, limit: PAGE_SIZE, pageToken };
    let data;
    try {
      data = await gqlFetch(query, variables);
    } catch (e) {
      if (!isPracticeModesNullError(e)) throw e;
      console.warn(
        `[GraphQL] SearchDelegates — page ${page + 1} : practiceModes contient un null en base, ` +
          `page rechargée SANS practiceModes (Mode d'exercice vide pour ces ${PAGE_SIZE} délégués max).`,
      );
      data = await gqlFetch(queryWithoutPracticeModes, variables);
    }
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

// Resout des identifiants Keycloak (user_id ES live/replay) -> contact, via la
// query racine `contactByAccountId` (service contacts : emailAddresses.source.id
// type ACCOUNT, repli externalIds "/kc"), avec l'adhesion du contact a CHAQUE
// organisateur de l'event (`membership(organizationId, includeFormer: true)`,
// service memberships — includeFormer pour pouvoir juger l'adhesion a la date
// de consultation, pas seulement a aujourd'hui).
// Batch aliase (1 requete / chunk) avec variables typees, chunks executes avec
// une concurrence limitee. Best-effort : un chunk en echec est simplement absent
// du resultat (les ids restent "non rapproches").
// Le contact porte aussi `apps` (usage de l'app mobile, cf. setApplicationInUse
// cote app) : sert a compter les utilisateurs de l'app NON inscrits. Champ servi
// par un subgraph tiers -> si la requete echoue avec `apps`, le chunk est rejoue
// sans (la resolution des membres ne doit pas en dependre).
// Retourne Map<accountId, { contact, memberships: Membership[] } | null>
// (null = aucun contact pour ce compte).
export async function fetchContactsByAccountIds(accountIds, organizerIds = [], { chunkSize = 40, concurrency = 3, onProgress } = {}) {
  const unique = [...new Set((accountIds || []).filter(Boolean))];
  const orgs = [...new Set((organizerIds || []).filter(Boolean))];
  const out = new Map();
  if (unique.length === 0) return out;

  const chunks = [];
  for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize));

  const membershipFields = orgs
    .map((_, k) => `m${k}: membership(organizationId: $o${k}, includeFormer: true) { type start end expired organization { id } }`)
    .join("\n          ");

  let withApps = true;
  async function runChunk(chunk) {
    const varDefs = [
      ...chunk.map((_, j) => `$a${j}: ID!`),
      ...orgs.map((_, k) => `$o${k}: ID!`),
    ].join(", ");
    const fields = chunk
      .map(
        (_, j) => `c${j}: contactByAccountId(accountId: $a${j}) {
        id
        ... on Person {
          givenName
          familyName
          honorificPrefix
          email { value }
          emailAddresses { value }
          address { city postalCode countryCode }
          externalIds { value type }
          ${withApps ? "apps { id lastUsed version platform }" : ""}
          ${membershipFields}
        }
      }`,
      )
      .join("\n      ");
    const query = `query ViewerContacts(${varDefs}) {\n      ${fields}\n    }`;
    const variables = {};
    chunk.forEach((id, j) => { variables[`a${j}`] = id; });
    orgs.forEach((id, k) => { variables[`o${k}`] = id; });
    try {
      const data = await gqlFetch(query, variables);
      chunk.forEach((id, j) => {
        const c = data?.[`c${j}`];
        if (!c) { out.set(id, null); return; }
        const memberships = orgs.map((_, k) => c[`m${k}`]).filter(Boolean);
        out.set(id, { contact: c, memberships });
      });
    } catch (e) {
      if (withApps) {
        console.warn("[GraphQL] fetchContactsByAccountIds — échec avec `apps`, nouvel essai sans :", e?.message || e);
        withApps = false;
        return runChunk(chunk);
      }
      console.warn(`[GraphQL] fetchContactsByAccountIds — chunk de ${chunk.length} échoué:`, e?.message || e);
    }
  }

  let next = 0;
  let done = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      await runChunk(chunk);
      done += chunk.length;
      if (onProgress) onProgress({ loaded: done, total: unique.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return out;
}

// Membres d'une organisation (organisateur de l'event) avec l'usage de leurs
// applications : `organization(id).members` (service memberships, Dgraph,
// pagination par curseur, pas de controle de permission) -> `Member.contact`
// (Person federe) -> `Person.apps` (service contacts-apps, collection `apps` :
// { contactId, application{id,...}, lastUsed }). Seule voie GraphQL pour
// atteindre les utilisateurs de l'app NON inscrits : contacts-apps n'expose
// aucune requete de liste (uniquement Person.apps + setApplicationInUse).
// includeFormer : anciens membres inclus (ils peuvent garder l'app).
// Retourne [{ contact, membership }] (contact null si non resolu).
export async function fetchOrganizationMembersWithApps(organizationId, { pageSize = 200, onProgress } = {}) {
  const query = `
    query OrgMembersApps($id: ID!, $first: Int!, $pageToken: ID) {
      organization(id: $id) {
        members(first: $first, pageToken: $pageToken, includeFormer: true) {
          totalCount
          nextPageToken
          items {
            membership { type start end expired }
            contact {
              id
              givenName
              familyName
              honorificPrefix
              email { value }
              emailAddresses { value }
              address { countryCode }
              externalIds { value type }
              apps { id lastUsed version platform }
            }
          }
        }
      }
    }
  `;
  const out = [];
  let pageToken = null;
  let total = 0;
  do {
    const data = await gqlFetch(query, { id: organizationId, first: pageSize, pageToken });
    const page = data?.organization?.members;
    if (!page) break;
    total = page.totalCount || total;
    for (const it of page.items || []) out.push({ contact: it.contact || null, membership: it.membership || null });
    pageToken = page.nextPageToken || null;
    if (onProgress) onProgress({ loaded: out.length, total });
  } while (pageToken);
  return out;
}

// Liste des congres pour l'ecran de selection (route "/" sans eventId).
// `events.filter` est un filtre Mongo brut cote event-microservice (caste par
// Mongoose, d'ou des dates ISO en string). Sans recherche : events en cours ou
// termines depuis `sinceMonths` mois (start <= maintenant, end >= maintenant - N
// mois). Avec recherche : regex sur le titre, toutes dates. Meme requete que la
// liste d'events de registration-admin (type CONGRESS, tri start desc,
// checkPermissions "event:delegates:view" pour masquer les events non visibles).
export async function fetchRecentEvents({ sinceMonths = 3, search = "", first = 50, pageToken = null } = {}) {
  const now = new Date();
  const since = new Date(now);
  since.setMonth(since.getMonth() - sinceMonths);
  const term = search.trim();
  const filter = term
    ? { title: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, ".*"), $options: "i" } }
    : { start: { $lte: now.toISOString() }, end: { $gte: since.toISOString() } };

  const buildQuery = (withPermissions) => `
    query RecentEvents($filter: Filter, $sortBy: Filter, $first: Int, $pageToken: ID${withPermissions ? ", $actions: [String!]" : ""}) {
      events(type: [CONGRESS], filter: $filter, sortBy: $sortBy, first: $first, pageToken: $pageToken) {
        items {
          id
          title
          picture
          start
          end
          ${withPermissions ? "checkPermissions(actions: $actions)" : ""}
        }
        totalCount
        nextPageToken
      }
    }
  `;
  const variables = { filter, first, pageToken, sortBy: [["start", "desc"]] };

  let data;
  let filtered = true;
  try {
    data = await gqlFetch(buildQuery(true), { ...variables, actions: ["event:delegates:view"] });
  } catch (err) {
    // checkPermissions (Cerbos) indisponible : on liste sans filtrer les droits.
    console.warn("[GraphQL] RecentEvents — checkPermissions indisponible, liste non filtrée :", err?.message);
    data = await gqlFetch(buildQuery(false), variables);
    filtered = false;
  }
  const result = data?.events || {};
  const items = (result.items || []).filter((e) => !filtered || e.checkPermissions?.length);
  return { items, nextPageToken: result.nextPageToken || null, totalCount: result.totalCount ?? items.length };
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

  // Organisateurs de l'event (organisations porteuses des adhesions) : sert a
  // identifier les viewers live/replay NON inscrits mais membres a jour (droit
  // d'acces au replay inclus dans l'adhesion, ex. JFR). Requete separee et
  // best-effort : un echec ne doit pas bloquer le chargement de la config.
  // Repli sur l'event racine (meme regle que Principal.membership cote
  // memberships : event { root { organizers } }).
  try {
    const orgQuery = `
      query GetOrganizers($eventId: ID!) {
        event(id: $eventId) {
          organizers { id displayName }
          root { organizers { id displayName } }
        }
      }
    `;
    const orgData = await gqlFetch(orgQuery, { eventId });
    const own = orgData?.event?.organizers || [];
    config.organizers = own.length ? own : orgData?.event?.root?.organizers || [];
  } catch {
    config.organizers = [];
  }

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
