const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL;
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN;

async function gqlFetch(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error("GraphQL errors:", json.errors);
    throw new Error(json.errors.map((e) => e.message).join(", "));
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
  title
  createdAt
  updatedAt
  checkedInDate
  gdpr
  categories
  contactId
  firstOnboardingConnection
  primaryAddress {
    countryCode
    city
    country {
      code
    }
  }
  registrations {
    id
    type
    status
    categories
    accessDays
  }
  badges {
    id
    deliveredAt
    deliveredBy
  }
  contact {
    ... on Person {
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
