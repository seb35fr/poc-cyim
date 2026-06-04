/**
 * Genere une analyse textuelle automatique a partir des stats.
 * Retourne un tableau de sections { title, bullets[] }.
 *
 * Note métier : le check-in est l'indicateur de présence à privilégier.
 * Le compte de badges délivrés est moins fiable (erreur humaine à l'accueil :
 * badge réimprimé non flaggé, lot pré-imprimé distribué manuellement, etc.)
 *
 * Les libelles sont localises via i18n (namespace `analysis.*`) ; l'analyse
 * suit la langue active au moment de la generation (export MD notamment).
 *
 * @param stats - stats principales de l'event
 * @param registeredCount - nombre de delegates registered
 * @param eventName - nom de l'event
 * @param options.compareStats - stats de l'event comparé (optionnel)
 * @param options.compareEventName - nom de l'event comparé (optionnel)
 */
import { fmt, pct } from "./formatters.js";
import { i18n } from "@/i18n/index.js";

const t = (key, named) => i18n.global.t(key, named || {});

function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatDays(d) {
  if (d == null) return "—";
  if (d < 1) return `${(d * 24).toFixed(1)} ${t("analysis.unitHours")}`;
  if (d < 30) return `${d.toFixed(1)} ${t("analysis.unitDays")}`;
  return `${Math.round(d)} ${t("analysis.unitDays")}`;
}

/**
 * @param stats - stats principales de l'event (sortie de computeAllStats)
 * @param registeredCount - nombre de delegates registered
 * @param eventName - nom de l'event
 * @param options.compareStats - stats de l'event comparé (optionnel)
 * @param options.compareEventName - nom de l'event comparé (optionnel)
 * @param options.delegates - liste brute des delegues (necessaire pour calculer
 *   le delai median inscription -> check-in et le mix des presents)
 * @param options.compareDelegates - idem pour l'event de comparaison
 */
