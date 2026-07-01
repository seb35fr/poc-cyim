import { ref } from "vue";
import { buildDataDump, jsonReplacer } from "@/utils/buildDataDump.js";
import { generateAnalysis } from "@/utils/generateAnalysis.js";
import { buildCheckinByType } from "@/utils/checkinByType.js";
import { buildDelegateLookup, getRemoteOnlyDelegateIds } from "@/utils/viewerJoin.js";
import { computeParticipation } from "@/utils/participation.js";
import { toEpochMs } from "@/utils/parisTime.js";
import { zipToRegion, REGION_NAMES } from "@/utils/frenchRegions.js";
import { countryName } from "@/utils/countries.js";
import { i18n } from "@/i18n/index.js";
import { weekdayNames } from "@/i18n/labels.js";

// Export Markdown du dashboard — destine a etre donne a un LLM (Claude,
// ChatGPT, Gemini) pour produire automatiquement un bilan, un email client,
// une presentation, une comparaison cross-event, etc.
//
// Pourquoi MD plutot que JSON / CSV / PDF :
// - les LLM sont entraines sur des tonnes de markdown (README GitHub, docs),
//   ils en extraient la structure sans pre-traitement
// - les tableaux MD sont lisibles a l'oeil ET parsable par un LLM
// - un seul fichier contient narration + tableaux + listes (vs N CSV)
//
// Tous les libelles sont localises via i18n (namespace `md.*`) ; l'export suit
// la langue active au moment de la generation.

const t = (key, named) => i18n.global.t(key, named || {});
const dateLocale = () => (i18n.global.locale.value === "en" ? "en-GB" : "fr-FR");

// --- Helpers MD -------------------------------------------------------------

function h(level, text) {
  return `${"#".repeat(level)} ${text}\n\n`;
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(dateLocale());
}

