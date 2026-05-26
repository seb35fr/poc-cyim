import { ref, readonly, onUnmounted } from "vue";
import { fetchAllDelegates, fetchEventConfig } from "@/api/graphql.js";
import { computeAllStats } from "@/utils/computeStats.js";
import { debug } from "@/utils/debug.js";
import { AUTO_REFRESH_MS } from "@/constants.js";

export function useStatistics(eventId, options = {}) {
  const { autoRefresh = true } = options;
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

      // Debug : delegates checkes mais sans badge marque comme delivre.
      // Permet d'identifier les badges saisis manuellement / oublies cote desk.
      const missingDelivered = delegateResult.items.filter((d) => {
        if (!d.checkedInDate) return false;
        return !(d.badges || []).some((b) => b.deliveredAt);
      });
      if (missingDelivered.length > 0) {
        debug.log(
          `[${eventName.value}] ${missingDelivered.length} délégué(s) checked-in sans badge marqué délivré :`,
        );
        debug.table(
          missingDelivered.map((d) => ({
            id: d.id,
            familyName: d.familyName || "",
            givenName: d.givenName || "",
            checkedInDate: d.checkedInDate,
            badges: (d.badges || []).length,
          })),
        );
      }
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load statistics:", e);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  load();

  // Auto-refresh toutes les 10 minutes (desactivable pour l'event de comparaison).
  const nextRefreshAt = ref(Date.now() + AUTO_REFRESH_MS);
  if (autoRefresh) {
    const autoRefreshTimer = setInterval(() => {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_MS;
      load();
    }, AUTO_REFRESH_MS);
    onUnmounted(() => clearInterval(autoRefreshTimer));
  }

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
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_MS;
      load();
    },
  };
}
