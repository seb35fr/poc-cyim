import { parisDateParts } from "./parisTime.js";
import { makeInRange } from "./dateRange.js";

// Normalise un hit ES de l'index stats_user__live-view-duration-per-user-per-session
// vers un format unifie. Enrichi avec les sessions fetchees via GraphQL si
// fournies (l'ES live n'expose pas reliably session_end / duration / type).
function normalize(hit, sessionMap) {
  const s = hit._source || {};
  // Enrichissement via la session GraphQL si on a un sessionMap et un match.
  const sess = sessionMap && s.session_id ? sessionMap.get(s.session_id) : null;
  // Fallback large sur le nom du champ horodatage : selon la version du
  // pipeline xlsx-stats l'index expose timestamp / view_timestamp / start_time /
  // created_at. Pareil pour la duree de vue.
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
    || s.session_start
    || null;
  return {
    id: hit._id,
    userId: s.user_id || s.user_identity_id || null,
    // delegateId : si l'index live l'expose directement, on l'utilise comme
    // cle de jointure prioritaire avec la collection delegates.
    delegateId: s.delegate_id || s.delegate_identity_id || null,
    email: s.user_email || "",
    fullName: s.user_fullName
      || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ")
      || "—",
    sessionId: s.session_id || null,
    sessionTitle: sess?.title || s.session_title || s.session_label || "",
    // Type de session "precis" : on prend EN PRIORITE le champ ES `session_type`,
    // alimente par le job Flink stats_live.sql depuis events.category (SI-Views SQL)
    // — exactement la meme source que la colonne "type de session" de l'export
    // xlsx-stats. Le `type` de la session GraphQL (children(eventType: SESSION).type)
    // n'est que le discriminant generique du noeud event (~ "SESSION"), trop large :
    // on ne le garde qu'en dernier recours.
    sessionType: s.session_type || s.sessionType || sess?.type || "",
    sessionStart: sess?.start || s.session_start || null,
    // Date de fin de session : priorite a la session GraphQL (ES n'expose
    // pas le champ de facon fiable). Sert au bucketage par jour / 30 min.
    sessionEnd: sess?.end
      || s.session_end
      || s.session_endtime
      || s.session_finish
      || s.end_time
      || s.endtime
      || s.session_stop
      || null,
    sessionDuration: sess?.duration ?? null,
    origin: s.origin || s.platform || s.source || s.device || null,
    // channel_id : identifiant de la chaine de diffusion live.
    channelId: s.channel_id || s.channelId || null,
    // channel_name : libelle lisible de la chaine (expose par l'index ES live —
    // cf. xlsx-stats main.js qui lit data._source.channel_name). Fallback "Chaine N"
    // cote compute si absent.
    channelName: s.channel_name || s.channelName || null,
    timestamp,
    // true si aucun horodatage de vue n'existe et qu'on est retombe sur
    // session_start (dernier fallback ci-dessus) : la "date" n'est alors pas
    // celle de la consultation mais celle du debut de session.
    timestampIsSessionStart: !!timestamp && timestamp === s.session_start
      && !(s.timestamp || s["@timestamp"] || s.view_timestamp || s.viewing_time || s.view_start
        || s.start_time || s.starttime || s.start || s.event_time || s.created_at || s.date),
    duration: Number(s.view_duration ?? s.duration ?? s.live_duration ?? 0) || 0,
  };
}

