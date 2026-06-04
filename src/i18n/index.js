import { createI18n } from "vue-i18n";
import fr from "./locales/fr.js";
import en from "./locales/en.js";

export const SUPPORTED_LOCALES = ["fr", "en"];
const STORAGE_KEY = "stats-lang";

// Langue initiale : localStorage si valide, sinon FR (langue par defaut du PoC).
function initialLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch {
    /* localStorage indisponible (mode prive, etc.) — fallback silencieux */
  }
  return "fr";
}

// Composition API uniquement (legacy: false) → `useI18n()` dans les <script setup>.
// fallbackLocale FR : une cle manquante en EN retombe sur le libelle francais
// plutot que d'afficher la cle brute — pratique pendant la migration progressive.
export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale(),
  fallbackLocale: "fr",
  messages: { fr, en },
});

// Applique la langue au <html lang> des le boot (accessibilite + CSS :lang).
document.documentElement.setAttribute("lang", i18n.global.locale.value);

// Bascule de langue : met a jour i18n, persiste, et synchronise <html lang>.
// Appele par le toggle FR/EN du header.
export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* persistance best-effort */
  }
  document.documentElement.setAttribute("lang", locale);
}
