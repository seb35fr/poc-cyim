import { ref, readonly } from "vue";
import { fetchAllDelegates, fetchEventConfig } from "../api/graphql.js";
import { computeAllStats } from "../utils/computeStats.js";

export function useStatistics(eventId) {
  const loading = ref(true);
  const error = ref(null);
  const progress = ref({ loaded: 0, total: 0, page: 0 });
  const stats = ref(null);
  const eventName = ref("");
  const delegates = ref([]);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const [config, delegateResult] = await Promise.all([
        fetchEventConfig(eventId).catch(() => null),
        fetchAllDelegates(eventId, (p) => {
          progress.value = p;
        }),
      ]);

      eventName.value = config?.branding?.name || eventId;
      delegates.value = delegateResult.items;
      stats.value = computeAllStats(delegateResult.items);
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load statistics:", e);
    } finally {
      loading.value = false;
    }
  }

  load();

  return {
    loading: readonly(loading),
    error: readonly(error),
    progress: readonly(progress),
    stats: readonly(stats),
    eventName: readonly(eventName),
    delegates: readonly(delegates),
    reload: load,
  };
}