function fmtPct(num, den, decimals = 1) {
  if (!den || den <= 0) return "—";
  return `${((num / den) * 100).toFixed(decimals)}%`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(dateLocale(), {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function fmtDuration(sec) {
  if (!sec || sec <= 0) return "—";
  const total = Math.round(sec);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, "0")}m`;
  if (mm > 0) return `${mm}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

// Echappe un contenu de cellule MD : | -> \|, retour ligne -> espace.
function mdCell(v) {
  if (v == null) return "—";
  const s = String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  return s.length === 0 ? "—" : s;
}

function mdTable(headers, rows) {
  if (!rows || rows.length === 0) return `_${t("md.noData")}_\n\n`;
  const hdr = `| ${headers.map(mdCell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`).join("\n");
  return `${hdr}\n${sep}\n${body}\n\n`;
}

function mdScalar(label, value, unit = "") {
  return `- **${label}** : ${value}${unit}\n`;
}

function mdScalars(rows) {
  return rows.map(([l, v, u = ""]) => mdScalar(l, v, u)).join("") + "\n";
}

// --- Sections ---------------------------------------------------------------

function sectionMetadata({ eventId, eventName, delegatesCount, filterState, compareEventName }) {
  let out = h(2, t("md.meta.title"));
  out += mdScalars([
    [t("md.meta.event"), eventName || "—"],
    [t("md.meta.eventId"), `\`${eventId}\``],
    [t("md.meta.delegatesLoaded"), fmtNum(delegatesCount)],
    [t("md.meta.generatedAt"), fmtDate(new Date())],
    [t("md.meta.source"), t("md.meta.sourceValue")],
  ]);
  if (compareEventName) {
    out += mdScalar(t("md.meta.compareEvent"), compareEventName);
    out += "\n";
  }
  if (filterState && filterState.length > 0) {
    out += `> ${t("md.meta.filterActive", { types: filterState.join(", ") })}\n\n`;
  } else {
    out += `> ${t("md.meta.filterNone")}\n\n`;
  }
  return out;
}

function sectionGlobal(stats, delegates) {
  if (!stats?.global) return "";
  const g = stats.global;
  const registered = (delegates || []).filter((d) => d.status?.toLowerCase() === "registered").length;
  let out = h(2, t("md.global.title"));
  out += mdTable(
    [t("md.global.colIndicator"), t("md.global.colValue"), t("md.global.colPctNote")],
    [
      [t("md.global.totalRegistered"), fmtNum(g.totalDelegatesCount), t("md.global.allStatuses")],
      [t("md.global.registered"), fmtNum(registered), t("md.global.ofTotal", { pct: fmtPct(registered, g.totalDelegatesCount) })],
      [t("md.global.pending"), fmtNum(g.pendingCount), fmtPct(g.pendingCount, g.totalDelegatesCount)],
      [t("md.global.checkin"), fmtNum(g.checkedInCount), t("md.global.ofRegistered", { pct: fmtPct(g.checkedInCount, registered) })],
      [t("md.global.noCheckin"), fmtNum(g.notCheckedInCount), fmtPct(g.notCheckedInCount, g.totalDelegatesCount)],
      [t("md.global.badges"), fmtNum(g.totalBadgesDelivered), t("md.global.ofRegistered", { pct: fmtPct(g.totalBadgesDelivered, registered) })],
      [t("md.global.onboarding"), fmtNum(g.onboardingCount), t("md.global.ofRegistered", { pct: fmtPct(g.onboardingCount, registered) })],
      [t("md.global.gdpr"), fmtNum(g.gdprSignedCount), fmtPct(g.gdprSignedCount, g.totalDelegatesCount)],
      [t("md.global.account"), fmtNum(g.accountsCount), fmtPct(g.accountsCount, g.totalDelegatesCount)],
      [t("md.global.mobileApp"), fmtNum(g.mobileAppCount), fmtPct(g.mobileAppCount, g.totalDelegatesCount)],
    ],
  );
  return out;
}

function sectionTotalParticipants(delegates, liveItems, replayItems, label = "md-export") {
  const { counts: c } = computeParticipation(delegates, liveItems, replayItems, { datasetLabel: label });
  if (c.total === 0) return "";

  let out = h(2, t("md.participants.title"));
  out += `${t("md.participants.intro")}\n\n`;
  out += mdTable(
    [t("md.participants.colComponent"), t("md.participants.colDelegates"), t("md.participants.colPctTotal")],
    [
      [t("md.participants.onsiteOnly"), fmtNum(c.checkedInOnly), fmtPct(c.checkedInOnly, c.total)],
      [t("md.participants.onsitePlusLive"), fmtNum(c.checkedInLive), fmtPct(c.checkedInLive, c.total)],
      [t("md.participants.onsitePlusLiveReplay"), fmtNum(c.checkedInLiveReplay), fmtPct(c.checkedInLiveReplay, c.total)],
      [t("md.participants.onsitePlusReplay"), fmtNum(c.checkedInReplay), fmtPct(c.checkedInReplay, c.total)],
      [t("md.participants.liveOnly"), fmtNum(c.liveOnly), fmtPct(c.liveOnly, c.total)],
      [t("md.participants.both"), fmtNum(c.both), fmtPct(c.both, c.total)],
      [t("md.participants.replayOnly"), fmtNum(c.replayOnly), fmtPct(c.replayOnly, c.total)],
      [t("md.participants.total"), `**${fmtNum(c.total)}**`, "**100%**"],
    ],
  );
  out += `${t("md.participants.note")}\n\n`;
  return out;
}

// Repartition par region francaise INSEE — replique la logique de
// RegionalMaps.vue (zip -> region) pour que la carte France soit representee
// dans le markdown. Calcule a partir des delegues FR avec un zipCode resolu.
function frenchRegionRows(delegates) {
  const counts = new Map();
  for (const d of delegates || []) {
    const addr = d.primaryAddress;
    if (!addr) continue;
    const country = addr.countryCode || addr.country?.code;
    if (country && country !== "FR") continue;
    const region = zipToRegion(addr.zipCode);
    if (!region) continue;
    counts.set(region, (counts.get(region) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, name: REGION_NAMES[code] || code, count }))
    .sort((a, b) => b.count - a.count);
}

function sectionDemographics(stats, delegates = []) {
  const d = stats?.demographics;
  if (!d) return "";
  let out = h(2, t("md.demo.title"));

  // --- Geographie : tous les pays (aucun plafond), continents, regions FR ---
  out += h(3, t("md.demo.countriesTop"));
  const totalCountries = (d.countries || []).reduce((s, c) => s + c.totalCount, 0);
  out += mdTable(
    [t("md.demo.colCountry"), t("md.demo.colCountryName"), t("md.demo.colDelegates"), t("md.demo.colPct")],
    (d.countries || []).map((c) => [c.value, countryName(c.value), fmtNum(c.totalCount), fmtPct(c.totalCount, totalCountries)]),
  );
  out += `${t("md.demo.countriesSummary", { unique: d.uniqueCountries || 0, total: (d.countries || []).length })}\n\n`;

  out += h(3, t("md.demo.continents"));
  const continents = Object.entries(d.continentCounts || {}).sort((a, b) => b[1] - a[1]);
  const totalContinents = continents.reduce((s, [, v]) => s + v, 0);
  out += mdTable(
    [t("md.demo.colContinent"), t("md.demo.colDelegates"), t("md.demo.colPct")],
    continents.map(([k, v]) => [k, fmtNum(v), fmtPct(v, totalContinents)]),
  );

  const regions = frenchRegionRows(delegates);
  if (regions.length > 0) {
    out += h(3, t("md.demo.regionsFr"));
    const totalReg = regions.reduce((s, r) => s + r.count, 0);
    out += mdTable(
      [t("md.demo.colRegion"), t("md.demo.colRegionCode"), t("md.demo.colDelegates"), t("md.demo.colPct")],
      regions.map((r) => [r.name, r.code, fmtNum(r.count), fmtPct(r.count, totalReg)]),
    );
  }

  out += h(3, t("md.demo.gender"));
  const totalGender = (d.genders || []).reduce((s, g) => s + g.totalCount, 0);
  out += mdTable(
    [t("md.demo.colGender"), t("md.demo.colDelegates"), t("md.demo.colPct")],
    (d.genders || []).map((g) => [g.value, fmtNum(g.totalCount), fmtPct(g.totalCount, totalGender)]),
  );

  // Professions / qualifications / civilites / societes : exhaustif (pas de
  // plafond top-N) — l'export doit contenir l'integralite des indicateurs.
  out += h(3, t("md.demo.occupations"));
  out += mdTable(
    [t("md.demo.colOccupation"), t("md.demo.colDelegates")],
    (d.occupations || []).map((o) => [o.value, fmtNum(o.totalCount)]),
  );

  out += h(3, t("md.demo.qualifications"));
  out += mdTable(
    [t("md.demo.colQualification"), t("md.demo.colDelegates")],
    (d.qualifications || []).map((q) => [q.value, fmtNum(q.totalCount)]),
  );

  out += h(3, t("md.demo.titles"));
  out += mdTable(
    [t("md.demo.colTitle"), t("md.demo.colDelegates")],
    (d.titles || []).map((x) => [x.value, fmtNum(x.totalCount)]),
  );

  out += h(3, t("md.demo.companies"));
  out += mdTable(
    [t("md.demo.colCompany"), t("md.demo.colDelegates")],
    (d.companies || []).map((c) => [c.value, fmtNum(c.totalCount)]),
  );

  return out;
}

function sectionRegistrations(stats, delegates, liveItems, replayItems, label = "md-export") {
  const r = stats?.registrations;
  if (!r) return "";
  let out = h(2, t("md.reg.title"));

  out += h(3, t("md.reg.statuses"));
  const totalStatus = (r.statuses || []).reduce((s, x) => s + x.totalCount, 0);
  out += mdTable(
    [t("md.reg.colStatus"), t("md.reg.colDelegates"), t("md.reg.colPct")],
    (r.statuses || []).map((s) => [s.value, fmtNum(s.totalCount), fmtPct(s.totalCount, totalStatus)]),
  );

  const statusKeys = new Set();
  for (const ty of r.types || []) {
    for (const k of Object.keys(ty.statuses || {})) statusKeys.add(k);
  }
  if (statusKeys.size > 0) {
    out += h(3, t("md.reg.statusByType"));
    const keys = [...statusKeys].sort();
    out += mdTable(
      [t("md.reg.colType"), ...keys, t("md.reg.colTotal")],
      [...(r.types || [])]
        .sort((a, b) => b.totalCount - a.totalCount)
        .map((ty) => [ty.value, ...keys.map((k) => fmtNum(ty.statuses?.[k] || 0)), fmtNum(ty.totalCount)]),
    );
  }

  out += h(3, t("md.reg.typesBreakdown"));
  out += `${t("md.reg.registeredOnly")}\n\n`;
  const typesBreakdown = buildParticipationBreakdown(delegates, liveItems, replayItems, (d) => {
    const set = new Set();
    for (const reg of d.registrations || []) if (reg.type) set.add(reg.type);
    return set;
  }, label);
  out += mdTable(
    [t("md.reg.colType"), t("md.reg.colTotal"), t("md.reg.colPhysical"), t("md.reg.colLiveReplayOnly"), t("md.reg.colNoParticipation"), t("md.reg.colPresencePct")],
    typesBreakdown.map((b) => [
      b.value, fmtNum(b.total), fmtNum(b.physical), fmtNum(b.remote), fmtNum(b.none),
      fmtPct(b.physical, b.total),
    ]),
  );

  out += h(3, t("md.reg.catsBreakdown"));
  const catsBreakdown = buildParticipationBreakdown(delegates, liveItems, replayItems, (d) => {
    const set = new Set();
    for (const reg of d.registrations || []) {
      for (const c of reg.categories || []) if (c) set.add(c);
    }
    return set;
  }, label);
  out += mdTable(
    [t("md.reg.colCategory"), t("md.reg.colTotal"), t("md.reg.colPhysical"), t("md.reg.colLiveReplayOnly"), t("md.reg.colNoParticipation"), t("md.reg.colPresencePct")],
    catsBreakdown.slice(0, 15).map((b) => [
      b.value, fmtNum(b.total), fmtNum(b.physical), fmtNum(b.remote), fmtNum(b.none),
      fmtPct(b.physical, b.total),
    ]),
  );

  out += h(3, t("md.reg.accessDays"));
  out += mdTable(
    [t("md.reg.colDay"), t("md.reg.colRegistrations")],
    (r.accessDays || []).map((d) => [d.value, fmtNum(d.totalCount)]),
  );

  if ((r.multiRegistrations || []).length > 0) {
    out += h(3, t("md.reg.multiReg"));
    out += `${t("md.reg.multiRegNote")}\n\n`;
    out += mdTable(
      [t("md.reg.colDelegate"), t("md.reg.colEmail"), t("md.reg.colNbTypes"), t("md.reg.colTypes")],
      r.multiRegistrations.slice(0, 10).map((m) => [m.name, m.email, m.count, m.types.join(", ")]),
    );
  }

  return out;
}

function buildParticipationBreakdown(delegates, liveItems, replayItems, extractKeys, label = "md-export") {
  const p = computeParticipation(delegates, liveItems, replayItems, { datasetLabel: label });
  const phyIds = p.checkedIn;
  const remoteIds = new Set([...p.liveRemote, ...p.replayRemote]);

  const byKey = new Map();
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    const isPhy = phyIds.has(d.id);
    const isRemote = !isPhy && remoteIds.has(d.id);
    const keys = extractKeys(d);
    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, { physical: 0, remote: 0, none: 0 });
      const b = byKey.get(k);
      if (isPhy) b.physical++;
      else if (isRemote) b.remote++;
      else b.none++;
    }
  }
  return [...byKey.entries()]
    .map(([value, b]) => ({
      value,
      total: b.physical + b.remote + b.none,
      physical: b.physical,
      remote: b.remote,
      none: b.none,
    }))
    .sort((a, b) => b.total - a.total);
}

