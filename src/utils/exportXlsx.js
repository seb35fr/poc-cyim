// Génération de classeurs XLSX multi-onglets côté navigateur (SheetJS).
// Utilisé par l'export "industrie" : 1 fichier par organisation, 1 onglet par
// source (Live / Replay / On site). Chaque onglet = un tableau de lignes
// (Array<Array<cell>>) précédé de ses en-têtes.
//
// SheetJS est chargé en import dynamique (~290 kB) : il ne pèse sur le bundle
// que lorsqu'un export XLSX est réellement déclenché.

// Noms d'onglet Excel : max 31 caractères, caractères []:*?/\ interdits.
function safeSheetName(name) {
  return (name || "Feuille").replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Feuille";
}

/**
 * Construit et télécharge un classeur XLSX.
 * @param {string} filename - nom de fichier sans extension
 * @param {Array<{ name: string, headers: Array<string>, rows: Array<Array<any>> }>} sheets
 */
export async function downloadWorkbook(filename, sheets) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const sheet of sheets || []) {
    const aoa = [sheet.headers || [], ...(sheet.rows || [])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Garantit l'unicité des noms d'onglet (Excel refuse les doublons).
    let name = safeSheetName(sheet.name);
    let i = 2;
    while (used.has(name.toLowerCase())) {
      name = safeSheetName(`${sheet.name} ${i++}`);
    }
    used.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
