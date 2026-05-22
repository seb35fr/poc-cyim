import { ref, computed, readonly, onUnmounted } from "vue";
import {
  fetchRoomAudience,
  fetchCongressCheckin,
  fetchZoneAccess,
} from "../api/elasticsearch.js";
import { computeAllScanStats } from "../utils/computeScanStats.js";

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;

export function useRoomScans(eventId, options = {}) {
  const { autoRefresh = true } = options;

  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref(null);
  const progress = ref({ audience: 0, checkin: 0, zone: 0 });

  const audience = ref([]);
  const checkin = ref([]);
  const zone = ref([]);

  const stats = computed(() =>
    computeAllScanStats({
      audience: audience.value,
      checkin: checkin.value,
      zone: zone.value,
    }),
  );

  async function load() {
    const isRefresh = audience.value.length || checkin.value.length || zone.value.length;
    if (isRefresh) refreshing.value = true;
    else loading.value = true;
    error.value = null;
    progress.value = { audience: 0, checkin: 0, zone: 0 };

    try {
      const [a, c, z] = await Promise.all([
        fetchRoomAudience(eventId, (p) => (progress.value = { ...progress.value, audience: p.loaded })),
        fetchCongressCheckin(eventId, (p) => (progress.value = { ...progress.value, checkin: p.loaded })),
        fetchZoneAccess(eventId, (p) => (progress.value = { ...progress.value, zone: p.loaded })),
      ]);
      audience.value = a;
      checkin.value = c;
      zone.value = z;
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load room scans:", e);
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  load();

  const nextRefreshAt = ref(Date.now() + AUTO_REFRESH_INTERVAL);
  if (autoRefresh) {
    const timer = setInterval(() => {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_INTERVAL;
      load();
    }, AUTO_REFRESH_INTERVAL);
    onUnmounted(() => clearInterval(timer));
  }

  return {
    loading: readonly(loading),
    refreshing: readonly(refreshing),
    error: readonly(error),
    progress: readonly(progress),
    audience: readonly(audience),
    checkin: readonly(checkin),
    zone: readonly(zone),
    stats,
    nextRefreshAt: readonly(nextRefreshAt),
    reload() {
      nextRefreshAt.value = Date.now() + AUTO_REFRESH_INTERVAL;
      load();
    },
  };
}