function sectionTemporal(stats) {
  const tp = stats?.temporal;
  if (!tp) return "";
  let out = h(2, t("md.temporal.title"));

  out += h(3, t("md.temporal.insights"));
  out += mdScalars([
    [t("md.temporal.firstReg"), tp.insights?.firstDate || "—"],
    [t("md.temporal.peak"), `${tp.insights?.peakDay?.date || "—"} (${fmtNum(tp.insights?.peakDay?.count || 0)})`],
    [t("md.temporal.avgPerDay"), (tp.insights?.avgPerDay || 0).toFixed(1)],
    [t("md.temporal.last14"), `${fmtNum(tp.insights?.lateCount || 0)} (${tp.insights?.latePercent || 0}%)`],
  ]);

  out += h(3, t("md.temporal.top15days"));
  const top = [...(tp.dailyRegistrations || [])].sort((a, b) => b.count - a.count).slice(0, 15);
  out += mdTable(
    [t("md.temporal.colDay"), t("md.temporal.colRegistrations")],
    top.map((d) => [d.date, fmtNum(d.count)]),
  );

  out += h(3, t("md.temporal.byWeekday"));
  const days = weekdayNames();
  const dow = tp.dayOfWeekDistribution || {};
  const totalDow = Object.values(dow).reduce((s, v) => s + v, 0);
  out += mdTable(
    [t("md.temporal.colDay"), t("md.temporal.colRegistrations"), t("md.temporal.colPct")],
    days.map((label, i) => [label, fmtNum(dow[i + 1] || 0), fmtPct(dow[i + 1] || 0, totalDow)]),
  );

  if ((tp.weeklyByType || []).length > 0) {
    out += h(3, t("md.temporal.weeklyByType"));
    const lastWeeks = (tp.weeklyByType || []).slice(-10);
    const allTypes = new Set();
    for (const w of lastWeeks) Object.keys(w.types || {}).forEach((t2) => allTypes.add(t2));
    const typeList = [...allTypes];
    out += mdTable(
      [t("md.temporal.colWeek"), ...typeList],
      lastWeeks.map((w) => [w.week, ...typeList.map((t2) => fmtNum(w.types?.[t2] || 0))]),
    );
  }

  if ((tp.weeklyStatuses || []).length > 0) {
    out += h(3, t("md.temporal.weeklyByStatus"));
    const lastWeeks = (tp.weeklyStatuses || []).slice(-10);
    const allStatuses = new Set();
    for (const w of lastWeeks) Object.keys(w.statuses || {}).forEach((s) => allStatuses.add(s));
    const statusList = [...allStatuses];
    out += mdTable(
      [t("md.temporal.colWeek"), ...statusList],
      lastWeeks.map((w) => [w.week, ...statusList.map((s) => fmtNum(w.statuses?.[s] || 0))]),
    );
  }

  return out;
}

