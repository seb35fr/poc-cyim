// Palette de couleurs deterministe par TYPE D'INSCRIPTION. Le meme libelle
// produit toujours la meme couleur — utile pour que le visiteur retrouve
// la couleur du type "Plein tarif" (par ex.) d'un onglet a l'autre.
//
// Le hash est volontairement simple : la palette compte 12 entrees, et la
// somme des char codes mod 12 donne l'index. Stable, sans collision genante
// pour les ~10-15 types typiquement presents sur un congres CYIM.

const PALETTE = [
  "#1E4E66", // bleu nuit CYIM (primaire)
  "#30DD92", // vert CYIM
  "#6F45FF", // violet CYIM
  "#FFA600", // orange
  "#E53935", // rouge
  "#00BCD4", // cyan
  "#9C27B0", // mauve
  "#A3B86C", // olive
  "#FF6B6B", // corail
  "#2A6A8A", // bleu accent
  "#FF8FAB", // rose
  "#5C7CFA", // indigo
];

// Couleurs FIXES pour certains types, prioritaires sur le hash. Cle normalisee
// (sans accent, minuscule) -> tolere "ETUDIANT" / "Étudiant" / "Etudiant".
const COLOR_OVERRIDES = {
  etudiant: "#4ba2d3",
  congressite: "#274399",
  congressiste: "#274399", // variante orthographique (FR)
  exposant: "#60c19d",
  presse: "#000000",
  organisation: "#f8752f",
};

function normalizeType(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getTypeColor(type) {
  if (!type) return "#9CA3AF";
  const override = COLOR_OVERRIDES[normalizeType(type)];
  if (override) return override;
  return PALETTE[hashStr(String(type)) % PALETTE.length];
}

export function getTypeColors(types) {
  return (types || []).map(getTypeColor);
}
