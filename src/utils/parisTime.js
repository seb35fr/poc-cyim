// Conversion d'une date UTC (string ISO avec "Z" ou Date) vers les composants
// Europe/Paris. Gere automatiquement le passage CET (UTC+1) / CEST (UTC+2)
// via Intl.DateTimeFormat.
//
// Pourquoi : les champs `checkedInDate` et `badges[].deliveredAt` sont stockes
// en UTC (suffixe "Z"). Sans conversion, un check-in a 23:30 heure de Paris
// (21:30 UTC en hiver) tomberait dans le bucket UTC "21h" et — selon l'heure —
// dans le mauvais jour. On veut bucketer sur la realite terrain (heure de
// Paris), pas sur UTC.

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
