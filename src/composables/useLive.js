import { ref, computed, readonly } from "vue";
import { fetchLiveViews } from "../api/elasticsearch.js";
import { fetchEventSessions } from "../api/graphql.js";
import { computeLiveStats } from "../utils/computeLiveStats.js";

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;

// Cache singleton par eventId : evite de re-fetcher Live a chaque montage d'un
// composant qui consomme useLive (Overview + LiveTab + ...). Le polling tourne
// au niveau module et est partage entre tous les consommateurs.
const cache = new Map(); // eventId -> instance partagee

export function useLive(eventId, options = {}) {
  if (cache.has(eventId)) return cache.get(eventId);

  const { autoRefresh = true } = options;

  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref(null);
  const progress = ref({ loaded: 0, page: 0 });

  const hits = ref([]);
  const sessions = ref([]);
  // Map sessionId -> { id, title, type, start, end, duration } construite a
  // partir des sessions fetchees via GraphQL. Utilisee pour enrichir les hits
  // live (l'ES live n'expose pas l'heure de fin / la duree de session).
  const sessionMap = computed(() => {
    const map = new Map();
    for (const s of sessions.value) if (s?.id) map.set(s.id, s);
    return map;
  });
  const stats = computed(() => computeLiveStats(hits.value, sessionMap.value));

  async function load() {
    const isRefresh = hits.value.length > 0;
    if (isRefresh) refreshing.value = true;
    else loading.value = true;
    error.value = null;
    progress.value = { loaded: 0, page: 0 };

    try {
      // Fetch parallele : hits live (ES) + sessions du congres (GraphQL)
      const [result, sessionsResult] = await Promise.all([
        fetchLiveViews(eventId, (p) => {
          progress.value = { loaded: p.loaded, page: p.page };
        }),
        fetchEventSessions(eventId).catch((e) => {
          console.warn("[Live] Echec fetch sessions GraphQL :", e.message);
          return [];
        }),
      ]);
      hits.value = result;
      sessions.value = sessionsResult;
      if (result.length > 0) {
        console.log("[Live] Structure du 1er hit ES (_source) :", result[0]._source);
        console.log("[Live] Champs disponibles :", Object.keys(result[0]._source || {}));
      }
      console.log(`[Live] ${sessionsResult.length} sessions chargees depuis GraphQL`);
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load live views:", e);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  load();

  const nextRefreshAt = ref(Date.now() + AUTO_REFRESH_INTERVAL);
  // Le timer tourne au niveau module : il survit aux montages/demontages des
  // composants. Pas de cleanup onUnmounted car l'instance est partagee — le
  // GC se fera au reload de la page.
  if (autoRefresh) {
    setInterval(() => {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_INTERVAL;
      load();
    }, AUTO_REFRESH_INTERVAL);
  }

  const instance = {
    loading: readonly(loading),
    refreshing: readonly(refreshing),
    error: readonly(error),
    progress: readonly(progress),
    hits: readonly(hits),
    stats,
    nextRefreshAt: readonly(nextRefreshAt),
    reload() {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_INTERVAL;
      load();
    },
  };
  cache.set(eventId, instance);
  return instance;
}
