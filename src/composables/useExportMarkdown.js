import { ref } from "vue";
import { generateAnalysis } from "@/utils/generateAnalysis.js";
import { buildCheckinByType } from "@/utils/checkinByType.js";
import { buildDelegateLookup, getRemoteOnlyDelegateIds } from "@/utils/viewerJoin.js";
import { computeParticipation } from "@/utils/participation.js";

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
// Contenu : TOUT ce qui est dans le dashboard — global, demographie, types,
// categories, temporel, check-in, badges, onboarding, mobile, live, replay,
// scans, comparaison si compareWith, analyse textuelle automatique.

// --- Helpers MD -------------------------------------------------------------

function h(level, text) {
  return `${"#".repeat(level)} ${text}\n\n`;
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("fr-FR");
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
    return d.toLocaleString("fr-FR", {
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

// Echappe un contenu de cellule MD : | -> \|, retour ligne -> espace,
// double escape supprime juste pour rester lisible cote LLM.
function mdCell(v) {
  if (v == null) return "—";
  const s = String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  return s.length === 0 ? "—" : s;
}

function mdTable(headers, rows) {
  if (!rows || rows.length === 0) return "_Aucune donnée_\n\n";
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
  let out = h(2, "Métadonnées de l'export");
  out += mdScalars([
    ["Event", eventName || "—"],
    ["Event ID", `\`${eventId}\``],
    ["Délégués chargés", fmtNum(delegatesCount)],
    ["Généré le", fmtDate(new Date())],
    ["Source", "Dashboard CYIM statistics-reg"],
  ]);
  if (compareEventName) {
    out += mdScalar("Event de comparaison", compareEventName);
    out += "\n";
  }
  if (filterState && filterState.length > 0) {
    out += `> **Filtre badge type actif** : ${filterState.join(", ")} — toutes les sections ci-dessous sont filtrées.\n\n`;
  } else {
    out += `> Aucun filtre badge type actif (vue complète des délégués).\n\n`;
  }
  return out;
}

function sectionGlobal(stats, delegates) {
  if (!stats?.global) return "";
  const g = stats.global;
  const registered = (delegates || []).filter((d) => d.status?.toLowerCase() === "registered").length;
  let out = h(2, "Chiffres clés");
  out += mdTable(
    ["Indicateur", "Valeur", "% / Note"],
    [
      ["Total inscrits", fmtNum(g.totalDelegatesCount), "tous statuts confondus"],
      ["Délégués registered", fmtNum(registered), fmtPct(registered, g.totalDelegatesCount) + " du total"],
      ["Délégués pending", fmtNum(g.pendingCount), fmtPct(g.pendingCount, g.totalDelegatesCount)],
      ["Check-in effectués", fmtNum(g.checkedInCount), fmtPct(g.checkedInCount, registered) + " des registered"],
      ["Pas de check-in", fmtNum(g.notCheckedInCount), fmtPct(g.notCheckedInCount, g.totalDelegatesCount)],
      ["Badges délivrés", fmtNum(g.totalBadgesDelivered), fmtPct(g.totalBadgesDelivered, registered) + " des registered"],
      ["Onboarding (1ère connexion)", fmtNum(g.onboardingCount), fmtPct(g.onboardingCount, registered) + " des registered"],
      ["GDPR signé", fmtNum(g.gdprSignedCount), fmtPct(g.gdprSignedCount, g.totalDelegatesCount)],
      ["Compte (contactId)", fmtNum(g.accountsCount), fmtPct(g.accountsCount, g.totalDelegatesCount)],
      ["Mobile app actif (< 3 mois)", fmtNum(g.mobileAppCount), fmtPct(g.mobileAppCount, g.totalDelegatesCount)],
    ],
  );
  return out;
}

// "Total participants" = photo unique et dedoublonnee de qui a reellement
// participe au congres (presence physique + distanciels live/replay). KPI le
// plus important du bilan selon le DG : il faut absolument qu'il sorte dans le
// MD pour qu'un LLM redige un bilan correct. Logique partagee avec OverviewTab
// via utils/participation.js (dedup sur delegate.id Mongo, jointure Keycloak).
function sectionTotalParticipants(delegates, liveItems, replayItems, label = "md-export") {
  const { counts: c } = computeParticipation(delegates, liveItems, replayItems, { datasetLabel: label });
  if (c.total === 0) return ""; // aucune donnee de participation (event sans live/replay/check-in)

  let out = h(2, "Total participants (vue dédoublonnée)");
  out +=
    "_Photo unique de **qui a réellement participé** au congrès, tous canaux confondus. " +
    "Chaque délégué compte **une seule fois** : un présent physique absorbe ses éventuelles vues " +
    "live/replay ; un délégué non présent compte une fois selon qu'il a vu en live, en replay ou les deux. " +
    "Déduplication sur `delegate.id` (Mongo) via la jointure Keycloak. " +
    "C'est l'indicateur d'audience global du congrès._\n\n";
  out += mdTable(
    ["Composante", "Délégués", "% du total participants"],
    [
      ["Présence physique (check-in)", fmtNum(c.checkedIn), fmtPct(c.checkedIn, c.total)],
      ["Live distanciel uniquement", fmtNum(c.liveOnly), fmtPct(c.liveOnly, c.total)],
      ["Live & Replay distanciel", fmtNum(c.both), fmtPct(c.both, c.total)],
      ["Replay distanciel uniquement", fmtNum(c.replayOnly), fmtPct(c.replayOnly, c.total)],
      ["**Total participants (dédoublonnés)**", `**${fmtNum(c.total)}**`, "**100%**"],
    ],
  );
  out +=
    "> Note : les viewers live/replay non rapprochés d'un délégué (user_id Keycloak inconnu côté ES) " +
    "ne sont pas comptés ici — le total participants peut donc être légèrement sous-estimé sur les " +
    "événements à faible couverture Keycloak.\n\n";
  return out;
}

function sectionDemographics(stats) {
  const d = stats?.demographics;
  if (!d) return "";
  let out = h(2, "Démographie");

  out += h(3, "Pays (top 20)");
  const totalCountries = (d.countries || []).reduce((s, c) => s + c.totalCount, 0);
  out += mdTable(
    ["Pays", "Délégués", "%"],
    (d.countries || []).slice(0, 20).map((c) => [c.value, fmtNum(c.totalCount), fmtPct(c.totalCount, totalCountries)]),
  );
  out += `_${d.uniqueCountries || 0} pays uniques, ${(d.countries || []).length} entrées au total._\n\n`;

  out += h(3, "Continents");
  const continents = Object.entries(d.continentCounts || {}).sort((a, b) => b[1] - a[1]);
  const totalContinents = continents.reduce((s, [, v]) => s + v, 0);
  out += mdTable(
    ["Continent", "Délégués", "%"],
    continents.map(([k, v]) => [k, fmtNum(v), fmtPct(v, totalContinents)]),
  );

  out += h(3, "Genre");
  const totalGender = (d.genders || []).reduce((s, g) => s + g.totalCount, 0);
  out += mdTable(
    ["Genre", "Délégués", "%"],
    (d.genders || []).map((g) => [g.value, fmtNum(g.totalCount), fmtPct(g.totalCount, totalGender)]),
  );

  out += h(3, "Professions (top 15)");
  out += mdTable(
    ["Profession", "Délégués"],
    (d.occupations || []).slice(0, 15).map((o) => [o.value, fmtNum(o.totalCount)]),
  );

  out += h(3, "Qualifications (top 15)");
  out += mdTable(
    ["Qualification", "Délégués"],
    (d.qualifications || []).slice(0, 15).map((q) => [q.value, fmtNum(q.totalCount)]),
  );

  out += h(3, "Civilité (top 10)");
  out += mdTable(
    ["Civilité", "Délégués"],
    (d.titles || []).slice(0, 10).map((t) => [t.value, fmtNum(t.totalCount)]),
  );

  out += h(3, "Sociétés (top 20)");
  out += mdTable(
    ["Société", "Délégués"],
    (d.companies || []).slice(0, 20).map((c) => [c.value, fmtNum(c.totalCount)]),
  );

  return out;
}

function sectionRegistrations(stats, delegates, liveItems, replayItems, label = "md-export") {
  const r = stats?.registrations;
  if (!r) return "";
  let out = h(2, "Inscriptions");

  out += h(3, "Statuts");
  const totalStatus = (r.statuses || []).reduce((s, x) => s + x.totalCount, 0);
  out += mdTable(
    ["Statut", "Délégués", "%"],
    (r.statuses || []).map((s) => [s.value, fmtNum(s.totalCount), fmtPct(s.totalCount, totalStatus)]),
  );

  // Statut par type d'inscription : croise chaque type avec la repartition de
  // ses statuts (registered / pending / annule...). r.types[].statuses est
  // agrege cote computeRegistrations. Colonnes = union des statuts rencontres.
  const statusKeys = new Set();
  for (const t of r.types || []) {
    for (const k of Object.keys(t.statuses || {})) statusKeys.add(k);
  }
  if (statusKeys.size > 0) {
    out += h(3, "Statut par type d'inscription");
    const keys = [...statusKeys].sort();
    out += mdTable(
      ["Type", ...keys, "Total"],
      [...(r.types || [])]
        .sort((a, b) => b.totalCount - a.totalCount)
        .map((t) => [t.value, ...keys.map((k) => fmtNum(t.statuses?.[k] || 0)), fmtNum(t.totalCount)]),
    );
  }

  // Decomposition participation par type : physique / live-replay seul / aucune participation
  // (uniquement pour les delegues registered — coherent avec OverviewTab)
  out += h(3, "Types d'inscription — décomposition de participation");
  out += "_Calculé sur les délégués `status = registered` uniquement._\n\n";
  const typesBreakdown = buildParticipationBreakdown(delegates, liveItems, replayItems, (d) => {
    const set = new Set();
    for (const reg of d.registrations || []) if (reg.type) set.add(reg.type);
    return set;
  }, label);
  out += mdTable(
    ["Type", "Total", "Physique", "Live/Replay seul", "Aucune participation", "% présence"],
    typesBreakdown.map((b) => [
      b.value, fmtNum(b.total), fmtNum(b.physical), fmtNum(b.remote), fmtNum(b.none),
      fmtPct(b.physical, b.total),
    ]),
  );

  out += h(3, "Catégories — décomposition de participation (top 15)");
  const catsBreakdown = buildParticipationBreakdown(delegates, liveItems, replayItems, (d) => {
    const set = new Set();
    for (const reg of d.registrations || []) {
      for (const c of reg.categories || []) if (c) set.add(c);
    }
    return set;
  }, label);
  out += mdTable(
    ["Catégorie", "Total", "Physique", "Live/Replay seul", "Aucune participation", "% présence"],
    catsBreakdown.slice(0, 15).map((b) => [
      b.value, fmtNum(b.total), fmtNum(b.physical), fmtNum(b.remote), fmtNum(b.none),
      fmtPct(b.physical, b.total),
    ]),
  );

  out += h(3, "Jours d'accès");
  out += mdTable(
    ["Jour", "Inscriptions"],
    (r.accessDays || []).map((d) => [d.value, fmtNum(d.totalCount)]),
  );

  if ((r.multiRegistrations || []).length > 0) {
    out += h(3, "Multi-inscriptions (top 10)");
    out += "_Délégués avec plusieurs registrations (anomalies à investiguer ou cas légitimes : speaker + visiteur, etc.)._\n\n";
    out += mdTable(
      ["Délégué", "Email", "Nb types", "Types"],
      r.multiRegistrations.slice(0, 10).map((m) => [m.name, m.email, m.count, m.types.join(", ")]),
    );
  }

  return out;
}

// Helper : decompose les delegues registered en physique/distanciel-seul/none,
// agrege par cle (type ou categorie). La derivation physique/distanciel vient
// de computeParticipation (source unique partagee avec OverviewTab et la
// section "Total participants"), pour ne pas redupliquer la logique de jointure.
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
  const t = stats?.temporal;
  if (!t) return "";
  let out = h(2, "Temporel — courbe d'inscription");

  out += h(3, "Insights");
  out += mdScalars([
    ["Première inscription", t.insights?.firstDate || "—"],
    ["Pic d'inscription", `${t.insights?.peakDay?.date || "—"} (${fmtNum(t.insights?.peakDay?.count || 0)})`],
    ["Moyenne par jour (30 derniers j.)", (t.insights?.avgPerDay || 0).toFixed(1)],
    ["Inscriptions 14 derniers jours", `${fmtNum(t.insights?.lateCount || 0)} (${t.insights?.latePercent || 0}%)`],
  ]);

  out += h(3, "Top 15 jours d'inscription");
  const top = [...(t.dailyRegistrations || [])].sort((a, b) => b.count - a.count).slice(0, 15);
  out += mdTable(
    ["Jour", "Inscriptions"],
    top.map((d) => [d.date, fmtNum(d.count)]),
  );

  out += h(3, "Répartition par jour de semaine");
  const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const dow = t.dayOfWeekDistribution || {};
  const totalDow = Object.values(dow).reduce((s, v) => s + v, 0);
  out += mdTable(
    ["Jour", "Inscriptions", "%"],
    days.map((label, i) => [label, fmtNum(dow[i + 1] || 0), fmtPct(dow[i + 1] || 0, totalDow)]),
  );

  if ((t.weeklyByType || []).length > 0) {
    out += h(3, "Évolution hebdomadaire par type (top 10 semaines récentes)");
    const lastWeeks = (t.weeklyByType || []).slice(-10);
    const allTypes = new Set();
    for (const w of lastWeeks) Object.keys(w.types || {}).forEach((t2) => allTypes.add(t2));
    const typeList = [...allTypes];
    out += mdTable(
      ["Semaine", ...typeList],
      lastWeeks.map((w) => [w.week, ...typeList.map((t2) => fmtNum(w.types?.[t2] || 0))]),
    );
  }

  if ((t.weeklyStatuses || []).length > 0) {
    out += h(3, "Évolution hebdomadaire par statut (top 10 semaines récentes)");
    const lastWeeks = (t.weeklyStatuses || []).slice(-10);
    const allStatuses = new Set();
    for (const w of lastWeeks) Object.keys(w.statuses || {}).forEach((s) => allStatuses.add(s));
    const statusList = [...allStatuses];
    out += mdTable(
      ["Semaine", ...statusList],
      lastWeeks.map((w) => [w.week, ...statusList.map((s) => fmtNum(w.statuses?.[s] || 0))]),
    );
  }

  return out;
}

function sectionCheckinFlow(stats) {
  const c = stats?.checkinFlow;
  if (!c) return "";
  let out = h(2, "Flux de check-in physique");

  out += h(3, "Pic 15 min");
  out += mdScalars([
    ["Créneau pic", `${c.peakSlot?.date || "—"} à ${c.peakSlot?.time || "—"}`],
    ["Check-in dans ce créneau", fmtNum(c.peakSlot?.count || 0)],
    ["Équivalent / heure (× 4)", fmtNum((c.peakSlot?.count || 0) * 4)],
  ]);

  out += h(3, "Check-in par jour");
  out += mdTable(
    ["Date", "Check-in"],
    (c.byDayArray || []).map((d) => [d.date, fmtNum(d.count)]),
  );

  out += h(3, "Top 15 créneaux 15 min");
  const top = [...(c.per15min || [])].sort((a, b) => b.count - a.count).slice(0, 15);
  out += mdTable(
    ["Date", "Créneau", "Check-in"],
    top.map((s) => [s.date, s.time, fmtNum(s.count)]),
  );

  return out;
}

function sectionBadges(stats, delegates) {
  const b = stats?.badges;
  if (!b) return "";
  let out = h(2, "Badges délivrés & check-in par type");

  out += h(3, "Globalement");
  out += mdScalars([
    ["Total délivrés", fmtNum(b.totalDelivered || 0)],
    ["Pic 15 min", `${fmtNum(b.peakSlot?.count || 0)} le ${b.peakSlot?.date || "—"} à ${b.peakSlot?.time || "—"}`],
    ["Pic 1 min (perf max)", `${fmtNum(b.peakMinute?.count || 0)} le ${b.peakMinute?.date || "—"} à ${b.peakMinute?.time || "—"}`],
  ]);

  // Check-in par type de badge (= "Progression du check-in par type" du
  // dashboard). buildCheckinByType agrege par type attendu (1er badge sinon
  // 1ere registration), top 10 + Autres, sur les delegues registered.
  const cbt = buildCheckinByType(delegates || []);
  if (cbt.labels.length > 0) {
    const checkinData = cbt.chartData.datasets[0]?.data || [];
    const remainingData = cbt.chartData.datasets[1]?.data || [];
    out += h(3, "Check-in par type de badge");
    out += "_Délégués `registered`. Type attendu = 1er badge en base, sinon 1ère registration (top 10 + Autres)._\n\n";
    out += mdTable(
      ["Type", "Check-in", "Restants", "Attendus", "% présence"],
      cbt.labels.map((label, i) => {
        const ci = checkinData[i] || 0;
        const rem = remainingData[i] || 0;
        const total = ci + rem;
        return [label, fmtNum(ci), fmtNum(rem), fmtNum(total), fmtPct(ci, total)];
      }),
    );
  }

  // Mix des types d'inscription chez les presents confirmes (= chart
  // "Mix des types (presents confirmes)" du dashboard). Population :
  // status=registered ET checkedInDate renseignee. Une inscription = une ligne
  // (un delegue multi-inscriptions compte dans chacun de ses types).
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
    out += h(3, "Mix des types d'inscription (présents confirmés)");
    out += "_Population : `status = registered` ET `checkedInDate` renseignée._\n\n";
    out += mdTable(
      ["Type", "Inscriptions présentes", "% du mix"],
      [...mixCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => [
        type, fmtNum(count), fmtPct(count, mixTotal),
      ]),
    );
  }

  out += h(3, "Badges délivrés par device de délivrance");
  out += mdTable(
    ["Device / Borne", "Badges délivrés"],
    (b.byDevice || []).map((d) => [d.device, fmtNum(d.count)]),
  );

  out += h(3, "Badges par jour");
  out += mdTable(
    ["Date", "Badges"],
    (b.byDay || []).map((d) => [d.date, fmtNum(d.count)]),
  );

  out += h(3, "Top 15 créneaux 15 min");
  const top = [...(b.per15min || [])].sort((a, b) => b.count - a.count).slice(0, 15);
  out += mdTable(
    ["Date", "Créneau", "Badges"],
    top.map((s) => [s.date, s.time, fmtNum(s.count)]),
  );

  return out;
}

function sectionOnboarding(stats) {
  const o = stats?.onboarding;
  if (!o) return "";
  let out = h(2, "Onboarding (1ère connexion)");
  if (!o.daily || o.daily.length === 0) {
    out += "_Aucun délégué n'a encore effectué de première connexion._\n\n";
    return out;
  }
  out += h(3, "Évolution journalière (top 20)");
  const top = [...o.daily].sort((a, b) => b.count - a.count).slice(0, 20);
  out += mdTable(
    ["Date", "1ères connexions"],
    top.map((d) => [d.date, fmtNum(d.count)]),
  );
  out += mdScalars([
    ["Première 1ère connexion", o.daily[0]?.date || "—"],
    ["Dernière", o.daily[o.daily.length - 1]?.date || "—"],
  ]);
  return out;
}

function sectionMobileApp(stats) {
  const m = stats?.mobileApp;
  if (!m || (m.count || 0) === 0) return "";
  let out = h(2, "Application mobile");
  out += mdScalars([
    ["Délégués actifs (< 3 mois)", fmtNum(m.count)],
  ]);
  if ((m.daily || []).length > 0) {
    out += h(3, "Adoption par jour (top 15)");
    const top = [...m.daily].sort((a, b) => b.count - a.count).slice(0, 15);
    out += mdTable(
      ["Date", "Utilisateurs"],
      top.map((d) => [d.date, fmtNum(d.count)]),
    );
  }
  return out;
}

function sectionLiveReplay(label, viewerStats, delegates) {
  if (!viewerStats || !viewerStats.global) return "";
  const g = viewerStats.global;
  if ((g.totalViews || 0) === 0 && (g.uniqueUsers || 0) === 0) return "";

  // KPI "sans presence physique" : delegues matched ES live/replay
  // sans check-in physique.
  const lookup = buildDelegateLookup(delegates || [], { datasetLabel: `md-export-${label.toLowerCase()}` });
  const remoteSize = getRemoteOnlyDelegateIds(viewerStats.items || [], lookup, { datasetLabel: `md-export-${label.toLowerCase()}-remote` }).size;

  let out = h(2, label);

  out += h(3, "Globalement");
  out += mdScalars([
    ["Délégués uniques", fmtNum(g.uniqueUsers || 0)],
    [`${label} sans présence physique`, fmtNum(remoteSize)],
    ["Vues totales", fmtNum(g.totalViews || 0)],
    ["Sessions distinctes consultées", fmtNum(g.distinctSessions || 0)],
    ["Durée moyenne / vue", fmtDuration(g.avgViewDurationSec || 0)],
    ["Durée cumulée totale", fmtDuration(g.totalDurationSec || 0)],
  ]);

  if ((viewerStats.origins || []).length > 0) {
    out += h(3, "Vues par origine");
    const totalOrig = viewerStats.origins.reduce((s, o) => s + o.views, 0);
    out += mdTable(
      ["Origine", "Vues", "Délégués uniques", "%"],
      viewerStats.origins.map((o) => [o.origin, fmtNum(o.views), fmtNum(o.uniqueUsers), fmtPct(o.views, totalOrig)]),
    );
  }

  if ((viewerStats.topSessions || []).length > 0) {
    out += h(3, "Top 20 sessions par délégués uniques");
    out += mdTable(
      ["Session ID", "Titre", "Délégués uniques", "Vues", "Durée moyenne"],
      viewerStats.topSessions.slice(0, 20).map((s) => [
        s.sessionId || s.id || "—", s.title || "—",
        fmtNum(s.uniqueUsers || 0), fmtNum(s.views || 0), fmtDuration(s.avgDuration || 0),
      ]),
    );
  }

  if (viewerStats.sessionsPerUserBuckets) {
    out += h(3, "Engagement — sessions consultées par délégué");
    const b = viewerStats.sessionsPerUserBuckets;
    const total = (b["1"] || 0) + (b["2-5"] || 0) + (b["6-10"] || 0) + (b["10+"] || 0);
    out += mdTable(
      ["Tranche", "Délégués", "%"],
      [
        ["1 session", fmtNum(b["1"] || 0), fmtPct(b["1"] || 0, total)],
        ["2-5 sessions", fmtNum(b["2-5"] || 0), fmtPct(b["2-5"] || 0, total)],
        ["6-10 sessions", fmtNum(b["6-10"] || 0), fmtPct(b["6-10"] || 0, total)],
        ["10+ sessions", fmtNum(b["10+"] || 0), fmtPct(b["10+"] || 0, total)],
      ],
    );
  }

  if ((viewerStats.uniqueByDay || []).length > 0) {
    out += h(3, "Délégués uniques par jour");
    out += mdTable(
      ["Jour", "Délégués uniques"],
      viewerStats.uniqueByDay.map((d) => [d.day, fmtNum(d.count)]),
    );
  }

  // Live-only : sessionTypes + uniqueBy30min
  if ((viewerStats.sessionTypes || []).length > 0) {
    out += h(3, "Vues par type de session");
    const totalType = viewerStats.sessionTypes.reduce((s, t) => s + t.views, 0);
    out += mdTable(
      ["Type", "Vues", "Délégués uniques", "%"],
      viewerStats.sessionTypes.map((t) => [t.type, fmtNum(t.views), fmtNum(t.uniqueUsers), fmtPct(t.views, totalType)]),
    );
  }

  if ((viewerStats.uniqueBy30min || []).length > 0) {
    out += h(3, "Top 20 créneaux 30 min");
    const top = [...viewerStats.uniqueBy30min].sort((a, b) => b.count - a.count).slice(0, 20);
    out += mdTable(
      ["Créneau", "Délégués uniques"],
      top.map((s) => [s.slot, fmtNum(s.count)]),
    );
  }

  return out;
}

function sectionScans(scanStats) {
  if (!scanStats || !scanStats.global) return "";
  const g = scanStats.global;
  // Si tous a zero, on n'affiche pas la section (event sans pipeline scans).
  if (
    (g.totalAudienceScans || 0) === 0 &&
    (g.totalCheckinScans || 0) === 0 &&
    (g.totalZoneScans || 0) === 0
  ) return "";

  let out = h(2, "Scans QR (salles + entrée + zones)");
  out += h(3, "Volumétrie globale");
  out += mdTable(
    ["Source", "Scans totaux", "Délégués uniques"],
    [
      ["Audience (entrée de salle)", fmtNum(g.totalAudienceScans || 0), fmtNum(g.uniqueAudienceDelegates || 0)],
      ["Check-in congrès", fmtNum(g.totalCheckinScans || 0), fmtNum(g.uniqueCheckinDelegates || 0)],
      ["Zones (stands, lounges)", fmtNum(g.totalZoneScans || 0), fmtNum(g.uniqueZoneDelegates || 0)],
      ["Total cumulé", fmtNum(g.totalScans || 0), fmtNum(g.uniqueDelegatesAll || 0)],
    ],
  );
  out += mdScalars([
    ["Sessions distinctes scannées", fmtNum(g.distinctSessions || 0)],
    ["Salles distinctes", fmtNum(g.distinctRooms || 0)],
    ["Zones distinctes", fmtNum(g.distinctZones || 0)],
  ]);

  // NB : topSessions/topRooms/topZones ne portent que { label, count }
  // (cf. computeScanStats.topN) — pas de delegues uniques par ligne, donc pas
  // de colonne "Délégués uniques" ici (elle vaudrait 0 partout).
  if ((scanStats.audience?.topSessions || []).length > 0) {
    out += h(3, "Top 15 sessions par audience scannée");
    out += mdTable(
      ["Session / Salle", "Scans"],
      scanStats.audience.topSessions.slice(0, 15).map((s) => [s.label || s.name || "—", fmtNum(s.count || 0)]),
    );
  }

  if ((scanStats.audience?.topRooms || []).length > 0) {
    out += h(3, "Top 15 salles par audience scannée");
    out += mdTable(
      ["Salle", "Scans"],
      scanStats.audience.topRooms.slice(0, 15).map((r) => [r.label || r.name || "—", fmtNum(r.count || 0)]),
    );
  }

  if ((scanStats.zone?.topZones || []).length > 0) {
    out += h(3, "Top 15 zones par accès");
    out += mdTable(
      ["Zone", "Scans"],
      scanStats.zone.topZones.slice(0, 15).map((z) => [z.label || z.name || "—", fmtNum(z.count || 0)]),
    );
  }

  // Delegues uniques scannes par jour (tous index confondus, dedoublonne sur
  // delegate.id Mongo, placeholder "-" exclu). combined.uniqueDelegatesByDay
  // est un objet { "YYYY-MM-DD": count }.
  const byDay = Object.entries(scanStats.combined?.uniqueDelegatesByDay || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (byDay.length > 0) {
    out += h(3, "Délégués uniques scannés par jour");
    out += mdTable(["Jour", "Délégués uniques"], byDay.map(([day, count]) => [day, fmtNum(count)]));
  }

  // Sens des scans (entree / sortie / inconnu) par index. byDirection =
  // { in, out, unknown }. Heuristique cote computeScanStats.normalizeDirection.
  const dirRows = [
    ["Audience (salle)", scanStats.audience?.byDirection],
    ["Check-in congrès", scanStats.checkin?.byDirection],
    ["Zones", scanStats.zone?.byDirection],
  ].filter(([, d]) => d && (d.in || d.out || d.unknown));
  if (dirRows.length > 0) {
    out += h(3, "Sens des scans (entrée / sortie)");
    out += "_Direction déduite par heuristique (`in*`/`entr*` → entrée, `out*`/`sort*` → sortie)._\n\n";
    out += mdTable(
      ["Source", "Entrée", "Sortie", "Inconnu"],
      dirRows.map(([label, d]) => [label, fmtNum(d.in || 0), fmtNum(d.out || 0), fmtNum(d.unknown || 0)]),
    );
  }

  // Scans par type de badge (audience + check-in). byBadgeType = { type: count }.
  for (const [title, map] of [
    ["Audience — scans par type de badge", scanStats.audience?.byBadgeType],
    ["Check-in congrès — scans par type de badge", scanStats.checkin?.byBadgeType],
  ]) {
    const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) continue;
    const totalBt = entries.reduce((s, [, v]) => s + v, 0);
    out += h(3, title);
    out += mdTable(
      ["Type de badge", "Scans", "%"],
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

  let out = h(2, `Comparaison — ${eventName} vs ${compareEventName}`);
  out += mdTable(
    ["Indicateur", eventName || "Event A", compareEventName || "Event B", "Δ"],
    [
      ["Total inscrits", fmtNum(a.totalDelegatesCount), fmtNum(b.totalDelegatesCount), delta(a.totalDelegatesCount, b.totalDelegatesCount)],
      ["Check-in", fmtNum(a.checkedInCount), fmtNum(b.checkedInCount), delta(a.checkedInCount, b.checkedInCount)],
      ["Badges délivrés", fmtNum(a.totalBadgesDelivered), fmtNum(b.totalBadgesDelivered), delta(a.totalBadgesDelivered, b.totalBadgesDelivered)],
      ["Onboarding", fmtNum(a.onboardingCount), fmtNum(b.onboardingCount), delta(a.onboardingCount, b.onboardingCount)],
      ["Mobile app actif", fmtNum(a.mobileAppCount), fmtNum(b.mobileAppCount), delta(a.mobileAppCount, b.mobileAppCount)],
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
  let out = h(2, "Analyse textuelle automatique");
  out += "_Bullet points générés automatiquement à partir des chiffres ci-dessus. Source de vérité = les tableaux, ce texte n'est qu'une synthèse._\n\n";
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
  let out = h(2, "Limites et notes pour le LLM");
  out += "- **Source des données** : Apollo Gateway (registration delegates + sessions) + Elasticsearch (scans, live, replay).\n";
  out += "- **Heure** : tous les horodatages sont convertis en heure de Paris (CET/CEST gérés). Sauf mention contraire, les dates ISO sont en UTC.\n";
  out += "- **Check-in physique** : un délégué est considéré comme physiquement présent si son champ `checkedInDate` est une date valide. Le compte de badges délivrés est moins fiable (erreurs humaines à l'accueil).\n";
  out += "- **Live/Replay sans présence physique** : compte uniquement les délégués matchés via Keycloak. Les viewers ES non rapprochés (user_id Keycloak inconnu) ne sont pas comptés (cf. ratio dans la section live/replay).\n";
  out += "- **Catégories de registration** : un délégué avec plusieurs registrations apparaît dans toutes les catégories/types correspondants.\n";
  if (compareEventName) {
    out += `- **Comparaison** : ${eventName} vs ${compareEventName} — les chiffres du compare event sont chargés one-shot (pas d'auto-refresh sur le compare).\n`;
  }
  out += "\n";
  out += "### Suggestions de prompts à donner au LLM\n\n";
  out += "- _Résume ce bilan en 5 points pour un email au président de l'association._\n";
  out += "- _Rédige un communiqué de presse de 200 mots avec les chiffres clés._\n";
  out += "- _Identifie 3 anomalies ou points qui méritent d'être investigués._\n";
  if (compareEventName) {
    out += `- _Compare les deux événements et explique ce qui s'est amélioré ou dégradé._\n`;
  }
  out += "- _Génère un plan de 10 slides PowerPoint à partir de ces données._\n";
  out += "- _Traduis le résumé en anglais pour un client international._\n";
  return out;
}

// Rend le corps complet d'UN event (toutes les sections per-event, dans le
// meme ordre que l'event principal). Utilise pour l'event principal ET pour
// l'annexe de comparaison (event B), afin que le LLM dispose d'une structure
// identique de chaque cote. `participationLabel` distingue les diagnostics de
// jointure Keycloak A vs B. `scanStats` peut etre null (l'event compare ne
// charge pas les scans).
function renderEventBody({ stats, delegates = [], liveStats = null, replayStats = null, scanStats = null, participationLabel = "md-export" }) {
  const liveItems = liveStats?.items || [];
  const replayItems = replayStats?.items || [];
  let out = "";
  out += sectionGlobal(stats, delegates);
  out += sectionTotalParticipants(delegates, liveItems, replayItems, participationLabel);
  out += sectionDemographics(stats);
  out += sectionRegistrations(stats, delegates, liveItems, replayItems, participationLabel);
  out += sectionTemporal(stats);
  out += sectionCheckinFlow(stats);
  out += sectionBadges(stats, delegates);
  out += sectionOnboarding(stats);
  out += sectionMobileApp(stats);
  out += sectionLiveReplay("Live (sessions diffusées en direct)", liveStats, delegates);
  out += sectionLiveReplay("Replay (VOD)", replayStats, delegates);
  out += sectionScans(scanStats);
  return out;
}

// --- Composable principal ---------------------------------------------------

export function useExportMarkdown() {
  const exportingMd = ref(false);

  function safeFileName(name) {
    return (name || "event").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
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
      badgeFilterTypes = [],
    } = opts;

    const registered = delegates.filter((d) => d.status?.toLowerCase() === "registered").length;

    let md = "";
    md += `# Bilan — ${eventName || eventId || "Event"}\n\n`;
    md += `> Export Markdown du dashboard CYIM statistics-reg, conçu pour être donné en entrée à un LLM (Claude, ChatGPT, Gemini) pour génération automatique de bilans, comparaisons, emails, présentations.\n\n`;

    md += sectionMetadata({
      eventId,
      eventName,
      delegatesCount: delegates.length,
      filterState: badgeFilterTypes,
      compareEventName,
    });

    // Corps complet de l'event principal (toutes les sections per-event).
    md += renderEventBody({ stats, delegates, liveStats, replayStats, scanStats, participationLabel: "md-export" });

    // Comparaison : tableau Δ executif (vue rapide), puis annexe complete de
    // l'event B en fin de document pour que le LLM ait toute la donnee des deux.
    md += sectionComparison({ stats, compareStats, eventName, compareEventName });
    md += sectionAnalysis({
      stats, registeredCount: registered, eventName,
      compareStats, compareEventName, delegates, compareDelegates,
    });
    md += sectionFooter({ eventName, compareEventName });

    if (compareStats && compareEventName) {
      md += "---\n\n";
      md += `# Annexe — Données complètes de l'event comparé : ${compareEventName}\n\n`;
      md += `> Toutes les sections ci-dessous concernent **${compareEventName}** (l'event de comparaison), avec la même structure que l'event principal pour faciliter la mise en regard. _Les scans QR ne sont pas chargés pour l'event comparé._\n\n`;
      md += renderEventBody({
        stats: compareStats,
        delegates: compareDelegates || [],
        liveStats: compareLiveStats,
        replayStats: compareReplayStats,
        scanStats: null,
        participationLabel: "md-export-compare",
      });
    }

    return md;
  }

  async function exportToMarkdown(opts) {
    if (exportingMd.value) return;
    exportingMd.value = true;
    try {
      const md = buildMarkdown(opts);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `bilan-${safeFileName(opts.eventName || opts.eventId)}-${dateStr}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("MD export failed:", e);
      throw e;
    } finally {
      exportingMd.value = false;
    }
  }

  return { exportingMd, exportToMarkdown };
}
