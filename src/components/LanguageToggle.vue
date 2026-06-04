<template>
  <div class="lang-toggle" role="group" :aria-label="t('common.language')">
    <button
      v-for="loc in SUPPORTED_LOCALES"
      :key="loc"
      type="button"
      :class="['lang-btn', { active: locale === loc }]"
      :aria-pressed="locale === loc"
      @click="setLocale(loc)"
    >
      {{ loc.toUpperCase() }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n";
import { setLocale, SUPPORTED_LOCALES } from "@/i18n/index.js";

const { locale, t } = useI18n();
</script>

<style scoped>
.lang-toggle {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}
.lang-btn {
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.lang-btn:hover {
  color: #fff;
}
.lang-btn.active {
  background: #fff;
  color: var(--primary);
}
</style>
