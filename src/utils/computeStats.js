import { COUNTRY_CONTINENTS } from "./countries.js";
import { parisDateParts } from "./parisTime.js";

// Calcul de toutes les stats de l'event. Avant ce refactor, computeAllStats
// retournait un objet "plein" avec ses 8 sections calculees en un seul pass
// monolithique (~450 lignes en une seule fonction). Chaque cross-filter
// retournait dans Vue via useFilteredStats redeclenchait l'integralite du
// calcul, meme pour les blocs que le tab courant n'utilisait pas (ex: tab
// Demographics qui recalcule temporal/badges/checkinFlow pour rien).
//
// Maintenant : computeAllStats retourne un objet "lazy" avec un getter par
// section. Chaque section n'est calculee qu'a son premier acces (via
// memoisation par closure), API publique strictement identique. Sur un
// event >5k delegues, un clic de cross-filter qui n'affecte qu'un seul tab
// passe de "recalcul de tout" a "recalcul de ce que la vue affiche", soit
// typiquement 2-3 sections sur 8.

function groupBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const key = keyFn(item) ?? "__null__";
    if (!map[key]) map[key] = 0;
    map[key]++;
  }
  return Object.entries(map)
    .map(([value, totalCount]) => ({
      value: value === "__null__" ? "Non renseigne" : value,
      totalCount,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);
}

function getCountryCode(d) {
  return d.primaryAddress?.countryCode || d.primaryAddress?.country?.code || null;
}

// ---------------------------------------------------------------------------
// SECTIONS — chacune lit `delegates` (et eventuellement `mobileAppId`) et
// retourne UN bloc independant. Aucune cross-dependance entre sections : le
// scalar `totalBadgesDelivered` necessaire au bloc global est recompute en
// local (1 boucle O(n) supplementaire, negligeable face au cout d'un bloc
// entier).
// ---------------------------------------------------------------------------

function computeDemographics(delegates) {
  const countries = groupBy(delegates, getCountryCode);
  const uniqueCountries = countries.filter((c) => c.value !== "Non renseigne").length;

  const continentCounts = {};
  for (const d of delegates) {
    const cc = getCountryCode(d);
    const continent = cc ? COUNTRY_CONTINENTS[cc] || "Autre" : "Non renseigne";
    continentCounts[continent] = (continentCounts[continent] || 0) + 1;
  }

  const genders = groupBy(delegates, (d) => {
    if (d.gender === "MALE") return "Hommes";
    if (d.gender === "FEMALE") return "Femmes";
    if (d.gender === "OTHER") return "Autre";
    return null;
  });

  const occupations = groupBy(delegates, (d) => d.occupation || null);
  const qualifications = groupBy(delegates, (d) => d.qualification || null);
  const titles = groupBy(delegates, (d) => d.title || null);
  const companies = groupBy(delegates, (d) => d.company || null);

  return {
    countries,
    uniqueCountries,
    continentCounts,
    genders,
    occupations,
    qualifications,
    titles,
    companies,
  };
}

function computeRegistrations(delegates) {
  const statuses = groupBy(delegates, (d) => d.status);
  const allRegTypes = [];
  const allCategories = [];
  const accessDaysMap = {};
  const typeStatusMap = {};
  const multiRegDelegates = [];

  for (const d of delegates) {
    const types = new Set();
    for (const r of d.registrations || []) {
      allRegTypes.push(r.type);
      types.add(r.type);
      if (r.categories) {
        for (const cat of r.categories) allCategories.push(cat);
      }
      const tsKey = r.type;
      if (!typeStatusMap[tsKey]) typeStatusMap[tsKey] = {};
      typeStatusMap[tsKey][r.status || d.status || "unknown"] =
        (typeStatusMap[tsKey][r.status || d.status || "unknown"] || 0) + 1;
      if (r.accessDays) {
        for (const day of r.accessDays) {
          const key = day === "*" ? "Tous les jours" : day;
          accessDaysMap[key] = (accessDaysMap[key] || 0) + 1;
        }
      }
    }
    if (types.size > 1) {
      multiRegDelegates.push({
        id: d.id,
        name: `${d.givenName || ""} ${d.familyName || ""}`.trim(),
        email: d.email || "",
        count: types.size,
        types: [...types],
      });
    }
  }

  const types = groupBy(allRegTypes.map((t) => ({ t })), (x) => x.t).map((t) => ({
    ...t,
    statuses: typeStatusMap[t.value] || {},
  }));
  const categories = groupBy(allCategories.map((c) => ({ c })), (x) => x.c);
  const accessDays = Object.entries(accessDaysMap)
    .map(([value, totalCount]) => ({ value, totalCount }))
    .sort((a, b) => {
      if (a.value === "Tous les jours") return 1;
      if (b.value === "Tous les jours") return -1;
      return a.value.localeCompare(b.value);
    });

  return {
    statuses,
    types,
    categories,
    accessDays,
    multiRegistrations: multiRegDelegates.sort((a, b) => b.count - a.count),
  };
}

function computeTemporal(delegates) {
  const total = delegates.length;
  const dailyMap = {};
  const weekdayMap = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let minDate = null;
  let maxDate = null;

  for (const d of delegates) {
    if (!d.createdAt) continue;
    const date = new Date(d.createdAt);
    const dayStr = date.toISOString().slice(0, 10);
    dailyMap[dayStr] = (dailyMap[dayStr] || 0) + 1;
    weekdayMap[date.getDay()]++;
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  }

  // Fill gaps
  const dailyRegistrations = [];
  if (minDate && maxDate) {
    const cursor = new Date(minDate);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(maxDate);
    end.setUTCHours(0, 0, 0, 0);
    while (cursor <= end) {
      const dayStr = cursor.toISOString().slice(0, 10);
      dailyRegistrations.push({ date: dayStr, count: dailyMap[dayStr] || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Weekly by type
  const weeklyTypeMap = {};
  for (const d of delegates) {
    if (!d.createdAt) continue;
    const date = new Date(d.createdAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1);
    const weekStr = weekStart.toISOString().slice(0, 10);
    for (const r of d.registrations || []) {
      const key = `${weekStr}|${r.type}`;
      weeklyTypeMap[key] = (weeklyTypeMap[key] || 0) + 1;
    }
  }
  const weeklyByTypeGrouped = {};
  for (const [k, count] of Object.entries(weeklyTypeMap)) {
    const [week, type] = k.split("|");
    if (!weeklyByTypeGrouped[week]) weeklyByTypeGrouped[week] = { week, types: {} };
    weeklyByTypeGrouped[week].types[type] = count;
  }
  const weeklyByType = Object.values(weeklyByTypeGrouped).sort((a, b) => a.week.localeCompare(b.week));

  // Weekly statuses
  const weeklyStatusMap = {};
  for (const d of delegates) {
    if (!d.createdAt) continue;
    const date = new Date(d.createdAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1);
    const weekStr = weekStart.toISOString().slice(0, 10);
    if (!weeklyStatusMap[weekStr]) weeklyStatusMap[weekStr] = { week: weekStr, statuses: {} };
    const status = d.status || "unknown";
    weeklyStatusMap[weekStr].statuses[status] = (weeklyStatusMap[weekStr].statuses[status] || 0) + 1;
  }
  const weeklyStatuses = Object.values(weeklyStatusMap).sort((a, b) => a.week.localeCompare(b.week));

  // dayOfWeekDistribution {1: Mon ... 7: Sun}
  const dayOfWeekDistribution = {};
  const jsToIso = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 };
  for (const [jsDay, count] of Object.entries(weekdayMap)) {
    dayOfWeekDistribution[jsToIso[Number(jsDay)]] = count;
  }

  // Insights
  const peakDay = dailyRegistrations.reduce(
    (best, d) => (d.count > best.count ? d : best),
    { date: "-", count: 0 },
  );
  const last30 = dailyRegistrations.slice(-30);
  const avgLast30 =
    last30.length > 0 ? last30.reduce((s, d) => s + d.count, 0) / last30.length : 0;
  const last14Count = dailyRegistrations.slice(-14).reduce((s, d) => s + d.count, 0);
  const latePercent = total > 0 ? ((last14Count / total) * 100).toFixed(1) : 0;

  return {
    dailyRegistrations,
    weeklyByType,
    weeklyStatuses,
    dayOfWeekDistribution,
    insights: {
      peakDay,
      avgPerDay: avgLast30,
      latePercent,
      lateCount: last14Count,
      firstDate: minDate ? minDate.toISOString().slice(0, 10) : "-",
    },
  };
}

function computeCheckinFlow(delegates) {
  const checkinHourlyMap = {};
  const checkinDayMap = {};
  const checkin15minMap = {};
  for (const d of delegates) {
    if (!d.checkedInDate) continue;
    const parts = parisDateParts(d.checkedInDate);
    if (!parts) continue;
    const dayStr = parts.ymd;
    const hour = parts.hour;
    const key = `${dayStr}|${hour}`;
    checkinHourlyMap[key] = (checkinHourlyMap[key] || 0) + 1;
    checkinDayMap[dayStr] = (checkinDayMap[dayStr] || 0) + 1;

    const m = Math.floor(parts.minute / 15) * 15;
    const slotKey = `${dayStr}|${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    checkin15minMap[slotKey] = (checkin15minMap[slotKey] || 0) + 1;
  }

  const checkinHourly = Object.entries(checkinHourlyMap)
    .map(([k, count]) => {
      const [date, hour] = k.split("|");
      return { date, hour: parseInt(hour), count };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);

  const checkinByDay = Object.entries(checkinDayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const checkinPer15min = Object.entries(checkin15minMap)
    .map(([k, count]) => {
      const [date, time] = k.split("|");
      return { date, time, count };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const checkinPeakSlot = checkinPer15min.reduce(
    (best, s) => (s.count > best.count ? s : best),
    { date: "-", time: "-", count: 0 },
  );

  // Format objets {hourLabel: count} et {date: {hourLabel: count}} attendus par
  // certains tabs (mosaique de la timeline check-in).
  const hourly = {};
  const byDayAndHour = {};
  for (const item of checkinHourly) {
    const label = `${String(item.hour).padStart(2, "0")}:00`;
    hourly[label] = (hourly[label] || 0) + item.count;
    if (!byDayAndHour[item.date]) byDayAndHour[item.date] = {};
    byDayAndHour[item.date][label] = (byDayAndHour[item.date][label] || 0) + item.count;
  }
  const byDayObj = {};
  for (const item of checkinByDay) byDayObj[item.date] = item.count;

  return {
    hourly,
    byDayAndHour,
    byDay: byDayObj,
    byDayArray: checkinByDay,
    per15min: checkinPer15min,
    peakSlot: checkinPeakSlot,
  };
}

function computeBadges(delegates) {
  const badgeDayMap = {};
  const badge15minMap = {};
  const badgePerMinuteMap = {};
  const badgeDeviceMap = {};
  let totalDelivered = 0;

  for (const d of delegates) {
    if (!d.badges) continue;
    for (const b of d.badges) {
      if (!b.deliveredAt) continue;
      totalDelivered++;
      const parts = parisDateParts(b.deliveredAt);
      if (!parts) continue;
      const dayStr = parts.ymd;
      badgeDayMap[dayStr] = (badgeDayMap[dayStr] || 0) + 1;

      const h = parts.hour;
      const m = Math.floor(parts.minute / 15) * 15;
      const slotKey = `${dayStr}|${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      badge15minMap[slotKey] = (badge15minMap[slotKey] || 0) + 1;

      const minuteKey = `${dayStr}|${String(h).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
      badgePerMinuteMap[minuteKey] = (badgePerMinuteMap[minuteKey] || 0) + 1;

      const device = b.deliveredBy || "Inconnu";
      badgeDeviceMap[device] = (badgeDeviceMap[device] || 0) + 1;
    }
  }

  const badgesByDevice = Object.entries(badgeDeviceMap)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);

  const badgesByDay = Object.entries(badgeDayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const badgesPer15min = Object.entries(badge15minMap)
    .map(([k, count]) => {
      const [date, time] = k.split("|");
      return { date, time, count };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const peakSlot = badgesPer15min.reduce(
    (best, s) => (s.count > best.count ? s : best),
    { date: "-", time: "-", count: 0 },
  );

  const badgesPerMinute = Object.entries(badgePerMinuteMap)
    .map(([k, count]) => {
      const [date, time] = k.split("|");
      return { date, time, count };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const peakMinute = badgesPerMinute.reduce(
    (best, s) => (s.count > best.count ? s : best),
    { date: "-", time: "-", count: 0 },
  );

  // Format objets pour BadgesTab (mosaique deliveredAt par jour/heure).
  const hourly = {};
  const byDayAndHour = {};
  for (const item of badgesPer15min) {
    const label = `${item.time.slice(0, 2)}:00`;
    hourly[label] = (hourly[label] || 0) + item.count;
    if (!byDayAndHour[item.date]) byDayAndHour[item.date] = {};
    byDayAndHour[item.date][label] = (byDayAndHour[item.date][label] || 0) + item.count;
  }

  return {
    byDay: badgesByDay,
    hourly,
    byDayAndHour,
    per15min: badgesPer15min,
    perMinute: badgesPerMinute,
    peakSlot,
    peakMinute,
    byDevice: badgesByDevice,
    totalDelivered,
  };
}

function computeOnboarding(delegates) {
  const onboardingDailyMap = {};
  for (const d of delegates) {
    if (!d.firstOnboardingConnection) continue;
    const date = new Date(d.firstOnboardingConnection);
    const dayStr = date.toISOString().slice(0, 10);
    onboardingDailyMap[dayStr] = (onboardingDailyMap[dayStr] || 0) + 1;
  }
  const daily = Object.entries(onboardingDailyMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { daily };
}

function computeMobileApp(delegates, mobileAppId) {
  const result = { daily: [], count: 0 };
  if (!mobileAppId) return result;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const dailyMap = {};
  const seenContactIds = new Set();
  let count = 0;

  for (const d of delegates) {
    if (d.contactId && seenContactIds.has(d.contactId)) continue;
    const app = (d.contact?.apps || []).find((a) => a.id === mobileAppId && a.lastUsed);
    if (!app) continue;
    if (d.contactId) seenContactIds.add(d.contactId);
    const lastUsed = new Date(app.lastUsed);
    if (lastUsed < threeMonthsAgo) continue;
    count++;
    const dayStr = lastUsed.toISOString().slice(0, 10);
    dailyMap[dayStr] = (dailyMap[dayStr] || 0) + 1;
  }
  result.count = count;
  result.daily = Object.entries(dailyMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// global agrege quelques scalaires + 2 valeurs cross-section (totalBadgesDelivered
// et mobileAppCount). Pour preserver l'independance, on les recompute en local
// (2 boucles O(n) supplementaires negligeables). Permet a un consommateur qui
// ne lit que `global` de ne PAS declencher les calculs lourds de badges /
// mobileApp.
function computeGlobal(delegates, mobileAppId) {
  let checkedInCount = 0;
  let onboardingCount = 0;
  let gdprCount = 0;
  let withAccountCount = 0;
  let pendingCount = 0;
  let totalBadgesDelivered = 0;
  for (const d of delegates) {
    if (d.checkedInDate) checkedInCount++;
    if (d.firstOnboardingConnection) onboardingCount++;
    if (d.gdpr) gdprCount++;
    if (d.contactId) withAccountCount++;
    if (d.status?.toLowerCase() === "pending") pendingCount++;
    if (d.badges) {
      for (const b of d.badges) if (b.deliveredAt) totalBadgesDelivered++;
    }
  }

  // mobileAppCount : compte les contacts uniques ayant utilise l'app dans les
  // 3 derniers mois. Logique identique a computeMobileApp mais on n'a besoin
  // que du scalar — pas du breakdown daily.
  let mobileAppCount = 0;
  if (mobileAppId) {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const seen = new Set();
    for (const d of delegates) {
      if (d.contactId && seen.has(d.contactId)) continue;
      const app = (d.contact?.apps || []).find((a) => a.id === mobileAppId && a.lastUsed);
      if (!app) continue;
      if (d.contactId) seen.add(d.contactId);
      if (new Date(app.lastUsed) < threeMonthsAgo) continue;
      mobileAppCount++;
    }
  }

  const total = delegates.length;
  return {
    totalDelegatesCount: total,
    checkedInCount,
    notCheckedInCount: total - checkedInCount,
    onboardingCount,
    gdprSignedCount: gdprCount,
    accountsCount: withAccountCount,
    pendingCount,
    totalBadgesDelivered,
    mobileAppCount,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC API — objet lazy a getters. Chaque section n'est calculee qu'a son
// premier acces, puis memoisee dans la closure pour les acces suivants. API
// strictement identique a la version monolithique : `fs.global`,
// `fs.demographics`, etc. fonctionnent comme avant.
// ---------------------------------------------------------------------------
export function computeAllStats(delegates, mobileAppId = null) {
  let _global, _demographics, _registrations, _temporal, _checkinFlow, _badges, _onboarding, _mobileApp;
  return {
    get global() {
      if (!_global) _global = computeGlobal(delegates, mobileAppId);
      return _global;
    },
    get demographics() {
      if (!_demographics) _demographics = computeDemographics(delegates);
      return _demographics;
    },
    get registrations() {
      if (!_registrations) _registrations = computeRegistrations(delegates);
      return _registrations;
    },
    get temporal() {
      if (!_temporal) _temporal = computeTemporal(delegates);
      return _temporal;
    },
    get checkinFlow() {
      if (!_checkinFlow) _checkinFlow = computeCheckinFlow(delegates);
      return _checkinFlow;
    },
    get badges() {
      if (!_badges) _badges = computeBadges(delegates);
      return _badges;
    },
    get onboarding() {
      if (!_onboarding) _onboarding = computeOnboarding(delegates);
      return _onboarding;
    },
    get mobileApp() {
      if (!_mobileApp) _mobileApp = computeMobileApp(delegates, mobileAppId);
      return _mobileApp;
    },
  };
}
