// Construit une courbe de decroissance ("burndown") des delegates restants a
// checker-in, par tranches de 15 minutes.
//
// Entree : per15min = [{date: "YYYY-MM-DD", time: "HH:MM", count}] (deja en
// heure de Paris cote computeStats), expected = nombre de delegues attendus
// (registered).
//
// La courbe commence a `expected` AVANT le 1er slot (point synthetique a
// t - 15min), puis decroit de la somme cumulee des check-in. On remplit les
// trous entre le 1er et le dernier slot (15 min de pas) pour avoir un trace
// continu (les segments plats correspondent aux nuits / pauses).

const STEP_MIN = 15;

function slotToMinutes(s) {
  const [Y, M, D] = s.date.split("-").map(Number);
  const [h, m] = s.time.split(":").map(Number);
  return Date.UTC(Y, M - 1, D, h, m) / 60_000;
}

function minutesToParts(min) {
  const d = new Date(min * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: String(d.getUTCMonth() + 1).padStart(2, "0"),
    day: String(d.getUTCDate()).padStart(2, "0"),
    hour: String(d.getUTCHours()).padStart(2, "0"),
    minute: String(d.getUTCMinutes()).padStart(2, "0"),
  };
}

// Burndown absolu : labels = "MM-DD HH:MM" (ou "HH:MM" si single-day).
// stepMin permet de re-agreger en buckets de 30 / 60 min (multiple de 15).
export function buildBurndownAbsolute(per15min, expected, stepMin = STEP_MIN) {
  if (!per15min || per15min.length === 0 || !(expected > 0)) {
    return { labels: [], data: [] };
  }
  const step = stepMin >= STEP_MIN ? Math.floor(stepMin / STEP_MIN) * STEP_MIN : STEP_MIN;
  const sorted = [...per15min].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );

  // Re-agregation des creneaux 15 min dans des buckets `step` alignes sur minuit.
  const counts = new Map();
  for (const s of sorted) {
    const t = slotToMinutes(s);
    const dayStart = slotToMinutes({ date: s.date, time: "00:00" });
    const bucketStart = dayStart + Math.floor((t - dayStart) / step) * step;
    counts.set(bucketStart, (counts.get(bucketStart) || 0) + s.count);
  }

  const firstSlotMin = slotToMinutes(sorted[0]);
  const lastSlotMin = slotToMinutes(sorted[sorted.length - 1]);
  const dayStart0 = slotToMinutes({ date: sorted[0].date, time: "00:00" });
  const start = dayStart0 + Math.floor((firstSlotMin - dayStart0) / step) * step;
  const dayStartEnd = slotToMinutes({ date: sorted[sorted.length - 1].date, time: "00:00" });
  const end = dayStartEnd + Math.floor((lastSlotMin - dayStartEnd) / step) * step;

  const days = new Set(sorted.map((s) => s.date));
  const multiDay = days.size > 1;

  const labels = [];
  const data = [];
  let remaining = expected;

  // Point initial : `step` minutes avant le 1er bucket, remaining = expected.
  const startParts = minutesToParts(start - step);
  labels.push(
    multiDay
      ? `${startParts.month}-${startParts.day} ${startParts.hour}:${startParts.minute}`
      : `${startParts.hour}:${startParts.minute}`
  );
  data.push(remaining);

  for (let t = start; t <= end; t += step) {
    remaining -= counts.get(t) || 0;
    const p = minutesToParts(t);
    labels.push(
      multiDay ? `${p.month}-${p.day} ${p.hour}:${p.minute}` : `${p.hour}:${p.minute}`
    );
    data.push(remaining);
  }
  return { labels, data };
}

// Burndown relatif : retourne [{offset, value}] avec offset = minutes depuis
// le point synthetique de depart (donc 0 = expected, stepMin = expected -
// 1er slot). Utilise pour superposer deux events alignes sur leur propre debut.
//
// La courbe est bornee a la fin du dernier JOUR significatif (>= 5% du pic
// journalier) — meme heuristique que les histogrammes J0/J+N en bas de l'onglet
// Comparatif. Ca evite qu'un check-in retardataire (saisie manuelle 15 jours
// apres) etire l'axe X sur "xxx jours" sans information utile.
//
// stepMin permet de re-agreger les creneaux 15 min en buckets plus larges
// (30, 60, ...). Doit etre un multiple de 15.
export function buildBurndownRelative(per15min, expected, stepMin = STEP_MIN) {
  if (!per15min || per15min.length === 0 || !(expected > 0)) return [];
  const step = stepMin >= STEP_MIN ? Math.floor(stepMin / STEP_MIN) * STEP_MIN : STEP_MIN;
  const sorted = [...per15min].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );

  // 1. Agreger par jour pour detecter la fenetre d'activite reelle.
  const byDay = new Map();
  for (const s of sorted) byDay.set(s.date, (byDay.get(s.date) || 0) + s.count);
  const peakDayCount = Math.max(...byDay.values());
  const threshold = Math.max(1, peakDayCount * 0.05);
  let effectiveEndDay = null;
  const days = [...byDay.keys()].sort();
  for (let i = days.length - 1; i >= 0; i--) {
    if (byDay.get(days[i]) >= threshold) {
      effectiveEndDay = days[i];
      break;
    }
  }
  if (!effectiveEndDay) effectiveEndDay = days[days.length - 1];

  // 2. Filtrer les creneaux au dela du jour effectif (les retardataires).
  const filtered = sorted.filter((s) => s.date <= effectiveEndDay);
  if (filtered.length === 0) return [];

  // 3. Re-agreger les creneaux 15 min dans des buckets de `step` minutes,
  //    aligne sur les frontieres minuit (un bucket 30 min = HH:00 et HH:30).
  const counts = new Map();
  for (const s of filtered) {
    const t = slotToMinutes(s);
    const dayStart = slotToMinutes({ date: s.date, time: "00:00" });
    const bucketStart = dayStart + Math.floor((t - dayStart) / step) * step;
    counts.set(bucketStart, (counts.get(bucketStart) || 0) + s.count);
  }

  // 4. Trace la courbe sur la fenetre [1er bucket, dernier bucket du jour effectif].
  const firstSlotMin = slotToMinutes(filtered[0]);
  const dayStart0 = slotToMinutes({ date: filtered[0].date, time: "00:00" });
  const start = dayStart0 + Math.floor((firstSlotMin - dayStart0) / step) * step;
  // dernier bucket = celui qui contient 23:45 du jour effectif
  const endDayStart = slotToMinutes({ date: effectiveEndDay, time: "00:00" });
  const lastBucket = endDayStart + Math.floor((24 * 60 - step) / step) * step;

  const points = [{ offset: 0, value: expected }];
  let remaining = expected;
  let offset = step;
  for (let t = start; t <= lastBucket; t += step) {
    remaining -= counts.get(t) || 0;
    points.push({ offset, value: remaining });
    offset += step;
  }
  return points;
}

export function formatOffsetLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `+${h}h`;
  return `+${h}h${String(m).padStart(2, "0")}`;
}
