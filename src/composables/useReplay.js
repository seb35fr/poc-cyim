import { ref, computed, readonly, onUnmounted } from "vue";
import { fetchReplayViews } from "@/api/elasticsearch.js";
import { fetchEventSessions } from "@/api/graphql.js";
import { computeReplayStats } from "@/utils/computeReplayStats.js";
import { debug } from "@/utils/debug.js";
import { pushDiagnostic } from "@/composables/useDiagnostics.js";
import { AUTO_REFRESH_MS } from "@/constants.js";

// VOD replay views ES + enrichissement sessions GraphQL. Meme structure que
// useLive — instancie une fois au niveau StatisticsView, propage en prop aux
// tabs consommateurs. setInterval clean via onUnmounted.
export function useReplay(eventId, options = {}) {
  const { autoRefresh = false } = options;

  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref(null);
  const progress = ref({ loaded: 0, page: 0 });

  const hits = ref([]);
  const sessions = ref([]);
  // Map sessionId -> session GraphQL pour enrichir les hits (titre, type,
  // start/end, duration). L'ES replay n'expose pas ces infos de facon fiable.
  const sessionMap = computed(() => {
    const map = new Map();
    for (const s of sessions.value) if (s?.id) map.set(s.id, s);
    return map;
  });
  const stats = computed(() => computeReplayStats(hits.value, sessionMap.value));

  async function load() {
    const isRefresh = hits.value.length > 0;
    if (isRefresh) refreshing.value = true;
    else loading.value = true;
    error.value = null;
    progress.value = { loaded: 0, page: 0 };

    try {
      const [result, sessionsResult] = await Promise.all([
        fetchReplayViews(eventId, (p) => {
          progress.value = { loaded: p.loaded, page: p.page };
        }),
        fetchEventSessions(eventId).catch((e) => {
          console.warn("[Replay] Echec fetch sessions GraphQL :", e.message);
          pushDiagnostic({
            severity: "warn",
            title: "Enrichissement Replay indisponible",
            message:
              "Impossible de récupérer la liste des sessions du congrès (GraphQL). " +
              "Les titres, types et durées des sessions vont manquer dans l'onglet Replay.",
            fingerprint: `useReplay:sessions:${eventId}`,
          });
          return [];
        }),
      ]);
      hits.value = result;
      sessions.value = sessionsResult;
      if (result.length > 0) {
        debug.log("[Replay] Structure du 1er hit ES (_source) :", result[0]._source);
        debug.log("[Replay] Champs disponibles :", Object.keys(result[0]._source || {}));
      }
      debug.log(`[Replay] Dump complet ES (${result.length} hits) :`, result.map((h) => h._source));
      debug.log(`[Replay] ${sessionsResult.length} sessions chargees depuis GraphQL`);
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load replay views:", e);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  load();

  // Auto-refresh pilotable (off par defaut, cf. useStatistics).
  const autoRefreshEnabled = ref(!!autoRefresh);
  const nextRefreshAt = ref(null);
  let timer = null;

  function startTimer() {
    if (timer) return;
    nextRefreshAt.value = Date.now() + AUTO_REFRESH_MS;
    timer = setInterval(() => {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_MS;
      load();
    }, AUTO_REFRESH_MS);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    nextRefreshAt.value = null;
  }
  function setAutoRefresh(enabled) {
    const next = !!enabled;
    if (next === autoRefreshEnabled.value) return;
    autoRefreshEnabled.value = next;
    if (next) startTimer();
    else stopTimer();
  }

  if (autoRefresh) startTimer();
  onUnmounted(stopTimer);

  return {
    loading: readonly(loading),
    refreshing: readonly(refreshing),
    error: readonly(error),
    progress: readonly(progress),
    hits: readonly(hits),
    stats,
    nextRefreshAt: readonly(nextRefreshAt),
    autoRefreshEnabled: readonly(autoRefreshEnabled),
    setAutoRefresh,
    reload() {
      if (autoRefreshEnabled.value) nextRefreshAt.value = Date.now() + AUTO_REFRESH_MS;
      load();
    },
  };
}