function sectionCheckinFlow(stats) {
  const c = stats?.checkinFlow;
  if (!c) return "";
  let out = h(2, t("md.checkinFlow.title"));

  out += h(3, t("md.checkinFlow.peak15"));
  out += mdScalars([
    [t("md.checkinFlow.peakSlot"), `${c.peakSlot?.date || "—"} ${c.peakSlot?.time || "—"}`],
    [t("md.checkinFlow.checkinInSlot"), fmtNum(c.peakSlot?.count || 0)],
    [t("md.checkinFlow.perHour"), fmtNum((c.peakSlot?.count || 0) * 4)],
  ]);

  out += h(3, t("md.checkinFlow.byDay"));
  out += mdTable(
    [t("md.checkinFlow.colDate"), t("md.checkinFlow.colCheckin")],
    (c.byDayArray || []).map((d) => [d.date, fmtNum(d.count)]),
  );

  out += h(3, t("md.checkinFlow.top15slots"));
  const top = [...(c.per15min || [])].sort((a, b) => b.count - a.count).slice(0, 15);
  out += mdTable(
    [t("md.checkinFlow.colDate"), t("md.checkinFlow.colSlot"), t("md.checkinFlow.colCheckin")],
    top.map((s) => [s.date, s.time, fmtNum(s.count)]),
  );

  return out;
}

function sectionBadges(stats, delegates) {
  const b = stats?.badges;
  if (!b) return "";
  let out = h(2, t("md.badges.title"));

  out += h(3, t("md.badges.global"));
  out += mdScalars([
    [t("md.badges.totalDelivered"), fmtNum(b.totalDelivered || 0)],
    [t("md.badges.peak15"), t("md.badges.peakWhen", { n: fmtNum(b.peakSlot?.count || 0), date: b.peakSlot?.date || "—", time: b.peakSlot?.time || "—" })],
    [t("md.badges.peak1"), t("md.badges.peakWhen", { n: fmtNum(b.peakMinute?.count || 0), date: b.peakMinute?.date || "—", time: b.peakMinute?.time || "—" })],
  ]);

  const cbt = buildCheckinByType(delegates || []);
  if (cbt.labels.length > 0) {
    const checkinData = cbt.chartData.datasets[0]?.data || [];
    const remainingData = cbt.chartData.datasets[1]?.data || [];
    out += h(3, t("md.badges.checkinByType"));
    out += `${t("md.badges.checkinByTypeNote")}\n\n`;
    out += mdTable(
      [t("md.badges.colType"), t("md.badges.colCheckin"), t("md.badges.colRemaining"), t("md.badges.colExpected"), t("md.badges.colPresencePct")],
      cbt.labels.map((label, i) => {
        const ci = checkinData[i] || 0;
        const rem = remainingData[i] || 0;
        const total = ci + rem;
        return [label, fmtNum(ci), fmtNum(rem), fmtNum(total), fmtPct(ci, total)];
      }),
    );
  }

  const mixCounts = new Map();
  let mixTotal = 0;
  for (const d of delegates || []) {
    if (d.status?.toLowerCase() !== "registered") continue;
    if (!d.checkedInDate) continue;
    for (const r of d.registrations || []) {
      const type = r.type || "Non renseigné";
      mixCounts.set(type, (mixCounts.get(type) || 0) + 1);
      mixTotal++;
    }
  }
  if (mixTotal > 0) {
    out += h(3, t("md.badges.typesMix"));
    out += `${t("md.badges.typesMixNote")}\n\n`;
    out += mdTable(
      [t("md.badges.colType"), t("md.badges.colPresentReg"), t("md.badges.colPctMix")],
      [...mixCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => [
        type, fmtNum(count), fmtPct(count, mixTotal),
      ]),
    );
  }

  out += h(3, t("md.badges.byDevice"));
  out += mdTable(
    [t("md.badges.colDevice"), t("md.badges.colBadgesDelivered")],
    (b.byDevice || []).map((d) => [d.device, fmtNum(d.count)]),
  );

  out += h(3, t("md.badges.byDay"));
  out += mdTable(
    [t("md.badges.colDate"), t("md.badges.colBadges")],
    (b.byDay || []).map((d) => [d.date, fmtNum(d.count)]),
  );

  out += h(3, t("md.badges.top15slots"));
  const top = [...(b.per15min || [])].sort((a, b) => b.count - a.count).slice(0, 15);
  out += mdTable(
    [t("md.badges.colDate"), t("md.badges.colSlot"), t("md.badges.colBadges")],
    top.map((s) => [s.date, s.time, fmtNum(s.count)]),
  );

  return out;
}

function sectionOnboarding(stats) {
  const o = stats?.onboarding;
  if (!o) return "";
  let out = h(2, t("md.onboarding.title"));
  if (!o.daily || o.daily.length === 0) {
    out += `${t("md.onboarding.none")}\n\n`;
    return out;
  }
  out += h(3, t("md.onboarding.daily"));
  const top = [...o.daily].sort((a, b) => b.count - a.count).slice(0, 20);
  out += mdTable(
    [t("md.onboarding.colDate"), t("md.onboarding.colFirstLogins")],
    top.map((d) => [d.date, fmtNum(d.count)]),
  );
  out += mdScalars([
    [t("md.onboarding.first"), o.daily[0]?.date || "—"],
    [t("md.onboarding.last"), o.daily[o.daily.length - 1]?.date || "—"],
  ]);
  return out;
}