export function computeLiveStats(rawHits, sessionMap = null, dateRange = null) {
  let items = (rawHits || []).map((h) => normalize(h, sessionMap));
  // Filtre date global du LIVE : on filtre sur la DATE DE DIFFUSION de la session
  // (sessionEnd, repli sessionStart puis timestamp) — c'est la date pertinente
  // pour le live, le timestamp de la vue cote ES n'etant pas fiable. Coherent
  // avec le bucketage "par jour" plus bas qui utilise la meme reference.
  if (dateRange) {
    const inRange = makeInRange(dateRange);
    items = items.filter((it) => inRange(it.sessionEnd || it.sessionStart || it.timestamp));
  }

  // KPI principal : nombre de delegues uniques (par user_id) ayant consulte du live.
  const uniqueUsers = new Set();
  const sessionsById = new Map(); // sessionId -> { id, title, users:Set, views, totalDuration }
  const userToSessions = new Map(); // userId -> Set<sessionId>
  const originCounts = new Map(); // origin -> { views, users:Set }
  const typeCounts = new Map(); // session_type -> { views, users:Set }
  let totalDuration = 0;

  for (const it of items) {
    if (it.userId) uniqueUsers.add(it.userId);
    if (it.origin) {
      if (!originCounts.has(it.origin)) {
        originCounts.set(it.origin, { views: 0, users: new Set() });
      }
      const o = originCounts.get(it.origin);
      o.views++;
      if (it.userId) o.users.add(it.userId);
    }
    // Aggregation par session_type pour le camembert + filtre
    const t = it.sessionType || "Non renseigné";
    if (!typeCounts.has(t)) typeCounts.set(t, { views: 0, users: new Set() });
    const tBucket = typeCounts.get(t);
    tBucket.views++;
    if (it.userId) tBucket.users.add(it.userId);
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
    totalDuration += it.duration;
  }

  // Sessions distinctes uniques + top sessions par audience unique
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

  // Repartition par nombre de sessions consultees par delegue (1 / 2-5 / 6-10 / 10+)
  const sessionsPerUserBuckets = { "1": 0, "2-5": 0, "6-10": 0, "10+": 0 };
  for (const sessions of userToSessions.values()) {
    const n = sessions.size;
    if (n <= 1) sessionsPerUserBuckets["1"]++;
    else if (n <= 5) sessionsPerUserBuckets["2-5"]++;
    else if (n <= 10) sessionsPerUserBuckets["6-10"]++;
    else sessionsPerUserBuckets["10+"]++;
  }

  // Delegues uniques par jour (heure de Paris).
  // Bucketage par DATE DE FIN DE SESSION (= jour ou la session live a eu lieu),
  // pas par la date de la vue. Fallback sur sessionStart puis timestamp si la
  // date de fin n'est pas exposee par l'index.
  const usersByDay = new Map(); // YYYY-MM-DD -> Set<userId>
  for (const it of items) {
    if (!it.userId) continue;
    const bucketRef = it.sessionEnd || it.sessionStart || it.timestamp;
    if (!bucketRef) continue;
    const p = parisDateParts(bucketRef);
    if (!p) continue;
    if (!usersByDay.has(p.ymd)) usersByDay.set(p.ymd, new Set());
    usersByDay.get(p.ymd).add(it.userId);
  }
  const uniqueByDay = [...usersByDay.entries()]
    .map(([day, set]) => ({ day, count: set.size }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Delegues uniques par jour ET par chaine de diffusion (channel_id).
  // Dedoublonnage PAR (jour, chaine) : un delegue est compte une fois par
  // chaine qu'il a regardee ce jour-la. Quelqu'un qui a suivi 3 chaines compte
  // dans les 3 -> la somme d'un jour peut depasser le total dedoublonne de
  // uniqueByDay (c'est voulu : on veut l'audience propre de chaque chaine, pas
  // une repartition d'un total). Le libelle de chaine vient de channel_name
  // (expose par l'index ES live) ; a defaut on classe par volume decroissant et
  // on derive des labels "Chaine N". Le channel_id brut reste dispo pour le CSV.
  const channelUsersByDay = new Map(); // day -> Map<channelId, Set<userId>>
  const channelNames = new Map(); // channelId -> channel_name (1er libelle rencontre)
  for (const it of items) {
    if (!it.userId || !it.channelId) continue;
    if (it.channelName && !channelNames.has(it.channelId)) {
      channelNames.set(it.channelId, it.channelName);
    }
    const bucketRef = it.sessionEnd || it.sessionStart || it.timestamp;
    if (!bucketRef) continue;
    const p = parisDateParts(bucketRef);
    if (!p) continue;
    if (!channelUsersByDay.has(p.ymd)) channelUsersByDay.set(p.ymd, new Map());
    const dayMap = channelUsersByDay.get(p.ymd);
    if (!dayMap.has(it.channelId)) dayMap.set(it.channelId, new Set());
    dayMap.get(it.channelId).add(it.userId);
  }
  const channelTotals = new Map(); // channelId -> somme des uniques par jour (pour le tri)
  const byDayChannelCounts = {}; // { day: { channelId: count } }
  for (const [day, dayMap] of channelUsersByDay) {
    const byChannel = {};
    for (const [channelId, set] of dayMap) {
      byChannel[channelId] = set.size;
      channelTotals.set(channelId, (channelTotals.get(channelId) || 0) + set.size);
    }
    byDayChannelCounts[day] = byChannel;
  }
  const channels = [...channelTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id], i) => ({
      id,
      // Vrai nom de chaine si l'index le fournit, sinon fallback "Chaine N".
      label: channelNames.get(id) || `Chaîne ${i + 1}`,
      total: channelTotals.get(id),
    }));
  const uniqueByDayByChannel = {
    days: [...channelUsersByDay.keys()].sort((a, b) => a.localeCompare(b)),
    channels,
    byDay: byDayChannelCounts,
  };

  // Delegues uniques par creneau de 30 min de session_end (heure de Paris).
  // Cle = "YYYY-MM-DD HH:MM" arrondi a la frontiere 30 min. Utilise pour voir
  // la repartition des viewers le long de la timeline des sessions live.
  const usersBy30min = new Map(); // slotKey -> Set<userId>
  for (const it of items) {
    if (!it.userId) continue;
    const ref = it.sessionEnd || it.sessionStart || it.timestamp;
    if (!ref) continue;
    const p = parisDateParts(ref);
    if (!p) continue;
    const minBucket = Math.floor(p.minute / 30) * 30;
    const slotKey = `${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(minBucket).padStart(2, "0")}`;
    if (!usersBy30min.has(slotKey)) usersBy30min.set(slotKey, new Set());
    usersBy30min.get(slotKey).add(it.userId);
  }
  const uniqueBy30min = [...usersBy30min.entries()]
    .map(([slot, set]) => ({ slot, count: set.size }))
    .sort((a, b) => a.slot.localeCompare(b.slot));

  return {
    items,
    global: {
      uniqueUsers: uniqueUsers.size,
      totalViews: items.length,
      distinctSessions: sessionsById.size,
      totalDurationSec: totalDuration,
      avgViewDurationSec: items.length > 0 ? totalDuration / items.length : 0,
    },
    topSessions,
    sessionsPerUserBuckets,
    uniqueByDay,
    uniqueByDayByChannel,
    uniqueBy30min,
    origins: [...originCounts.entries()]
      .map(([origin, v]) => ({ origin, views: v.views, uniqueUsers: v.users.size }))
      .sort((a, b) => b.views - a.views),
    sessionTypes: [...typeCounts.entries()]
      .map(([type, v]) => ({ type, views: v.views, uniqueUsers: v.users.size }))
      .sort((a, b) => b.views - a.views),
  };
}
