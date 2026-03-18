/**
 * Genere une analyse textuelle automatique a partir des stats.
 * Retourne un tableau de sections { title, bullets[] }.
 */
export function generateAnalysis(stats, registeredCount, eventName) {
  const sections = [];
  const g = stats.global;
  const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
  const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

  // --- Chiffres cles ---
  const keyFacts = [];
  keyFacts.push(`${fmt(g.totalDelegatesCount)} inscrits au total, dont ${fmt(registeredCount)} au statut registered.`);
  if (g.checkedInCount > 0) {
    keyFacts.push(`Taux de check-in : ${pct(g.checkedInCount, g.totalDelegatesCount)} (${fmt(g.checkedInCount)} delegues).`);
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
  sections.push({ title: "Chiffres cles", bullets: keyFacts });

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
  const nonRenseigneGender = genders.find((g) => g.value === "Non renseigne");
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

  // --- Badges & Check-in ---
  const badges = [];
  if (g.totalBadgesDelivered > 0) {
    badges.push(`${fmt(g.totalBadgesDelivered)} badges delivres (${pct(g.totalBadgesDelivered, registeredCount)} des registered).`);
  }
  const peakSlot = stats.badges?.peakSlot;
  if (peakSlot?.count > 0) {
    badges.push(`Pic de distribution : ${peakSlot.count} badges en 15 min (le ${peakSlot.date} a ${peakSlot.time}), soit ~${peakSlot.count * 4}/h.`);
  }
  const devices = stats.badges?.byDevice || [];
  if (devices.length > 0) {
    badges.push(`${devices.length} device(s) utilise(s) pour l'impression.`);
  }
  if (badges.length > 0) {
    sections.push({ title: "Badges & Check-in", bullets: badges });
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

  return sections;
}
