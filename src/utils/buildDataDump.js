import { i18n } from "@/i18n/index.js";

// Dump JSON intégral des données de l'app — pensé pour rejouer / auditer /
// recalculer hors de l'application (ou alimenter un LLM avec la donnée brute en
// complément du bilan Markdown).
//
// On sérialise, par event :
//   - config    : config GraphQL (branding name/logoURL + mobileAppId)
//   - sessions  : référentiel complet des sessions du programme (children SESSION)
//   - delegates : objets délégués BRUTS (GraphQL), tels que chargés
//   - stats     : tous les indicateurs calculés (computeAllStats, toutes sections)
//   - live / replay / scans : stats ES incluant les items/scans normalisés bruts
//
// Les sections de `stats` sont des getters lazy → on les lit explicitement pour
// forcer leur matérialisation avant sérialisation.

function materializeStats(stats) {
  if (!stats) return null;
  return {
    global: stats.global,
    demographics: stats.demographics,
    registrations: stats.registrations,
    temporal: stats.temporal,
    checkinFlow: stats.checkinFlow,
    badges: stats.badges,
    onboarding: stats.onboarding,
    mobileApp: stats.mobileApp,
  };
}

// Replacer JSON : convertit Set -> Array, Map -> Object, BigInt -> string.
// (Les structures de stats sont normalement déjà plates ; filet de sécurité.)
export function jsonReplacer(key, value) {
  if (value instanceof Set) return [...value];
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function buildDataDump(opts) {
  const {
    eventId,
    eventName,
    config = null,
    sessions = [],
    delegates = [],
    memberDelegates = [],
    compareMemberDelegates = [],
    stats = null,
    liveStats = null,
    replayStats = null,
    scanStats = null,
    compareStats = null,
    compareEventName = null,
    compareConfig = null,
    compareSessions = [],
    compareDelegates = null,
    compareLiveStats = null,
    compareReplayStats = null,
    compareScanStats = null,
    badgeFilterTypes = [],
  } = opts;

  const dump = {
    meta: {
      schema: "cyim-statistics-reg/full-dump@2",
      eventId: eventId || null,
      eventName: eventName || null,
      generatedAt: new Date().toISOString(),
      locale: i18n.global.locale.value,
      badgeTypeFilter: badgeFilterTypes,
      delegatesCount: delegates.length,
    },
    event: {
      config,
      sessions,
      delegates,
      // Viewers live/replay NON inscrits mais membres de l'organisateur
      // (pseudo-delegues, cf. useViewerMembers) — comptes dans le total participants.
      memberViewers: memberDelegates,
      stats: materializeStats(stats),
      live: liveStats,
      replay: replayStats,
      scans: scanStats,
    },
  };

  if (compareStats && compareEventName) {
    dump.compare = {
      eventName: compareEventName,
      config: compareConfig,
      sessions: compareSessions,
      delegates: compareDelegates || [],
      memberViewers: compareMemberDelegates,
      stats: materializeStats(compareStats),
      live: compareLiveStats,
      replay: compareReplayStats,
      scans: compareScanStats,
    };
  }

  return dump;
}
