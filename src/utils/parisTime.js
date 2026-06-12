// Conversion d'une date UTC (string ISO avec "Z" ou Date) vers les composants
// Europe/Paris. Gere automatiquement le passage CET (UTC+1) / CEST (UTC+2)
// via Intl.DateTimeFormat.
//
// Pourquoi : les champs `checkedInDate` et `badges[].deliveredAt` sont stockes
// en UTC (suffixe "Z"). Sans conversion, un check-in a 23:30 heure de Paris
// (21:30 UTC en hiver) tomberait dans le bucket UTC "21h" et — selon l'heure —
// dans le mauvais jour. On veut bucketer sur la realite terrain (heure de
// Paris), pas sur UTC.

// Normalise un timestamp en epoch MILLISECONDES (number) ou null si invalide.
// Source unique de l'heuristique "Flink ms vs secondes" : les jobs Flink ecrivent
// tantot des secondes, tantot des ms — un nombre < 10^12 (~2001 en ms) est
// considere comme des secondes. Accepte aussi une string numerique (idem) ou une
// date ISO (deleguee a Date.parse). A utiliser partout au lieu de redupliquer le
// test `< 10**12` (sinon un changement de format Flink se corrige a N endroits).
export function toEpochMs(ts) {
  if (ts == null || ts === "") return null;
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === "string" && /^\d+$/.test(ts)) {
    const n = Number(ts);
    return n < 1e12 ? n * 1000 : n;
  }
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

const PARIS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function parisDateParts(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = {};
  for (const p of PARIS_FORMATTER.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: parseInt(parts.minute, 10),
  };
}

export function parisDay(iso) {
  return parisDateParts(iso)?.ymd ?? null;
}

// Heure "murale" affichee TELLE QUELLE, SANS conversion de fuseau. A utiliser
// pour les TIMESTAMP timezone-naive (sans "Z") qui representent une heure locale
// de programme — typiquement `session_start` venant de SI-views via Flink
// (format "YYYY-MM-DD HH:mm:ss"). Ce ne sont PAS des instants UTC : les passer
// dans parisDateParts / new Date() les interpreterait selon le fuseau du
// navigateur et les decalerait. Ici on lit juste les composants tels qu'ecrits.
export function wallClock(ts, { withSeconds = false } = {}) {
  if (!ts) return "";
  const s = String(ts);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  const base = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  return withSeconds ? `${base}:${m[6] || "00"}` : base;
}

// "YYYY-MM-DD HH:mm:ss" en heure de Paris (CET/CEST gere). Utilise pour les
// exports CSV : les dates ISO sont en UTC (suffixe "Z") cote API, on veut les
// presenter en heure locale Paris dans les fichiers livres aux clients.
export function parisDateTime(iso) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const parts = {};
  for (const p of PARIS_FORMATTER.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  let hour = parts.hour;
  if (hour === "24") hour = "00";
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}