function sectionMobileApp(stats) {
  const m = stats?.mobileApp;
  if (!m || (m.count || 0) === 0) return "";
  let out = h(2, t("md.mobile.title"));
  out += mdScalars([
    [t("md.mobile.activeDelegates"), fmtNum(m.count)],
  ]);
  if ((m.daily || []).length > 0) {
    out += h(3, t("md.mobile.adoption"));
    const top = [...m.daily].sort((a, b) => b.count - a.count).slice(0, 15);
    out += mdTable(
      [t("md.mobile.colDate"), t("md.mobile.colUsers")],
      top.map((d) => [d.date, fmtNum(d.count)]),
    );
  }
  return out;
}

// `label` = libelle localise de la section (Live / Replay), passe par renderEventBody.
function sectionLiveReplay(label, viewerStats, delegates, labelKey) {
  if (!viewerStats || !viewerStats.global) return "";
  const g = viewerStats.global;
  if ((g.totalViews || 0) === 0 && (g.uniqueUsers || 0) === 0) return "";

  const lookup = buildDelegateLookup(delegates || [], { datasetLabel: `md-export-${labelKey}` });
  const remoteSize = getRemoteOnlyDelegateIds(viewerStats.items || [], lookup, { datasetLabel: `md-export-${labelKey}-remote` }).size;

  let out = h(2, label);

  out += h(3, t("md.viewers.global"));
  out += mdScalars([
    [t("md.viewers.uniqueDelegates"), fmtNum(g.uniqueUsers || 0)],
    [t("md.viewers.withoutPhysical", { label }), fmtNum(remoteSize)],
    [t("md.viewers.totalViews"), fmtNum(g.totalViews || 0)],
    [t("md.viewers.distinctSessions"), fmtNum(g.distinctSessions || 0)],
    [t("md.viewers.avgDuration"), fmtDuration(g.avgViewDurationSec || 0)],
    [t("md.viewers.totalDuration"), fmtDuration(g.totalDurationSec || 0)],
  ]);

  if ((viewerStats.origins || []).length > 0) {
    out += h(3, t("md.viewers.byOrigin"));
    const totalOrig = viewerStats.origins.reduce((s, o) => s + o.views, 0);
    out += mdTable(
      [t("md.viewers.colOrigin"), t("md.viewers.colViews"), t("md.viewers.colUniqueDelegates"), t("md.viewers.colPct")],
      viewerStats.origins.map((o) => [o.origin, fmtNum(o.views), fmtNum(o.uniqueUsers), fmtPct(o.views, totalOrig)]),
    );
  }

  if ((viewerStats.topSessions || []).length > 0) {
    out += h(3, t("md.viewers.topSessions"));
    out += mdTable(
      [t("md.viewers.colSessionId"), t("md.viewers.colTitle"), t("md.viewers.colUniqueDelegates"), t("md.viewers.colViews"), t("md.viewers.colAvgDuration")],
      viewerStats.topSessions.slice(0, 20).map((s) => [
        s.sessionId || s.id || "—", s.title || "—",
        fmtNum(s.uniqueUsers || 0), fmtNum(s.views || 0), fmtDuration(s.avgDuration || 0),
      ]),
    );
  }

  if (viewerStats.sessionsPerUserBuckets) {
    out += h(3, t("md.viewers.engagement"));
    const b = viewerStats.sessionsPerUserBuckets;
    const total = (b["1"] || 0) + (b["2-5"] || 0) + (b["6-10"] || 0) + (b["10+"] || 0);
    out += mdTable(
      [t("md.viewers.colBucket"), t("md.viewers.colDelegates"), t("md.viewers.colPct")],
      [
        [t("md.viewers.bucket1"), fmtNum(b["1"] || 0), fmtPct(b["1"] || 0, total)],
        [t("md.viewers.bucket25"), fmtNum(b["2-5"] || 0), fmtPct(b["2-5"] || 0, total)],
        [t("md.viewers.bucket610"), fmtNum(b["6-10"] || 0), fmtPct(b["6-10"] || 0, total)],
        [t("md.viewers.bucket10p"), fmtNum(b["10+"] || 0), fmtPct(b["10+"] || 0, total)],
      ],
    );
  }

  if ((viewerStats.uniqueByDay || []).length > 0) {
    // Replay : table enrichie (uniques + nouveaux + cumul) alignee sur l'ordre
    // des jours de uniqueByDay. Live : table simple.
    if (labelKey === "replay") {
      const newByDay = viewerStats.newUniqueByDay || [];
      const cumul = viewerStats.cumulativeUniqueByDay || [];
      out += h(3, t("md.viewers.uniqueByDay"));
      out += mdTable(
        [t("md.viewers.colDay"), t("md.viewers.colUniqueDelegates"), t("md.viewers.colNewDelegates"), t("md.viewers.colCumulDelegates")],
        viewerStats.uniqueByDay.map((d, i) => [
          d.day, fmtNum(d.count),
          fmtNum(newByDay[i]?.count ?? 0),
          fmtNum(cumul[i]?.count ?? 0),
        ]),
      );
    } else {
      out += h(3, t("md.viewers.uniqueByDay"));
      out += mdTable(
        [t("md.viewers.colDay"), t("md.viewers.colUniqueDelegates")],
        viewerStats.uniqueByDay.map((d) => [d.day, fmtNum(d.count)]),
      );
    }
  }

  // Replay : nombre de vues par jour (+ cumul).
  if (labelKey === "replay" && (viewerStats.viewsByDay || []).length > 0) {
    const cumulViews = viewerStats.cumulativeViewsByDay || [];
    out += h(3, t("md.viewers.viewsByDay"));
    out += mdTable(
      [t("md.viewers.colDay"), t("md.viewers.colViews"), t("md.viewers.colCumulViews")],
      viewerStats.viewsByDay.map((d, i) => [d.day, fmtNum(d.count), fmtNum(cumulViews[i]?.count ?? 0)]),
    );
  }

  // Live : delegues uniques par jour ET par chaine de diffusion.
  if (labelKey === "live") {
    const ch = viewerStats.uniqueByDayByChannel;
    if (ch && (ch.channels || []).length > 0 && (ch.days || []).length > 0) {
      out += h(3, t("md.viewers.byDayChannel"));
      out += mdTable(
        [t("md.viewers.colDay"), ...ch.channels.map((c) => c.label || c.id)],
        ch.days.map((day) => [day, ...ch.channels.map((c) => fmtNum(ch.byDay?.[day]?.[c.id] || 0))]),
      );
    }
  }

  if ((viewerStats.sessionTypes || []).length > 0) {
    out += h(3, t("md.viewers.bySessionType"));
    const totalType = viewerStats.sessionTypes.reduce((s, t2) => s + t2.views, 0);
    out += mdTable(
      [t("md.viewers.colType"), t("md.viewers.colViews"), t("md.viewers.colUniqueDelegates"), t("md.viewers.colPct")],
      viewerStats.sessionTypes.map((ty) => [ty.type, fmtNum(ty.views), fmtNum(ty.uniqueUsers), fmtPct(ty.views, totalType)]),
    );
  }

  if ((viewerStats.uniqueBy30min || []).length > 0) {
    out += h(3, t("md.viewers.top20slots"));
    const top = [...viewerStats.uniqueBy30min].sort((a, b) => b.count - a.count).slice(0, 20);
    out += mdTable(
      [t("md.viewers.colSlot"), t("md.viewers.colUniqueDelegates")],
      top.map((s) => [s.slot, fmtNum(s.count)]),
    );
  }

  return out;
}

