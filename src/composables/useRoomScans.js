import { ref, computed, readonly, onUnmounted } from "vue";
import {
  fetchRoomAudience,
  fetchCongressCheckin,
  fetchZoneAccess,
} from "@/api/elasticsearch.js";
import { computeAllScanStats } from "@/utils/computeScanStats.js";
import { debug } from "@/utils/debug.js";
import { AUTO_REFRESH_MS } from "@/constants.js";

export function useRoomScans(eventId, options = {}) {
  const { autoRefresh = false, getDateRange = null, getBadgeTypes = null } = options;

  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref(null);
  const progress = ref({ audience: 0, checkin: 0, zone: 0 });

  const audience = ref([]);
  const checkin = ref([]);
  const zone = ref([]);

  // Les 3 index ES (audience / checkin / zone) ecrivent tous le meme
  // identifiant cote Flink : delegate.id Mongo. Donc l'unicite se fait
  // directement sur cet ID, sans translation. Cf. computeScanStats.js.
  const stats = computed(() =>
    computeAllScanStats(
      {
        audience: audience.value,
        checkin: checkin.value,
        zone: zone.value,
      },
      {
        dateRange: getDateRange ? getDateRange() : null,
        badgeTypes: getBadgeTypes ? getBadgeTypes() : null,
      },
    ),
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
      // Dump complet des hits ES (_source) pour les 3 index, pour verification
      // jointure / structure des champs (notamment user_id keycloak vs delegate_id Mongo).
      if (a.length > 0) {
        debug.log("[Scans][audience] Structure du 1er hit (_source) :", a[0]._source);
        debug.log("[Scans][audience] Champs disponibles :", Object.keys(a[0]._source || {}));
      }
      debug.log(`[Scans][audience] Dump complet ES (${a.length} hits) :`, a.map((h) => h._source));
      if (c.length > 0) {
        debug.log("[Scans][checkin] Structure du 1er hit (_source) :", c[0]._source);
        debug.log("[Scans][checkin] Champs disponibles :", Object.keys(c[0]._source || {}));
      }
      debug.log(`[Scans][checkin] Dump complet ES (${c.length} hits) :`, c.map((h) => h._source));
      if (z.length > 0) {
        debug.log("[Scans][zone] Structure du 1er hit (_source) :", z[0]._source);
        debug.log("[Scans][zone] Champs disponibles :", Object.keys(z[0]._source || {}));
      }
      debug.log(`[Scans][zone] Dump complet ES (${z.length} hits) :`, z.map((h) => h._source));
      // Diagnostic placeholder '-' : combien de scans checkin/zone ont un
      // delegate_id == '-' (QR non matche cote Flink, exclu de l'unicite) ?
      const dashCheckin = c.filter((h) => (h._source?.delegate_id || h._source?.delegate_identity_id) === "-").length;
      const dashZone = z.filter((h) => (h._source?.delegate_id || h._source?.delegate_identity_id) === "-").length;
      debug.log(
        `[Scans] Placeholder '-' (QR non matches, exclus de l'unicite) : ${dashCheckin} checkin, ${dashZone} zone`,
      );
    } catch (e) {
      error.value = e.message;
      console.error("Failed to load room scans:", e);
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
    audience: readonly(audience),
    checkin: readonly(checkin),
    zone: readonly(zone),
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
