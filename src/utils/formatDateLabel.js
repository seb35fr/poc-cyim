// Construit un formatteur de label en fonction du range couvert par les dates.
// Si toutes les dates sont sur la meme annee, on raccourcit en "MM-DD" (compact).
// Si plusieurs annees sont presentes, on garde "YYYY-MM-DD" pour eviter toute ambiguite
// (ex. early-bird ouvert N-1, ou app mobile utilisee apres le congres).
//
// Usage : const fmt = makeDateLabeler(dates); labels = dates.map(fmt);
export function makeDateLabeler(dates) {
  const years = new Set();
  for (const d of dates) {
    if (d && d.length >= 4) years.add(d.slice(0, 4));
  }
  const multiYear = years.size > 1;
  return (date) => {
    if (!date) return "";
    return multiYear ? date : date.slice(5);
  };
}