function sectionScans(scanStats) {
  if (!scanStats || !scanStats.global) return "";
  const g = scanStats.global;
  if (
    (g.totalAudienceScans || 0) === 0 &&
    (g.totalCheckinScans || 0) === 0 &&
    (g.totalZoneScans || 0) === 0
  ) return "";

  let out = h(2, t("md.scans.title"));
  out += h(3, t("md.scans.volumetry"));
  out += mdTable(
    [t("md.scans.colSource"), t("md.scans.colTotalScans"), t("md.scans.colUniqueDelegates")],
    [
      [t("md.scans.audience"), fmtNum(g.totalAudienceScans || 0), fmtNum(g.uniqueAudienceDelegates || 0)],
      [t("md.scans.checkin"), fmtNum(g.totalCheckinScans || 0), fmtNum(g.uniqueCheckinDelegates || 0)],
      [t("md.scans.zones"), fmtNum(g.totalZoneScans || 0), fmtNum(g.uniqueZoneDelegates || 0)],
      [t("md.scans.total"), fmtNum(g.totalScans || 0), fmtNum(g.uniqueDelegatesAll || 0)],
    ],
  );
  out += mdScalars([
    [t("md.scans.roomViews"), fmtNum(g.audienceUniqueDelegateSessions || 0)],
    [t("md.scans.distinctSessions"), fmtNum(g.distinctSessions || 0)],
    [t("md.scans.distinctRooms"), fmtNum(g.distinctRooms || 0)],
    [t("md.scans.distinctZones"), fmtNum(g.distinctZones || 0)],
  ]);
  out += `${t("md.scans.roomViewsNote")}\n\n`;

  if ((scanStats.audience?.topSessions || []).length > 0) {
    out += h(3, t("md.scans.topSessions"));
    out += mdTable(
      [t("md.scans.colSessionRoom"), t("md.scans.colUniqueDelegates"), t("md.scans.colScans")],
      scanStats.audience.topSessions.slice(0, 15).map((s) => [
        s.label || s.name || "—", fmtNum(s.uniqueDelegates || 0), fmtNum(s.count || 0),
      ]),
    );
  }

  if ((scanStats.audience?.topRooms || []).length > 0) {
    out += h(3, t("md.scans.topRooms"));
    out += mdTable(
      [t("md.scans.colRoom"), t("md.scans.colScans")],
      scanStats.audience.topRooms.slice(0, 15).map((r) => [r.label || r.name || "—", fmtNum(r.count || 0)]),
    );
  }

  if ((scanStats.zone?.topZones || []).length > 0) {
    out += h(3, t("md.scans.topZones"));
    out += mdTable(
      [t("md.scans.colZone"), t("md.scans.colScans")],
      scanStats.zone.topZones.slice(0, 15).map((z) => [z.label || z.name || "—", fmtNum(z.count || 0)]),
    );
  }

  // Delegues uniques par jour, ventiles par source (audience / check-in / zones).
  const combined = scanStats.combined || {};
  const byDay = Object.entries(combined.uniqueDelegatesByDay || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (byDay.length > 0) {
    const aud = combined.uniqueDelegatesByDayAudience || {};
    const chk = combined.uniqueDelegatesByDayCheckin || {};
    const zon = combined.uniqueDelegatesByDayZone || {};
    out += h(3, t("md.scans.uniqueByDay"));
    out += mdTable(
      [t("md.scans.colDay"), t("md.scans.colUniqueDelegates"), t("md.scans.dirAudience"), t("md.scans.dirCheckin"), t("md.scans.dirZones")],
      byDay.map(([day, count]) => [day, fmtNum(count), fmtNum(aud[day] || 0), fmtNum(chk[day] || 0), fmtNum(zon[day] || 0)]),
    );
  }

  // Scans de zone PAR JOUR : { jour: { zoneId: count } } reconstruit depuis les
  // scans bruts (cf. graphe "Scans par zone (par jour)" de l'onglet Scans).
  const zoneScans = scanStats.zone?.scans || [];
  if (zoneScans.length > 0) {
    const byDayZone = {}; // day -> { zoneId: count }
    const zoneTotals = {};
    for (const s of zoneScans) {
      if (!s.zoneId) continue;
      const ms = toEpochMs(s.timestamp);
      if (ms == null) continue;
      const day = new Date(ms).toISOString().slice(0, 10);
      if (!byDayZone[day]) byDayZone[day] = {};
      byDayZone[day][s.zoneId] = (byDayZone[day][s.zoneId] || 0) + 1;
      zoneTotals[s.zoneId] = (zoneTotals[s.zoneId] || 0) + 1;
    }
    const days = Object.keys(byDayZone).sort();
    const zoneIds = Object.keys(zoneTotals).sort((a, b) => zoneTotals[b] - zoneTotals[a]);
    if (days.length > 0 && zoneIds.length > 0) {
      out += h(3, t("md.scans.zoneByDay"));
      out += mdTable(
        [t("md.scans.colDay"), ...zoneIds],
        days.map((day) => [day, ...zoneIds.map((zid) => fmtNum(byDayZone[day]?.[zid] || 0))]),
      );
    }
  }

  // Flux de scans par heure : 3 series (audience / check-in / zones) alignees
  // sur "jour HHh" (cf. timeline tri-source de l'onglet Scans).
  const flatten = (byDayHour) => {
    const map = new Map();
    for (const [day, hours] of Object.entries(byDayHour || {})) {
      for (const [hour, count] of Object.entries(hours)) map.set(`${day} ${hour}h`, count);
    }
    return map;
  };
  const audH = flatten(scanStats.audience?.byHour);
  const chkH = flatten(scanStats.checkin?.byHour);
  const zonH = flatten(scanStats.zone?.byHour);
  const slots = [...new Set([...audH.keys(), ...chkH.keys(), ...zonH.keys()])].sort();
  if (slots.length > 0) {
    out += h(3, t("md.scans.hourlyFlow"));
    out += mdTable(
      [t("md.scans.colDayHour"), t("md.scans.dirAudience"), t("md.scans.dirCheckin"), t("md.scans.dirZones")],
      slots.map((s) => [s, fmtNum(audH.get(s) || 0), fmtNum(chkH.get(s) || 0), fmtNum(zonH.get(s) || 0)]),
    );
  }

  const dirRows = [
    [t("md.scans.dirAudience"), scanStats.audience?.byDirection],
    [t("md.scans.dirCheckin"), scanStats.checkin?.byDirection],
    [t("md.scans.dirZones"), scanStats.zone?.byDirection],
  ].filter(([, d]) => d && (d.in || d.out || d.unknown));
  if (dirRows.length > 0) {
    out += h(3, t("md.scans.direction"));
    out += `${t("md.scans.directionNote")}\n\n`;
    out += mdTable(
      [t("md.scans.colSource"), t("md.scans.colEntry"), t("md.scans.colExit"), t("md.scans.colUnknown")],
      dirRows.map(([label, d]) => [label, fmtNum(d.in || 0), fmtNum(d.out || 0), fmtNum(d.unknown || 0)]),
    );
  }

  for (const [title, map] of [
    [t("md.scans.audienceByBadge"), scanStats.audience?.byBadgeType],
    [t("md.scans.checkinByBadge"), scanStats.checkin?.byBadgeType],
  ]) {
    const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) continue;
    const totalBt = entries.reduce((s, [, v]) => s + v, 0);
    out += h(3, title);
    out += mdTable(
      [t("md.scans.colBadgeType"), t("md.scans.colScans"), t("md.demo.colPct")],
      entries.map(([type, count]) => [type, fmtNum(count), fmtPct(count, totalBt)]),
    );
  }

  return out;
}

