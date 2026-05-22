/**
 * Genere une analyse textuelle automatique a partir des stats.
 * Retourne un tableau de sections { title, bullets[] }.
 *
 * Note métier : le check-in est l'indicateur de présence à privilégier.
 * Le compte de badges délivrés est moins fiable (erreur humaine à l'accueil :
 * badge réimprimé non flaggé, lot pré-imprimé distribué manuellement, etc.)
 *
 * @param stats - stats principales de l'event
 * @param registeredCount - nombre de delegates registered
 * @param eventName - nom de l'event
 * @param options.compareStats - stats de l'event comparé (optionnel)
 * @param options.compareEventName - nom de l'event comparé (optionnel)
 */
function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatDays(d) {
  if (d == null) return "—";
  if (d < 1) return `${(d * 24).toFixed(1)} h`;
  if (d < 30) return `${d.toFixed(1)} j`;
  return `${Math.round(d)} j`;
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
  const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
  const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

  // --- Chiffres cles ---
  const keyFacts = [];
  keyFacts.push(`${fmt(g.totalDelegatesCount)} inscrits au total, dont ${fmt(registeredCount)} au statut registered.`);
  if (g.checkedInCount > 0) {
    keyFacts.push(`Taux de presence : ${pct(g.checkedInCount, registeredCount)} des registered (${fmt(g.checkedInCount)} delegues physiquement presents).`);
    const noShow = registeredCount - g.checkedInCount;
    if (noShow > 0 && registeredCount > 0) {
      keyFacts.push(`No-show : ${pct(noShow, registeredCount)} (${fmt(noShow)} delegues registered absents).`);
    }
  }
  if (g.onboardingCount > 0) {
    keyFacts.push(`Connexion onboarding : ${pct(g.onboardingCount, registeredCount)} des registered (${fmt(g.onboardingCount)}).`);
  }
  if (g.mobileAppCount > 0) {
    keyFacts.push(`App mobile (< 3 mois) : ${pct(g.mobileAppCount, registeredCount)} des registered (${fmt(g.mobileAppCount)}).`);
  }
  if (g.pendingCount > 0) {
    keyFacts.push(`${fmt(g.pendingCount)} inscriptions en attente (${pct(g.pendingCount, g.totalDelegatesCount)}).`);
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
      keyFacts.push(`Delai median inscription -> check-in : ${formatDays(m)} (${fmt(deltas.length)} delegues echantillon).`);
    }
  }
  sections.push({ title: "Chiffres cles", bullets: keyFacts });

  // --- Mix des presents (registered ET checkedIn) ---
  if (delegates && Array.isArray(delegates)) {
    const mixCounts = new Map();
    let mixTotal = 0;
    for (const d of delegates) {
      if (d.status?.toLowerCase() !== "registered") continue;
      if (!d.checkedInDate) continue;
      for (const r of d.registrations || []) {
        const t = r.type || "Non renseigne";
        mixCounts.set(t, (mixCounts.get(t) || 0) + 1);
        mixTotal++;
      }
    }
    if (mixTotal > 0) {
      const mix = [];
      const sortedTypes = [...mixCounts.entries()].sort((a, b) => b[1] - a[1]);
      mix.push(`Mix des presents : population de ${fmt(mixTotal)} inscriptions (status = registered ET checkedInDate renseignee).`);
      const top = sortedTypes.slice(0, 3).map(([t, n]) => `${t} (${pct(n, mixTotal)})`).join(", ");
      mix.push(`Top types : ${top}.`);
      sections.push({ title: "Profil des presents", bullets: mix });
    }
  }

  // --- Demographie ---
  const demo = [];
  const countries = stats.demographics?.countries || [];
  const uniqueCountries = countries.filter((c) => c.value !== "Non renseigne").length;
  demo.push(`${uniqueCountries} pays representes.`);
  if (countries.length > 0) {
    const top3 = countries.slice(0, 3).map((c) => `${c.value} (${fmt(c.totalCount)})`).join(", ");
    demo.push(`Top pays : ${top3}.`);
  }
  const companies = stats.demographics?.companies || [];
  if (companies.length > 0) {
    demo.push(`${companies.length} entreprises/institutions representees.`);
  }
  const genders = stats.demographics?.genders || [];
  const nonRenseigneGender = genders.find((gg) => gg.value === "Non renseigne");
  if (nonRenseigneGender && g.totalDelegatesCount > 0) {
    const pctNR = ((nonRenseigneGender.totalCount / g.totalDelegatesCount) * 100).toFixed(0);
    if (pctNR > 30) {
      demo.push(`Attention : ${pctNR}% des inscrits n'ont pas renseigne leur genre.`);
    }
  }
  sections.push({ title: "Demographie", bullets: demo });

  // --- Inscriptions ---
  const reg = [];
  const types = stats.registrations?.types || [];
  if (types.length > 0) {
    reg.push(`${types.length} types d'inscription.`);
    const topType = types[0];
    reg.push(`Type dominant : "${topType.value}" avec ${fmt(topType.totalCount)} inscrits (${pct(topType.totalCount, g.totalDelegatesCount)}).`);
  }
  const multiRegs = stats.registrations?.multiRegistrations || [];
  if (multiRegs.length > 0) {
    reg.push(`${fmt(multiRegs.length)} delegues avec des inscriptions multiples.`);
  }
  const cancelled = stats.registrations?.statuses?.find((s) => s.value?.toLowerCase().includes("cancel"));
  if (cancelled && cancelled.totalCount > 0) {
    reg.push(`Taux d'annulation : ${pct(cancelled.totalCount, g.totalDelegatesCount)} (${fmt(cancelled.totalCount)}).`);
  }
  sections.push({ title: "Inscriptions", bullets: reg });

  // --- Dynamique ---
  const temporal = [];
  const insights = stats.temporal?.insights;
  if (insights) {
    if (insights.peakDay?.date !== "-") {
      temporal.push(`Pic d'inscriptions : ${insights.peakDay.date} avec ${fmt(insights.peakDay.count)} inscriptions.`);
    }
    if (insights.avgPerDay > 0) {
      temporal.push(`Moyenne : ${insights.avgPerDay.toFixed(1)} inscriptions par jour.`);
    }
    if (insights.firstDate !== "-") {
      temporal.push(`Premiere inscription le ${insights.firstDate}.`);
    }
  }
  sections.push({ title: "Dynamique temporelle", bullets: temporal });

  // --- Check-in & Badges (check-in en premier, badge en complément) ---
  const checkinBadges = [];
  if (g.checkedInCount > 0) {
    checkinBadges.push(
      `Check-in (présence physique réelle) : ${fmt(g.checkedInCount)} delegues, ${pct(g.checkedInCount, registeredCount)} des registered.`
    );
  }
  const checkinPeak = stats.checkinFlow?.peakSlot;
  if (checkinPeak?.count > 0) {
    checkinBadges.push(
      `Pic de check-in : ${checkinPeak.count} arrivées en 15 min (${checkinPeak.date} à ${checkinPeak.time}), soit ~${checkinPeak.count * 4}/h — dimensionner l'accueil sur cette base.`
    );
  }
  if (g.totalBadgesDelivered > 0) {
    const delta = g.checkedInCount - g.totalBadgesDelivered;
    checkinBadges.push(
      `Badges délivrés (compteur indicatif, partiellement déclaré à l'accueil) : ${fmt(g.totalBadgesDelivered)}, ${pct(g.totalBadgesDelivered, registeredCount)} des registered.`
    );
    if (delta > 0) {
      checkinBadges.push(
        `Note : ${fmt(delta)} check-in de plus que de badges déclarés délivrés — saisie "deliveredAt" partielle à l'accueil, le compte check-in reflète mieux la présence réelle.`
      );
    }
  }
  const badgePeak = stats.badges?.peakSlot;
  if (badgePeak?.count > 0) {
    checkinBadges.push(`Pic de distribution badges : ${badgePeak.count} en 15 min (${badgePeak.date} à ${badgePeak.time}).`);
  }
  const devices = stats.badges?.byDevice || [];
  if (devices.length > 0) {
    checkinBadges.push(`${devices.length} device(s) utilisé(s) pour l'impression badges.`);
  }
  if (checkinBadges.length > 0) {
    sections.push({ title: "Check-in & Badges", bullets: checkinBadges });
  }

  // --- Recommandations ---
  const reco = [];
  if (registeredCount > 0 && g.onboardingCount / registeredCount < 0.6) {
    reco.push(`Onboarding faible (${pct(g.onboardingCount, registeredCount)}) — envisager une relance par email.`);
  }
  if (g.pendingCount > 0 && g.pendingCount / g.totalDelegatesCount > 0.1) {
    reco.push(`${pct(g.pendingCount, g.totalDelegatesCount)} d'inscriptions en attente — verifier les blocages (paiement, validation manuelle).`);
  }
  if (registeredCount > 0 && g.mobileAppCount / registeredCount < 0.2 && g.mobileAppCount >= 0) {
    reco.push(`Adoption app mobile faible (${pct(g.mobileAppCount, registeredCount)}) — promouvoir l'application dans les communications.`);
  }
  if (registeredCount > 0 && g.checkedInCount > 0) {
    const remaining = registeredCount - g.checkedInCount;
    if (remaining > 0) {
      reco.push(`${fmt(remaining)} inscrits registered n'ont pas encore fait leur check-in.`);
    }
  }
  const nonRenseigneCountry = countries.find((c) => c.value === "Non renseigne");
  if (nonRenseigneCountry && nonRenseigneCountry.totalCount / g.totalDelegatesCount > 0.2) {
    reco.push(`${pct(nonRenseigneCountry.totalCount, g.totalDelegatesCount)} des inscrits n'ont pas de pays renseigne — ameliorer la collecte.`);
  }
  if (reco.length > 0) {
    sections.push({ title: "Recommandations", bullets: reco });
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
      `Inscrits : ${fmt(g.totalDelegatesCount)} (${eventName || "actuel"}) vs ${fmt(cmp.totalDelegatesCount)} (${compareEventName}) — ${deltaPct(g.totalDelegatesCount, cmp.totalDelegatesCount)}.`
    );
    if (g.checkedInCount > 0 || cmp.checkedInCount > 0) {
      const aPres = registeredCount > 0 ? (g.checkedInCount / registeredCount) * 100 : 0;
      const bPres = cmpRegisteredOnly > 0 ? (cmp.checkedInCount / cmpRegisteredOnly) * 100 : 0;
      compare.push(
        `Taux de presence : ${aPres.toFixed(1)}% vs ${bPres.toFixed(1)}% — ${deltaPpts(aPres, bPres)}.`
      );
    }
    const curCheckinPeak = stats.checkinFlow?.peakSlot;
    const cmpCheckinPeak = compareStats?.checkinFlow?.peakSlot;
    if (curCheckinPeak?.count > 0 || cmpCheckinPeak?.count > 0) {
      compare.push(
        `Pic check-in 15 min : ${curCheckinPeak?.count || 0} vs ${cmpCheckinPeak?.count || 0} — equivalent horaire ${(curCheckinPeak?.count || 0) * 4}/h vs ${(cmpCheckinPeak?.count || 0) * 4}/h.`
      );
    }
    if (g.onboardingCount > 0 || cmp.onboardingCount > 0) {
      const aOn = g.totalDelegatesCount > 0 ? (g.onboardingCount / g.totalDelegatesCount) * 100 : 0;
      const bOn = cmp.totalDelegatesCount > 0 ? (cmp.onboardingCount / cmp.totalDelegatesCount) * 100 : 0;
      compare.push(`Onboarding : ${aOn.toFixed(1)}% vs ${bOn.toFixed(1)}% — ${deltaPpts(aOn, bOn)}.`);
    }
    if (g.mobileAppCount > 0 || cmp.mobileAppCount > 0) {
      const aApp = g.totalDelegatesCount > 0 ? (g.mobileAppCount / g.totalDelegatesCount) * 100 : 0;
      const bApp = cmp.totalDelegatesCount > 0 ? (cmp.mobileAppCount / cmp.totalDelegatesCount) * 100 : 0;
      compare.push(`App mobile active : ${aApp.toFixed(1)}% vs ${bApp.toFixed(1)}% — ${deltaPpts(aApp, bApp)}.`);
    }
    // Diversite geographique
    const aPays = stats.demographics?.uniqueCountries || 0;
    const bPays = compareStats.demographics?.uniqueCountries || 0;
    if (aPays > 0 || bPays > 0) {
      compare.push(`Diversite geographique : ${aPays} pays vs ${bPays} pays.`);
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
        compare.push(`Delai median inscription -> check-in : ${formatDays(a)} vs ${formatDays(b)}.`);
      }
    }
    sections.push({ title: `Comparatif vs ${compareEventName}`, bullets: compare });
  }

  return sections;
}
