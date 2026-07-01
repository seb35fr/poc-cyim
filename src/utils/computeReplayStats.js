import { parisDateParts } from "./parisTime.js";
import { makeInRange } from "./dateRange.js";

// Normalise un hit ES de l'index stats_user__vod-view-per-user-per-session-per-origin.
// Enrichi via sessionMap (sessions GraphQL) pour recuperer titre/type/start/end/duration.
function normalize(hit, sessionMap) {
  const s = hit._source || {};
  const sess = sessionMap && s.session_id ? sessionMap.get(s.session_id) : null;
  // Horodatage de la VUE (quand le user a consulte la VOD), pas la date de la
  // session originale. NE pas faire de fallback sur session_start sinon on
  // bucke par date de session et plus par date de visionnage.
  const timestamp = s.timestamp
    || s["@timestamp"]
    || s.view_timestamp
    || s.viewing_time
    || s.view_start
    || s.start_time
    || s.starttime
    || s.start
    || s.event_time
    || s.created_at
    || s.date
    || null;
  return {
    id: hit._id,
    userId: s.user_id || s.user_identity_id || null,
    delegateId: s.delegate_id || s.delegate_identity_id || null,
    email: s.user_email || "",
    fullName: s.user_fullName
      || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ")
      || "—",
    sessionId: s.session_id || null,
    sessionTitle: sess?.title || s.session_title || s.session_label || "",
    // Type de session "precis" : on prend EN PRIORITE le champ ES `session_type`
    // (alimente par Flink depuis events.category SI-Views, comme l'export xlsx-stats)
    // plutot que le `type` generique de la session GraphQL (~ "SESSION").
    sessionType: s.session_type || s.sessionType || sess?.type || "",
    sessionStart: sess?.start || s.session_start || null,
    sessionEnd: sess?.end || null,
    sessionDuration: sess?.duration ?? null,
    origin: s.origin || s.platform || s.source || "Inconnu",
    timestamp,
    duration: Number(s.view_duration ?? s.duration ?? s.vod_duration ?? 0) || 0,
    // Granularite VOD : media/presentation consultes (cf. export VOD xlsx-stats).
    mediaId: s.media_id || "",
    presentationId: s.presentation_id || "",
    presentationTitle: s.presentation_title || "",
  };
}