function sectionComparison({ stats, compareStats, eventName, compareEventName }) {
  if (!compareStats || !compareEventName) return "";
  const a = stats?.global;
  const b = compareStats?.global;
  if (!a || !b) return "";

  function delta(va, vb) {
    if (va == null || vb == null) return "—";
    const d = va - vb;
    const sign = d > 0 ? "+" : d < 0 ? "−" : "=";
    const pct = vb > 0 ? ((d / vb) * 100).toFixed(1) : "—";
    return `${sign}${fmtNum(Math.abs(d))} (${sign === "=" ? "0" : (sign + Math.abs(pct))}%)`;
  }

  let out = h(2, t("md.comparison.title", { a: eventName, b: compareEventName }));
  out += mdTable(
    [t("md.comparison.colIndicator"), eventName || t("md.comparison.eventAFallback"), compareEventName || t("md.comparison.eventBFallback"), t("md.comparison.colDelta")],
    [
      [t("md.comparison.totalRegistered"), fmtNum(a.totalDelegatesCount), fmtNum(b.totalDelegatesCount), delta(a.totalDelegatesCount, b.totalDelegatesCount)],
      [t("md.comparison.checkin"), fmtNum(a.checkedInCount), fmtNum(b.checkedInCount), delta(a.checkedInCount, b.checkedInCount)],
      [t("md.comparison.badges"), fmtNum(a.totalBadgesDelivered), fmtNum(b.totalBadgesDelivered), delta(a.totalBadgesDelivered, b.totalBadgesDelivered)],
      [t("md.comparison.onboarding"), fmtNum(a.onboardingCount), fmtNum(b.onboardingCount), delta(a.onboardingCount, b.onboardingCount)],
      [t("md.comparison.mobile"), fmtNum(a.mobileAppCount), fmtNum(b.mobileAppCount), delta(a.mobileAppCount, b.mobileAppCount)],
    ],
  );
  return out;
}

function sectionAnalysis({ stats, registeredCount, eventName, compareStats, compareEventName, delegates, compareDelegates }) {
  if (!stats) return "";
  const sections = generateAnalysis(stats, registeredCount, eventName, {
    compareStats: compareStats || null,
    compareEventName: compareEventName || null,
    delegates: delegates || null,
    compareDelegates: compareDelegates || null,
  });
  if (!sections || sections.length === 0) return "";
  let out = h(2, t("md.analysisSection.title"));
  out += `${t("md.analysisSection.note")}\n\n`;
  for (const s of sections) {
    out += h(3, s.title);
    for (const b of s.bullets || []) {
      out += `- ${b}\n`;
    }
    out += "\n";
  }
  return out;
}

