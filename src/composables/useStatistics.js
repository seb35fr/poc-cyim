import { ref, readonly, onUnmounted } from "vue";
import { fetchAllDelegates, fetchEventConfig } from "../api/graphql.js";
import { computeAllStats } from "../utils/computeStats.js";

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function useStatistics(eventId) {
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref(null);
  const progress = ref({ loaded: 0, total: 0, page: 0 });
  const stats = ref(null);
  const eventName = ref("");
  const mobileAppId = ref(null);
  const delegates = ref([]);

  async function load() {
    const isRefresh = stats.value !== null;
    if (isRefresh) {
      refreshing.value = true;
    } else {
      loading.value = true;
    }
    error.value = null;
    progress.value = { loaded: 0, total: 0, page: 0 };

    try {
      const [config, delegateResult] = await Promise.all([
        fetchEventConfig(eventId).catch(() => null),
        fetchAllDelegates(eventId, (p) => {
          progress.value = p;
        }),
      ]);

      eventName.value = config?.branding?.name || eventId;
      mobileAppId.value = config?.mobileAppId || null;
      delegates.value = delegateResult.items;
      stats.value = computeAllStats(delegateResult.items, mobileAppId.value);
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load statistics:", e);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  load();

  // Auto-refresh toutes les 10 minutes
  const nextRefreshAt = ref(Date.now() + AUTO_REFRESH_INTERVAL);
  const autoRefreshTimer = setInterval(() => {
    nextRefreshAt.value = Date.now() + AUTO_REFRESH_INTERVAL;
    load();
  }, AUTO_REFRESH_INTERVAL);

  onUnmounted(() => clearInterval(autoRefreshTimer));

  return {
    loading: readonly(loading),
    refreshing: readonly(refreshing),
    error: readonly(error),
    progress: readonly(progress),
    stats: readonly(stats),
    eventName: readonly(eventName),
    delegates: readonly(delegates),
    mobileAppId: readonly(mobileAppId),
    nextRefreshAt: readonly(nextRefreshAt),
    reload() {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_INTERVAL;
      load();
    },
  };
}
