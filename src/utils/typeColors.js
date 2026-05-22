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

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getTypeColor(type) {
  if (!type) return "#9CA3AF";
  return PALETTE[hashStr(String(type)) % PALETTE.length];
}

export function getTypeColors(types) {
  return (types || []).map(getTypeColor);
}