function sectionFooter({ eventName, compareEventName }) {
  let out = h(2, t("md.footer.title"));
  out += `- ${t("md.footer.source")}\n`;
  out += `- ${t("md.footer.time")}\n`;
  out += `- ${t("md.footer.checkin")}\n`;
  out += `- ${t("md.footer.remote")}\n`;
  out += `- ${t("md.footer.categories")}\n`;
  if (compareEventName) {
    out += `- ${t("md.footer.comparison", { a: eventName, b: compareEventName })}\n`;
  }
  out += "\n";
  out += `### ${t("md.footer.promptsTitle")}\n\n`;
  out += `- ${t("md.footer.prompt1")}\n`;
  out += `- ${t("md.footer.prompt2")}\n`;
  out += `- ${t("md.footer.prompt3")}\n`;
  if (compareEventName) {
    out += `- ${t("md.footer.promptCompare")}\n`;
  }
  out += `- ${t("md.footer.prompt4")}\n`;
  out += `- ${t("md.footer.prompt5")}\n`;
  return out;
}

// Rend le corps complet d'UN event (toutes les sections per-event, dans le
// meme ordre que l'event principal).
function renderEventBody({ stats, delegates = [], liveStats = null, replayStats = null, scanStats = null, participationLabel = "md-export" }) {
  const liveItems = liveStats?.items || [];
  const replayItems = replayStats?.items || [];
  let out = "";
  out += sectionGlobal(stats, delegates);
  out += sectionTotalParticipants(delegates, liveItems, replayItems, participationLabel);
  out += sectionDemographics(stats, delegates);
  out += sectionRegistrations(stats, delegates, liveItems, replayItems, participationLabel);
  out += sectionTemporal(stats);
  out += sectionCheckinFlow(stats);
  out += sectionBadges(stats, delegates);
  out += sectionOnboarding(stats);
  out += sectionMobileApp(stats);
  out += sectionLiveReplay(t("md.viewers.liveLabel"), liveStats, delegates, "live");
  out += sectionLiveReplay(t("md.viewers.replayLabel"), replayStats, delegates, "replay");
  out += sectionScans(scanStats);
  return out;
}

// --- Composable principal ---------------------------------------------------

export function useExportMarkdown() {
  const exportingMd = ref(false);

  function safeFileName(name) {
    return (name || "event").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
  }

  function downloadBlob(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildMarkdown(opts) {
    const {
      eventId,
      eventName,
      delegates = [],
      stats,
      compareStats = null,
      compareEventName = null,
      compareDelegates = null,
      compareLiveStats = null,
      compareReplayStats = null,
      liveStats = null,
      replayStats = null,
      scanStats = null,
      compareScanStats = null,
      badgeFilterTypes = [],
    } = opts;

    const registered = delegates.filter((d) => d.status?.toLowerCase() === "registered").length;

    let md = "";
    md += `# ${t("md.doc.title", { name: eventName || eventId || "Event" })}\n\n`;
    md += `> ${t("md.doc.intro")}\n\n`;

    md += sectionMetadata({
      eventId,
      eventName,
      delegatesCount: delegates.length,
      filterState: badgeFilterTypes,
      compareEventName,
    });

    md += renderEventBody({ stats, delegates, liveStats, replayStats, scanStats, participationLabel: "md-export" });

    md += sectionComparison({ stats, compareStats, eventName, compareEventName });
    md += sectionAnalysis({
      stats, registeredCount: registered, eventName,
      compareStats, compareEventName, delegates, compareDelegates,
    });
    md += sectionFooter({ eventName, compareEventName });

    if (compareStats && compareEventName) {
      const hasCompareScans =
        compareScanStats?.global &&
        ((compareScanStats.global.totalAudienceScans || 0) > 0 ||
          (compareScanStats.global.totalCheckinScans || 0) > 0 ||
          (compareScanStats.global.totalZoneScans || 0) > 0);
      md += "---\n\n";
      md += `# ${t("md.doc.annexTitle", { name: compareEventName })}\n\n`;
      md += `> ${t("md.doc.annexIntro", { name: compareEventName })}${hasCompareScans ? "" : t("md.doc.annexNoScans")}\n\n`;
      md += renderEventBody({
        stats: compareStats,
        delegates: compareDelegates || [],
        liveStats: compareLiveStats,
        replayStats: compareReplayStats,
        scanStats: compareScanStats,
        participationLabel: "md-export-compare",
      });
    }

    return md;
  }

  async function exportToMarkdown(opts) {
    if (exportingMd.value) return;
    exportingMd.value = true;
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const base = safeFileName(opts.eventName || opts.eventId);

      // 1) Markdown (bilan lisible + LLM-ready).
      const md = buildMarkdown(opts);
      downloadBlob(md, "text/markdown;charset=utf-8", `bilan-${base}-${dateStr}.md`);

      // 2) Dump JSON integral des donnees source (100% des donnees ayant servi
      // a produire les stats). Petit delai pour ne pas que le navigateur bloque
      // le 2e telechargement declenche dans le meme tick.
      try {
        const dump = buildDataDump(opts);
        const json = JSON.stringify(dump, jsonReplacer, 2);
        await new Promise((r) => setTimeout(r, 300));
        downloadBlob(json, "application/json;charset=utf-8", `donnees-${base}-${dateStr}.json`);
      } catch (e) {
        // Le dump JSON ne doit jamais faire echouer l'export MD principal.
        console.error("JSON dump export failed:", e);
      }
    } catch (e) {
      console.error("MD export failed:", e);
      throw e;
    } finally {
      exportingMd.value = false;
    }
  }

  return { exportingMd, exportToMarkdown };
}
