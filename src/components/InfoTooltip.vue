<template>
  <!-- Bouton "i" rond + bulle d'explication. Ouverture au survol ET au focus
       (clic/tab clavier) — pas d'etat JS, l'accessibilite passe par <button> +
       :focus-within. La bulle se positionne sous le bouton, alignee a droite par
       defaut (align="left" pour l'aligner a gauche quand le bouton est en debut
       de ligne). aria-label/role tooltip pour les lecteurs d'ecran. -->
  <span class="info-tip" :class="`info-tip--${align}`">
    <button class="info-tip-btn" type="button" :aria-label="ariaLabel || plainText">i</button>
    <!-- v-html : les libelles d'aide (i18n statiques, jamais d'input utilisateur)
         peuvent contenir du HTML leger (<code>, <strong>). aria-label recoit la
         version texte brut pour les lecteurs d'ecran. -->
    <span class="info-tip-bubble" role="tooltip" v-html="text"></span>
  </span>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  // Texte d'explication affiche dans la bulle (HTML leger autorise : <code>, <strong>).
  text: { type: String, required: true },
  // Label ARIA optionnel (sinon = version texte brut de `text`).
  ariaLabel: { type: String, default: "" },
  // Alignement horizontal de la bulle par rapport au bouton. Defaut "left" : le
  // bouton etant colle au titre (a gauche de l'en-tete), la bulle s'ouvre vers la
  // droite et ne deborde pas du bord gauche de la carte.
  align: { type: String, default: "left" }, // "left" | "right"
});

// Texte brut (tags HTML retires) pour l'aria-label lu par les lecteurs d'ecran.
const plainText = computed(() => props.text.replace(/<[^>]+>/g, ""));
</script>

<style scoped>
.info-tip {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}
.info-tip-btn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--border, #d1d5db);
  background: #fff;
  color: var(--text-muted, #646464);
  font-size: 10px;
  font-weight: 700;
  font-style: italic;
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1;
  cursor: help;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.info-tip-btn:hover,
.info-tip-btn:focus-visible {
  background: var(--primary, #1e4e66);
  color: #fff;
  border-color: var(--primary, #1e4e66);
  outline: none;
}
.info-tip-bubble {
  position: absolute;
  top: calc(100% + 6px);
  z-index: 50;
  width: max-content;
  max-width: 280px;
  padding: 8px 10px;
  background: #2b2b2b;
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  font-style: normal;
  line-height: 1.45;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-3px);
  transition: opacity 0.15s, transform 0.15s, visibility 0.15s;
  pointer-events: none;
  white-space: normal;
  /* Neutralise le style du parent (ex. .kpi-label en majuscules). */
  text-transform: none;
  letter-spacing: normal;
  text-align: left;
}
.info-tip--right .info-tip-bubble { right: 0; }
.info-tip--left .info-tip-bubble { left: 0; }
/* Petite fleche vers le bouton. */
.info-tip-bubble::before {
  content: "";
  position: absolute;
  bottom: 100%;
  border: 5px solid transparent;
  border-bottom-color: #2b2b2b;
}
.info-tip--right .info-tip-bubble::before { right: 4px; }
.info-tip--left .info-tip-bubble::before { left: 4px; }
.info-tip:hover .info-tip-bubble,
.info-tip:focus-within .info-tip-bubble {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
</style>