export function generateAnalysis(stats, registeredCount, eventName, options = {}) {
  const {
    compareStats = null,
    compareEventName = null,
    delegates = null,
    compareDelegates = null,
  } = options;
  const sections = [];
  const g = stats.global;

  // --- Chiffres cles ---
  const keyFacts = [];
  keyFacts.push(t("analysis.keyFacts.total", { total: fmt(g.totalDelegatesCount), registered: fmt(registeredCount) }));
  if (g.checkedInCount > 0) {
    keyFacts.push(t("analysis.keyFacts.presenceRate", { pct: pct(g.checkedInCount, registeredCount), n: fmt(g.checkedInCount) }));
    const noShow = registeredCount - g.checkedInCount;
    if (noShow > 0 && registeredCount > 0) {
      keyFacts.push(t("analysis.keyFacts.noShow", { pct: pct(noShow, registeredCount), n: fmt(noShow) }));
    }
  }
  if (g.onboardingCount > 0) {
    keyFacts.push(t("analysis.keyFacts.onboarding", { pct: pct(g.onboardingCount, registeredCount), n: fmt(g.onboardingCount) }));
  }
  if (g.mobileAppCount > 0) {
    keyFacts.push(t("analysis.keyFacts.mobileApp", { pct: pct(g.mobileAppCount, registeredCount), n: fmt(g.mobileAppCount) }));
  }
  if (g.pendingCount > 0) {
    keyFacts.push(t("analysis.keyFacts.pending", { n: fmt(g.pendingCount), pct: pct(g.pendingCount, g.totalDelegatesCount) }));
  }
  // Delai median inscription -> check-in (proxy d'engagement)
  if (delegates && Array.isArray(delegates)) {
    const deltas = [];
    for (const d of delegates) {
      if (!d.checkedInDate || !d.createdAt) continue;
      const t1 = Date.parse(d.checkedInDate);
      const t0 = Date.parse(d.createdAt);
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
        deltas.push((t1 - t0) / 86_400_000);
      }
    }
    const m = median(deltas);
    if (m != null) {
      keyFacts.push(t("analysis.keyFacts.medianDelay", { delay: formatDays(m), n: fmt(deltas.length) }));
    }
  }
  sections.push({ title: t("analysis.sectionTitles.keyFacts"), bullets: keyFacts });

  // --- Mix des presents (registered ET checkedIn) ---
  if (delegates && Array.isArray(delegates)) {
    const mixCounts = new Map();
    let mixTotal = 0;
    for (const d of delegates) {
      if (d.status?.toLowerCase() !== "registered") continue;
      if (!d.checkedInDate) continue;
      for (const r of d.registrations || []) {
        const type = r.type || "Non renseigne";
        mixCounts.set(type, (mixCounts.get(type) || 0) + 1);
        mixTotal++;
      }
    }
    if (mixTotal > 0) {
      const mix = [];
      const sortedTypes = [...mixCounts.entries()].sort((a, b) => b[1] - a[1]);
      mix.push(t("analysis.attendeeProfile.population", { n: fmt(mixTotal) }));
      const top = sortedTypes.slice(0, 3).map(([type, n]) => `${type} (${pct(n, mixTotal)})`).join(", ");
      mix.push(t("analysis.attendeeProfile.topTypes", { top }));
      sections.push({ title: t("analysis.sectionTitles.attendeeProfile"), bullets: mix });
    }
  }

  // --- Demographie ---
  const demo = [];
  const countries = stats.demographics?.countries || [];
  const uniqueCountries = countries.filter((c) => c.value !== "Non renseigne").length;
  demo.push(t("analysis.demographics.countries", { n: uniqueCountries }));
  if (countries.length > 0) {
    const top3 = countries.slice(0, 3).map((c) => `${c.value} (${fmt(c.totalCount)})`).join(", ");
    demo.push(t("analysis.demographics.topCountries", { top: top3 }));
  }
  const companies = stats.demographics?.companies || [];
  if (companies.length > 0) {
    demo.push(t("analysis.demographics.companies", { n: companies.length }));
  }
  const genders = stats.demographics?.genders || [];
  const nonRenseigneGender = genders.find((gg) => gg.value === "Non renseigne");
  if (nonRenseigneGender && g.totalDelegatesCount > 0) {
    const pctNR = ((nonRenseigneGender.totalCount / g.totalDelegatesCount) * 100).toFixed(0);
    if (pctNR > 30) {
      demo.push(t("analysis.demographics.genderMissing", { pct: pctNR }));
    }
  }
  sections.push({ title: t("analysis.sectionTitles.demographics"), bullets: demo });

  // --- Inscriptions ---
  const reg = [];
  const types = stats.registrations?.types || [];
  if (types.length > 0) {
    reg.push(t("analysis.registrations.types", { n: types.length }));
    const topType = types[0];
    reg.push(t("analysis.registrations.dominantType", { type: topType.value, n: fmt(topType.totalCount), pct: pct(topType.totalCount, g.totalDelegatesCount) }));
  }
  const multiRegs = stats.registrations?.multiRegistrations || [];
  if (multiRegs.length > 0) {
    reg.push(t("analysis.registrations.multiReg", { n: fmt(multiRegs.length) }));
  }
  const cancelled = stats.registrations?.statuses?.find((s) => s.value?.toLowerCase().includes("cancel"));
  if (cancelled && cancelled.totalCount > 0) {
    reg.push(t("analysis.registrations.cancellation", { pct: pct(cancelled.totalCount, g.totalDelegatesCount), n: fmt(cancelled.totalCount) }));
  }
  sections.push({ title: t("analysis.sectionTitles.registrations"), bullets: reg });

  // --- Dynamique ---
  const temporal = [];
  const insights = stats.temporal?.insights;
  if (insights) {
    if (insights.peakDay?.date !== "-") {
      temporal.push(t("analysis.temporal.peak", { date: insights.peakDay.date, n: fmt(insights.peakDay.count) }));
    }
    if (insights.avgPerDay > 0) {
      temporal.push(t("analysis.temporal.avg", { n: insights.avgPerDay.toFixed(1) }));
    }
    if (insights.firstDate !== "-") {
      temporal.push(t("analysis.temporal.first", { date: insights.firstDate }));
    }
  }
  sections.push({ title: t("analysis.sectionTitles.temporal"), bullets: temporal });

  // --- Check-in & Badges (check-in en premier, badge en complément) ---
  const checkinBadges = [];
  if (g.checkedInCount > 0) {
    checkinBadges.push(t("analysis.checkinBadges.checkin", { n: fmt(g.checkedInCount), pct: pct(g.checkedInCount, registeredCount) }));
  }
  const checkinPeak = stats.checkinFlow?.peakSlot;
  if (checkinPeak?.count > 0) {
    checkinBadges.push(t("analysis.checkinBadges.peak", { n: checkinPeak.count, date: checkinPeak.date, time: checkinPeak.time, rate: checkinPeak.count * 4 }));
  }
  if (g.totalBadgesDelivered > 0) {
    const delta = g.checkedInCount - g.totalBadgesDelivered;
    checkinBadges.push(t("analysis.checkinBadges.badges", { n: fmt(g.totalBadgesDelivered), pct: pct(g.totalBadgesDelivered, registeredCount) }));
    if (delta > 0) {
      checkinBadges.push(t("analysis.checkinBadges.delta", { n: fmt(delta) }));
    }
  }
  const badgePeak = stats.badges?.peakSlot;
  if (badgePeak?.count > 0) {
    checkinBadges.push(t("analysis.checkinBadges.badgePeak", { n: badgePeak.count, date: badgePeak.date, time: badgePeak.time }));
  }
  const devices = stats.badges?.byDevice || [];
  if (devices.length > 0) {
    checkinBadges.push(t("analysis.checkinBadges.devices", { n: devices.length }));
  }
  if (checkinBadges.length > 0) {
    sections.push({ title: t("analysis.sectionTitles.checkinBadges"), bullets: checkinBadges });
  }

  // --- Recommandations ---
  const reco = [];
  if (registeredCount > 0 && g.onboardingCount / registeredCount < 0.6) {
    reco.push(t("analysis.reco.onboardingLow", { pct: pct(g.onboardingCount, registeredCount) }));
  }
  if (g.pendingCount > 0 && g.pendingCount / g.totalDelegatesCount > 0.1) {
    reco.push(t("analysis.reco.pendingHigh", { pct: pct(g.pendingCount, g.totalDelegatesCount) }));
  }
  if (registeredCount > 0 && g.mobileAppCount / registeredCount < 0.2 && g.mobileAppCount >= 0) {
    reco.push(t("analysis.reco.mobileLow", { pct: pct(g.mobileAppCount, registeredCount) }));
  }
  if (registeredCount > 0 && g.checkedInCount > 0) {
    const remaining = registeredCount - g.checkedInCount;
    if (remaining > 0) {
      reco.push(t("analysis.reco.remaining", { n: fmt(remaining) }));
    }
  }
  const nonRenseigneCountry = countries.find((c) => c.value === "Non renseigne");
  if (nonRenseigneCountry && nonRenseigneCountry.totalCount / g.totalDelegatesCount > 0.2) {
    reco.push(t("analysis.reco.countryMissing", { pct: pct(nonRenseigneCountry.totalCount, g.totalDelegatesCount) }));
  }
  if (reco.length > 0) {
    sections.push({ title: t("analysis.sectionTitles.recommendations"), bullets: reco });
  }

  // --- Comparatif (seulement si event de comparaison fourni) ---
  if (compareStats && compareEventName) {
    const cmp = compareStats.global;
    const cmpRegistered = compareStats.global?.totalDelegatesCount || 0;
    const cmpRegisteredOnly = compareStats?.registrations?.statuses?.find(
      (s) => s.value?.toLowerCase() === "registered"
    )?.totalCount || cmpRegistered;

    const deltaPct = (a, b) => {
      if (!b) return "—";
      const d = ((a - b) / b) * 100;
      const sign = d >= 0 ? "+" : "";
      return `${sign}${d.toFixed(1)}%`;
    };
    const deltaPpts = (a, b) => {
      const d = a - b;
      const sign = d >= 0 ? "+" : "";
      return `${sign}${d.toFixed(1)} pts`;
    };

    const compare = [];
    compare.push(
      t("analysis.comparison.registered", {
        a: fmt(g.totalDelegatesCount),
        eventA: eventName || t("analysis.currentFallback"),
        b: fmt(cmp.totalDelegatesCount),
        eventB: compareEventName,
        delta: deltaPct(g.totalDelegatesCount, cmp.totalDelegatesCount),
      }),
    );
    if (g.checkedInCount > 0 || cmp.checkedInCount > 0) {
      const aPres = registeredCount > 0 ? (g.checkedInCount / registeredCount) * 100 : 0;
      const bPres = cmpRegisteredOnly > 0 ? (cmp.checkedInCount / cmpRegisteredOnly) * 100 : 0;
      compare.push(t("analysis.comparison.presence", { a: aPres.toFixed(1), b: bPres.toFixed(1), delta: deltaPpts(aPres, bPres) }));
    }
    const curCheckinPeak = stats.checkinFlow?.peakSlot;
    const cmpCheckinPeak = compareStats?.checkinFlow?.peakSlot;
    if (curCheckinPeak?.count > 0 || cmpCheckinPeak?.count > 0) {
      compare.push(t("analysis.comparison.checkinPeak", {
        a: curCheckinPeak?.count || 0,
        b: cmpCheckinPeak?.count || 0,
        ah: (curCheckinPeak?.count || 0) * 4,
        bh: (cmpCheckinPeak?.count || 0) * 4,
      }));
    }
    if (g.onboardingCount > 0 || cmp.onboardingCount > 0) {
      const aOn = g.totalDelegatesCount > 0 ? (g.onboardingCount / g.totalDelegatesCount) * 100 : 0;
      const bOn = cmp.totalDelegatesCount > 0 ? (cmp.onboardingCount / cmp.totalDelegatesCount) * 100 : 0;
      compare.push(t("analysis.comparison.onboarding", { a: aOn.toFixed(1), b: bOn.toFixed(1), delta: deltaPpts(aOn, bOn) }));
    }
    if (g.mobileAppCount > 0 || cmp.mobileAppCount > 0) {
      const aApp = g.totalDelegatesCount > 0 ? (g.mobileAppCount / g.totalDelegatesCount) * 100 : 0;
      const bApp = cmp.totalDelegatesCount > 0 ? (cmp.mobileAppCount / cmp.totalDelegatesCount) * 100 : 0;
      compare.push(t("analysis.comparison.mobile", { a: aApp.toFixed(1), b: bApp.toFixed(1), delta: deltaPpts(aApp, bApp) }));
    }
    // Diversite geographique
    const aPays = stats.demographics?.uniqueCountries || 0;
    const bPays = compareStats.demographics?.uniqueCountries || 0;
    if (aPays > 0 || bPays > 0) {
      compare.push(t("analysis.comparison.geoDiversity", { a: aPays, b: bPays }));
    }
    // Delai median inscription -> check-in (compare si les deux listes dispo)
    if (Array.isArray(delegates) && Array.isArray(compareDelegates)) {
      const calc = (list) => {
        const d = [];
        for (const x of list) {
          if (!x.checkedInDate || !x.createdAt) continue;
          const t1 = Date.parse(x.checkedInDate);
          const t0 = Date.parse(x.createdAt);
          if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) d.push((t1 - t0) / 86_400_000);
        }
        return median(d);
      };
      const a = calc(delegates);
      const b = calc(compareDelegates);
      if (a != null && b != null) {
        compare.push(t("analysis.comparison.medianDelay", { a: formatDays(a), b: formatDays(b) }));
      }
    }
    sections.push({ title: t("analysis.sectionTitles.comparison", { name: compareEventName }), bullets: compare });
  }

  return sections;
}
