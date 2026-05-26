// Constantes globales du dashboard. Avant: dupliquees en magic numbers
// dans plusieurs composables/composants.

// Intervalle d'auto-refresh des sources (registrations, scans, live, replay).
// 10 minutes — meme cadence partout pour rester previsible cote utilisateur.
export const AUTO_REFRESH_MS = 10 * 60 * 1000;

// Tick du countdown affiche sous le bouton refresh.
export const COUNTDOWN_TICK_MS = 10_000;

// Pagination cursor cote GraphQL searchDelegates / event children.
export const DELEGATES_PAGE_SIZE = 500;
export const SESSIONS_PAGE_SIZE = 500;

// Seuil pour log warning sur les requetes GraphQL lentes (cf. api/graphql.js).
export const SLOW_QUERY_THRESHOLD_MS = 5000;

// Pagination ES (search_after) : taille de batch pour les scans/live/replay.
export const ES_BATCH_SIZE = 2000;