export function computeReplayStats(rawHits, sessionMap = null, dateRange = null) {
  let items = (rawHits || []).map((h) => normalize(h, sessionMap));
  // Filtre date global : ne garder que les visionnages dont le timestamp tombe
  // dans la plage (date de consultation de la VOD).
  if (dateRange) {
    const inRange = makeInRange(dateRange);
    items = items.filter((it) => inRange(it.timestamp));
  }

  const uniqueUsers = new Set();
  const sessionsById = new Map();
  const userToSessions = new Map();
  const originCounts = new Map(); // origin -> { views, users:Set }
  const typeCounts = new Map(); // session_type -> { views, users:Set }
  let totalDuration = 0;

  for (const it of items) {
    if (it.userId) uniqueUsers.add(it.userId);
    // Aggregation par session_type pour le camembert + filtre (comme le live).
    const st = it.sessionType || "Non renseigné";
    if (!typeCounts.has(st)) typeCounts.set(st, { views: 0, users: new Set() });
    const stBucket = typeCounts.get(st);
    stBucket.views++;
    if (it.userId) stBucket.users.add(it.userId);
    if (it.sessionId) {
      if (!sessionsById.has(it.sessionId)) {
        sessionsById.set(it.sessionId, {
          id: it.sessionId,
          title: it.sessionTitle,
          start: it.sessionStart,
          users: new Set(),
          views: 0,
          totalDuration: 0,
        });
      }
      const sess = sessionsById.get(it.sessionId);
      if (it.userId) sess.users.add(it.userId);
      sess.views++;
      sess.totalDuration += it.duration;
    }
    if (it.userId) {
      if (!userToSessions.has(it.userId)) userToSessions.set(it.userId, new Set());
      if (it.sessionId) userToSessions.get(it.userId).add(it.sessionId);
    }
    if (!originCounts.has(it.origin)) {
      originCounts.set(it.origin, { views: 0, users: new Set() });
    }
    const o = originCounts.get(it.origin);
    o.views++;
    if (it.userId) o.users.add(it.userId);
    totalDuration += it.duration;
  }

  const topSessions = [...sessionsById.values()]
    .map((s) => ({
      id: s.id,
      title: s.title || s.id,
      start: s.start,
      uniqueUsers: s.users.size,
      views: s.views,
      totalDuration: s.totalDuration,
      avgDuration: s.views > 0 ? s.totalDuration / s.views : 0,
    }))
    .sort((a, b) => b.uniqueUsers - a.uniqueUsers);

  const sessionsPerUserBuckets = { "1": 0, "2-5": 0, "6-10": 0, "10+": 0 };
  for (const sessions of userToSessions.values()) {
    const n = sessions.size;
    if (n <= 1) sessionsPerUserBuckets["1"]++;
    else if (n <= 5) sessionsPerUserBuckets["2-5"]++;
    else if (n <= 10) sessionsPerUserBuckets["6-10"]++;
    else sessionsPerUserBuckets["10+"]++;
  }

  // Repartition par origine (web / mobile / embed / ...)
  const origins = [...originCounts.entries()]
    .map(([origin, v]) => ({
      origin,
      views: v.views,
      uniqueUsers: v.users.size,
    }))
    .sort((a, b) => b.views - a.views);

  // Delegues uniques par jour (heure de Paris).
  // Bucketage strict sur l'HORODATAGE DE LA VUE (it.timestamp) — pas sur la
  // date de la session : un replay peut etre consulte des semaines/mois
  // apres l'event, c'est cette date-la qui nous interesse.
  const usersByDay = new Map();
  for (const it of items) {
    if (!it.timestamp || !it.userId) continue;
    const p = parisDateParts(it.timestamp);
    if (!p) continue;
    if (!usersByDay.has(p.ymd)) usersByDay.set(p.ymd, new Set());
    usersByDay.get(p.ymd).add(it.userId);
  }
  const uniqueByDay = [...usersByDay.entries()]
    .map(([day, set]) => ({ day, count: set.size }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Cumul de delegues UNIQUES ayant consulte du replay : on date chaque user a
  // son PREMIER jour de visionnage (first-seen), puis on cumule -> courbe
  // croissante du nombre de delegues distincts ayant deja regarde un replay.
  // (La somme des uniqueByDay surcompterait les revenants ; ici chaque delegue
  // n'est compte qu'une fois, le jour de sa 1ere consultation.)
  const firstDayByUser = new Map(); // userId -> jour le plus ancien
  for (const it of items) {
    if (!it.timestamp || !it.userId) continue;
    const p = parisDateParts(it.timestamp);
    if (!p) continue;
    const prev = firstDayByUser.get(it.userId);
    if (!prev || p.ymd < prev) firstDayByUser.set(it.userId, p.ymd);
  }
  const newByDay = new Map(); // jour -> nb de delegues vus pour la 1ere fois
  for (const day of firstDayByUser.values()) newByDay.set(day, (newByDay.get(day) || 0) + 1);
  // Nouveaux delegues par jour (1ere consultation ce jour-la) : le delta
  // journalier du cumul. Aligne sur l'ordre des jours de uniqueByDay.
  const newUniqueByDay = uniqueByDay.map(({ day }) => ({ day, count: newByDay.get(day) || 0 }));
  let running = 0;
  const cumulativeUniqueByDay = uniqueByDay.map(({ day }) => {
    running += newByDay.get(day) || 0;
    return { day, count: running };
  });

  // Nombre de VUES par jour (toutes vues, pas dedoublonne par user) + cumul.
  // Bucketage sur it.timestamp comme uniqueByDay.
  const viewsCountByDay = new Map();
  for (const it of items) {
    if (!it.timestamp) continue;
    const p = parisDateParts(it.timestamp);
    if (!p) continue;
    viewsCountByDay.set(p.ymd, (viewsCountByDay.get(p.ymd) || 0) + 1);
  }
  const viewsByDay = [...viewsCountByDay.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
  let runningViews = 0;
  const cumulativeViewsByDay = viewsByDay.map(({ day, count }) => {
    runningViews += count;
    return { day, count: runningViews };
  });

  return {
    items,
    global: {
      uniqueUsers: uniqueUsers.size,
      totalViews: items.length,
      distinctSessions: sessionsById.size,
      totalDurationSec: totalDuration,
      avgViewDurationSec: items.length > 0 ? totalDuration / items.length : 0,
      distinctOrigins: originCounts.size,
    },
    topSessions,
    sessionsPerUserBuckets,
    origins,
    sessionTypes: [...typeCounts.entries()]
      .map(([type, v]) => ({ type, views: v.views, uniqueUsers: v.users.size }))
      .sort((a, b) => b.views - a.views),
    uniqueByDay,
    newUniqueByDay,
    cumulativeUniqueByDay,
    viewsByDay,
    cumulativeViewsByDay,
  };
}
