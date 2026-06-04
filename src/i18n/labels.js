// Traduction des libelles de categories DERIVEES — produites canoniques-FR par
// computeStats.js / countries.js (genres "Hommes/Femmes/Autre", continents
// "Europe/Afrique/...", "Tous les jours", "Non renseigne"). computeStats reste
// locale-agnostic ; on traduit ICI a l'affichage.
//
// Utilisable cote composant ET cote util (export MD, analyse) car on lit le t
// global reactif de l'instance i18n. Les cles canoniques = valeur FR d'origine
// emise par computeStats (sans accent pour les continents : "Amerique", "Asie"...).
import { i18n } from "./index.js";

const t = (key, named) => i18n.global.t(key, named || {});

// canonique computeStats -> cle i18n
const GENDER_KEY = {
  Hommes: "categories.gender.male",
  Femmes: "categories.gender.female",
  Autre: "categories.gender.other",
  "Non renseigne": "categories.notSpecified",
};
const CONTINENT_KEY = {
  Europe: "categories.continent.europe",
  Afrique: "categories.continent.africa",
  Amerique: "categories.continent.america",
  Asie: "categories.continent.asia",
  Oceanie: "categories.continent.oceania",
  Autre: "categories.continent.other",
  "Non renseigne": "categories.notSpecified",
};

// Resout une valeur canonique en libelle localise ; valeur hors map (donnee
// libre : profession, type d'inscription...) renvoyee telle quelle.
function resolve(map, value) {
  const key = map[value];
  return key ? t(key) : value;
}

export const genderLabel = (value) => resolve(GENDER_KEY, value);
export const continentLabel = (value) => resolve(CONTINENT_KEY, value);

// "Non renseigne" (sortie computeStats) OU null/undefined -> libelle localise.
export const notSpecified = () => t("categories.notSpecified");
export const isNotSpecified = (value) => !value || value === "Non renseigne";

// "Tous les jours" (accessDays computeStats) -> libelle localise.
export const allDaysLabel = () => t("categories.allDays");

// Jours de la semaine localises, en tableau ordonne (index 0 = Lundi ... 6 = Dimanche).
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const weekdayNames = () => WEEKDAY_KEYS.map((k) => t(`categories.weekdays.${k}`));
