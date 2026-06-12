import { ref, computed, readonly, onUnmounted } from "vue";
import {
  fetchRoomAudience,
  fetchCongressCheckin,
  fetchZoneAccess,
  INDEX,
} from "@/api/elasticsearch.js";
import { fetchLocationNames } from "@/api/graphql.js";
import { computeAllScanStats } from "@/utils/computeScanStats.js";
import { debug } from "@/utils/debug.js";
import { AUTO_REFRESH_MS } from "@/constants.js";

export function useRoomScans(eventId, options = {}) {
  const {
    autoRefresh = false,
    getDateRange = null,
    getBadgeTypes = null,
    // Lookup QR->delegue (Map) pour re-associer client-side les scans '-'. Fonction
    // pour rester reactif au chargement des delegues. Cf. buildQrDelegateLookup.
    getQrLookup = null,
  } = options;

  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref(null);
  const progress = ref({ audience: 0, checkin: 0, zone: 0 });

  const audience = ref([]);
  const checkin = ref([]);
  const zone = ref([]);
  // Map<zone_id (= location.id), name> resolue via le gateway GraphQL.
  // Cache cross-refresh : on ne re-resout que les ids inconnus.
  const zoneNames = ref(new Map());

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
        qrLookup: getQrLookup ? getQrLookup() : null,
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
      // Dump explicite (always-on) du contenu ES brut des scans de salle (audience),
      // pour inspecter les champs disponibles (session_id, room_name, badge_type, ...).
      console.log(`[Scans][salle/audience] (index: ${INDEX.audience}) ${a.length} hit(s) ES — _source :`, a.map((h) => h._source));
      if (a.length > 0) {
        console.log(`[Scans][salle/audience] (index: ${INDEX.audience}) champs du 1er hit :`, Object.keys(a[0]._source || {}));
        console.table(a.map((h) => h._source));
      }
      // Dump explicite (always-on) du contenu ES brut des scans de zone, pour
      // inspecter les champs disponibles (zone_id, direction, delegate_id, ...).
      console.log(`[Scans][zone] (index: ${INDEX.zone}) ${z.length} hit(s) ES — _source :`, z.map((h) => h._source));
      if (z.length > 0) {
        console.log(`[Scans][zone] (index: ${INDEX.zone}) champs du 1er hit :`, Object.keys(z[0]._source || {}));
        console.table(z.map((h) => h._source));
      }
      // Resolution des noms de zone (zone_id = location.id) via le gateway.
      // Best-effort, hors du chemin critique : on ne bloque/echoue jamais le
      // chargement des scans si la resolution plante. On ne resout que les ids
      // pas encore en cache.
      const zoneIds = [...new Set(z.map((h) => h._source?.zone_id).filter((id) => id && id !== "-"))];
      const missing = zoneIds.filter((id) => !zoneNames.value.has(id));
      if (missing.length > 0) {
        try {
          const resolved = await fetchLocationNames(missing);
          if (resolved.size > 0) {
            const merged = new Map(zoneNames.value);
            for (const [k, v] of resolved) merged.set(k, v);
            zoneNames.value = merged; // nouvelle ref -> reactivite
          }
        } catch (e) {
          debug.log("[Scans][zone] resolution noms de zone echouee:", e?.message || e);
        }
      }
      // Dump complet des hits ES (_source) pour les 3 index, pour verification
      // jointure / structure des champs (notamment user_id keycloak vs delegate_id Mongo).
      if (a.length > 0) {
        debug.log(`[Scans][audience] (index: ${INDEX.audience}) Structure du 1er hit (_source) :`, a[0]._source);
        debug.log(`[Scans][audience] (index: ${INDEX.audience}) Champs disponibles :`, Object.keys(a[0]._source || {}));
      }
      debug.log(`[Scans][audience] (index: ${INDEX.audience}) Dump complet ES (${a.length} hits) :`, a.map((h) => h._source));
      if (c.length > 0) {
        debug.log(`[Scans][checkin] (index: ${INDEX.checkin}) Structure du 1er hit (_source) :`, c[0]._source);
        debug.log(`[Scans][checkin] (index: ${INDEX.checkin}) Champs disponibles :`, Object.keys(c[0]._source || {}));
      }
      debug.log(`[Scans][checkin] (index: ${INDEX.checkin}) Dump complet ES (${c.length} hits) :`, c.map((h) => h._source));
      if (z.length > 0) {
        debug.log(`[Scans][zone] (index: ${INDEX.zone}) Structure du 1er hit (_source) :`, z[0]._source);
        debug.log(`[Scans][zone] (index: ${INDEX.zone}) Champs disponibles :`, Object.keys(z[0]._source || {}));
      }
      debug.log(`[Scans][zone] (index: ${INDEX.zone}) Dump complet ES (${z.length} hits) :`, z.map((h) => h._source));
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
    zoneNames: readonly(zoneNames),
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
