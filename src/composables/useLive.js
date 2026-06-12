import { ref, computed, readonly, onUnmounted } from "vue";
import { fetchLiveViews, INDEX } from "@/api/elasticsearch.js";
import { fetchEventSessions } from "@/api/graphql.js";
import { computeLiveStats } from "@/utils/computeLiveStats.js";
import { debug } from "@/utils/debug.js";
import { pushDiagnostic } from "@/composables/useDiagnostics.js";
import { i18n } from "@/i18n/index.js";
import { AUTO_REFRESH_MS } from "@/constants.js";

// Live views ES + enrichissement sessions GraphQL.
// Instancie une fois par eventId au niveau StatisticsView, puis transmis aux
// tabs en prop. Le timer d'auto-refresh est clear via onUnmounted — pas de
// cache singleton (etait source d'accumulation de timers en HMR / appels en
// boucle si le composable etait monte plusieurs fois).
export function useLive(eventId, options = {}) {
  const { autoRefresh = false, getDateRange = null } = options;

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
  // Filtre date global (optionnel) propage en prop depuis StatisticsView.
  const stats = computed(() =>
    computeLiveStats(hits.value, sessionMap.value, getDateRange ? getDateRange() : null),
  );

  async function load() {
    const isRefresh = hits.value.length > 0;
    if (isRefresh) refreshing.value = true;
    else loading.value = true;
    error.value = null;
    progress.value = { loaded: 0, page: 0 };

    try {
      const [result, sessionsResult] = await Promise.all([
        fetchLiveViews(eventId, (p) => {
          progress.value = { loaded: p.loaded, page: p.page };
        }),
        fetchEventSessions(eventId).catch((e) => {
          console.warn("[Live] Echec fetch sessions GraphQL :", e.message);
          // Surface en UI : sans les sessions, titres/types/durees sont
          // absents des charts et de la table detail. L'admin doit le savoir
          // (et ne pas exporter un PDF tronque). Fingerprint par eventId
          // pour dedup en cas de retry.
          pushDiagnostic({
            severity: "warn",
            title: i18n.global.t("diagnostics.liveTitle"),
            message: i18n.global.t("diagnostics.liveMessage"),
            fingerprint: `useLive:sessions:${eventId}`,
          });
          return [];
        }),
      ]);
      hits.value = result;
      sessions.value = sessionsResult;
      if (result.length > 0) {
        debug.log(`[Live] (index: ${INDEX.live}) Structure du 1er hit ES (_source) :`, result[0]._source);
        debug.log(`[Live] (index: ${INDEX.live}) Champs disponibles :`, Object.keys(result[0]._source || {}));
      }
      debug.log(`[Live] (index: ${INDEX.live}) Dump complet ES (${result.length} hits) :`, result.map((h) => h._source));
      debug.log(`[Live] ${sessionsResult.length} sessions chargees depuis GraphQL`);
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load live views:", e);
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
    // Sessions GraphQL (id, title, type, start, end, duration) — exposees pour
    // que l'onglet Exports puisse filtrer par type de session.
    sessions: readonly(sessions),
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
