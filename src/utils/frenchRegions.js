// Mapping code departement (2 premiers chiffres du zipCode) -> code region INSEE.
// Les codes region INSEE correspondent aux feature.properties.code du
// GeoJSON france-geojson de gregoiredavid (regions.geojson).
// Source : https://www.insee.fr/fr/information/4316069 (codes officiels geographiques).

const DEPT_TO_REGION = {
  // Ile-de-France (11)
  "75": "11", "77": "11", "78": "11", "91": "11", "92": "11", "93": "11", "94": "11", "95": "11",
  // Centre-Val de Loire (24)
  "18": "24", "28": "24", "36": "24", "37": "24", "41": "24", "45": "24",
  // Bourgogne-Franche-Comte (27)
  "21": "27", "25": "27", "39": "27", "58": "27", "70": "27", "71": "27", "89": "27", "90": "27",
  // Normandie (28)
  "14": "28", "27": "28", "50": "28", "61": "28", "76": "28",
  // Hauts-de-France (32)
  "02": "32", "59": "32", "60": "32", "62": "32", "80": "32",
  // Grand Est (44)
  "08": "44", "10": "44", "51": "44", "52": "44", "54": "44", "55": "44", "57": "44", "67": "44", "68": "44", "88": "44",
  // Pays de la Loire (52)
  "44": "52", "49": "52", "53": "52", "72": "52", "85": "52",
  // Bretagne (53)
  "22": "53", "29": "53", "35": "53", "56": "53",
  // Nouvelle-Aquitaine (75)
  "16": "75", "17": "75", "19": "75", "23": "75", "24": "75", "33": "75", "40": "75",
  "47": "75", "64": "75", "79": "75", "86": "75", "87": "75",
  // Occitanie (76)
  "09": "76", "11": "76", "12": "76", "30": "76", "31": "76", "32": "76", "34": "76",
  "46": "76", "48": "76", "65": "76", "66": "76", "81": "76", "82": "76",
  // Auvergne-Rhone-Alpes (84)
  "01": "84", "03": "84", "07": "84", "15": "84", "26": "84", "38": "84", "42": "84",
  "43": "84", "63": "84", "69": "84", "73": "84", "74": "84",
  // Provence-Alpes-Cote d'Azur (93)
  "04": "93", "05": "93", "06": "93", "13": "93", "83": "93", "84": "93",
  // Corse (94)
  "2A": "94", "2B": "94",
  // DOM-TOM (codes a 3 chiffres pour le dept mais on les recoit en zipCode 5 chiffres)
  "971": "01", // Guadeloupe
  "972": "02", // Martinique
  "973": "03", // Guyane
  "974": "04", // La Reunion
  "976": "06", // Mayotte
};

export const REGION_NAMES = {
  "01": "Guadeloupe",
  "02": "Martinique",
  "03": "Guyane",
  "04": "La Réunion",
  "06": "Mayotte",
  "11": "Île-de-France",
  "24": "Centre-Val de Loire",
  "27": "Bourgogne-Franche-Comté",
  "28": "Normandie",
  "32": "Hauts-de-France",
  "44": "Grand Est",
  "52": "Pays de la Loire",
  "53": "Bretagne",
  "75": "Nouvelle-Aquitaine",
  "76": "Occitanie",
  "84": "Auvergne-Rhône-Alpes",
  "93": "Provence-Alpes-Côte d'Azur",
  "94": "Corse",
};

// Resout un code postal francais (string) en code region INSEE.
// Gere : 5 chiffres metropolitain (dept = 2 premiers), 5 chiffres DOM (dept = 3 premiers
// pour les codes 971xx, 972xx, etc.), corse 2A/2B (codes postaux 20xxx -> redirige).
export function zipToRegion(zipCode) {
  if (!zipCode) return null;
  const z = String(zipCode).trim();
  if (z.length < 2) return null;

  // DOM-TOM : zipCode de 5 chiffres commence par 97
  if (z.startsWith("97")) {
    return DEPT_TO_REGION[z.slice(0, 3)] || null;
  }

  // Corse : codes postaux 20000-20190 -> Corse-du-Sud (2A), 20200-20620 -> Haute-Corse (2B)
  if (z.startsWith("20")) {
    const n = parseInt(z, 10);
    if (n >= 20000 && n <= 20190) return "94";
    if (n >= 20200 && n <= 20620) return "94";
    return "94";
  }

  return DEPT_TO_REGION[z.slice(0, 2)] || null;
}
