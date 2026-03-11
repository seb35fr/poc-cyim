import { COUNTRY_CONTINENTS } from "./countries.js";

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

export function computeAllStats(delegates) {
  const total = delegates.length;

  // --- DEMOGRAPHICS ---
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

  // --- REGISTRATIONS ---
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
      // Categories
      if (r.categories) {
        for (const cat of r.categories) {
          allCategories.push(cat);
        }
      }
      // Status per type
      const tsKey = r.type;
      if (!typeStatusMap[tsKey]) typeStatusMap[tsKey] = {};
      typeStatusMap[tsKey][r.status || d.status || "unknown"] =
        (typeStatusMap[tsKey][r.status || d.status || "unknown"] || 0) + 1;
      // Access days
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

  const multiRegistrations = multiRegDelegates.sort((a, b) => b.count - a.count);

  // --- TEMPORAL ---
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
      dailyRegistrations.push({
        date: dayStr,
        count: dailyMap[dayStr] || 0,
      });
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

  // Group weeklyByType as [{week, types: {typeName: count}}]
  const weeklyByTypeGrouped = {};
  for (const [k, count] of Object.entries(weeklyTypeMap)) {
    const [week, type] = k.split("|");
    if (!weeklyByTypeGrouped[week]) weeklyByTypeGrouped[week] = { week, types: {} };
    weeklyByTypeGrouped[week].types[type] = count;
  }
  const weeklyByType = Object.values(weeklyByTypeGrouped).sort((a, b) => a.week.localeCompare(b.week));

  // Weekly statuses as [{week, statuses: {statusName: count}}]
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

  // dayOfWeekDistribution as {1: count, 2: count, ...} (1=Mon, 7=Sun)
  const dayOfWeekDistribution = {};
  // JS getDay(): 0=Sun,1=Mon...6=Sat → we map to 1=Mon...7=Sun
  const jsToIso = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 };
  for (const [jsDay, count] of Object.entries(weekdayMap)) {
    dayOfWeekDistribution[jsToIso[Number(jsDay)]] = count;
  }

  // Insights
  const dailyValues = dailyRegistrations.map((d) => d.count);
  const peakDay = dailyRegistrations.reduce(
    (best, d) => (d.count > best.count ? d : best),
    { date: "-", count: 0 }
  );
  const last30 = dailyRegistrations.slice(-30);
  const avgLast30 =
    last30.length > 0
      ? last30.reduce((s, d) => s + d.count, 0) / last30.length
      : 0;
  const last14Count = dailyRegistrations
    .slice(-14)
    .reduce((s, d) => s + d.count, 0);
  const latePercent = total > 0 ? ((last14Count / total) * 100).toFixed(1) : 0;

  // --- CHECK-IN FLOW ---
  const checkinHourlyMap = {};
  const checkinDayMap = {};
  for (const d of delegates) {
    if (!d.checkedInDate) continue;
    const date = new Date(d.checkedInDate);
    const dayStr = date.toISOString().slice(0, 10);
    const hour = date.getUTCHours();
    const key = `${dayStr}|${hour}`;
    checkinHourlyMap[key] = (checkinHourlyMap[key] || 0) + 1;
    checkinDayMap[dayStr] = (checkinDayMap[dayStr] || 0) + 1;
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

  // --- BADGES ---
  const badgeDayMap = {};
  const badge15minMap = {};
  let totalBadgesDelivered = 0;

  for (const d of delegates) {
    if (!d.badges) continue;
    for (const b of d.badges) {
      if (!b.deliveredAt) continue;
      totalBadgesDelivered++;
      const date = new Date(b.deliveredAt);
      const dayStr = date.toISOString().slice(0, 10);
      badgeDayMap[dayStr] = (badgeDayMap[dayStr] || 0) + 1;

      // 15-min slot: "YYYY-MM-DD|HH:MM" rounded to 15min
      const h = date.getUTCHours();
      const m = Math.floor(date.getUTCMinutes() / 15) * 15;
      const slotKey = `${dayStr}|${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      badge15minMap[slotKey] = (badge15minMap[slotKey] || 0) + 1;
    }
  }

  const badgesByDay = Object.entries(badgeDayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Performance par créneau de 15min — triée par date+heure
  const badgesPer15min = Object.entries(badge15minMap)
    .map(([k, count]) => {
      const [date, time] = k.split("|");
      return { date, time, count };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  // Peak 15min slot
  const peakSlot = badgesPer15min.reduce(
    (best, s) => (s.count > best.count ? s : best),
    { date: "-", time: "-", count: 0 }
  );

  // --- GLOBALS ---
  const checkedInCount = delegates.filter((d) => d.checkedInDate).length;
  const onboardingCount = delegates.filter(
    (d) => d.firstOnboardingConnection
  ).length;
  const gdprCount = delegates.filter((d) => d.gdpr).length;
  const withAccountCount = delegates.filter((d) => d.contactId).length;
  const pendingCount = delegates.filter((d) => d.status === "PENDING").length;

  // Transform checkinFlow to object format {hourLabel: count} and {dateStr: count}
  const checkinHourlyObj = {};
  for (const item of checkinHourly) {
    const label = `${String(item.hour).padStart(2, "0")}:00`;
    checkinHourlyObj[label] = (checkinHourlyObj[label] || 0) + item.count;
  }
  const checkinByDayObj = {};
  for (const item of checkinByDay) {
    checkinByDayObj[item.date] = item.count;
  }

  return {
    global: {
      totalDelegatesCount: total,
      checkedInCount,
      notCheckedInCount: total - checkedInCount,
      onboardingCount,
      gdprSignedCount: gdprCount,
      accountsCount: withAccountCount,
      pendingCount,
      totalBadgesDelivered,
    },
    demographics: {
      countries,
      uniqueCountries,
      continentCounts,
      genders,
      occupations,
      qualifications,
      titles,
      companies,
    },
    registrations: {
      statuses,
      types,
      categories,
      accessDays,
      multiRegistrations,
    },
    temporal: {
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
    },
    checkinFlow: {
      hourly: checkinHourlyObj,
      byDay: checkinByDayObj,
    },
    badges: {
      byDay: badgesByDay,
      per15min: badgesPer15min,
      peakSlot,
    },
  };
}
