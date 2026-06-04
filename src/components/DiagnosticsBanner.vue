<template>
  <div v-if="diagnostics.length > 0" class="diagnostics-banner">
    <div
      v-for="d in diagnostics"
      :key="d.id"
      :class="['diag-toast', `diag-toast--${d.severity}`]"
    >
      <div class="diag-icon">{{ d.severity === "error" ? "✕" : "⚠" }}</div>
      <div class="diag-body">
        <div class="diag-title">{{ d.title }}</div>
        <div class="diag-message">{{ d.message }}</div>
        <div class="diag-action">
          {{ t("diagnostics.action") }}
        </div>
      </div>
      <button class="diag-close" @click="dismiss(d.id)" :title="t('diagnostics.close')">✕</button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n";
import { useDiagnostics } from "@/composables/useDiagnostics.js";

const { t } = useI18n();

// Banniere fixe top-right qui affiche les diagnostics pousses par les
// modules de calcul (jointure ES <-> delegates, etc.). Volontairement
// persistante (pas d'auto-dismiss) : on veut que l'admin nous previenne.
const { diagnostics, dismiss } = useDiagnostics();
</script>

<style scoped>
.diagnostics-banner {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 420px;
  pointer-events: none;
}

.diag-toast {
  display: grid;
  grid-template-columns: 32px 1fr 24px;
  align-items: start;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 10px;
  border-left: 4px solid var(--warning);
  box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.2), 0 6px 12px -6px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  font-family: inherit;
  animation: diag-slide-in 0.25s ease-out;
}

.diag-toast--error {
  border-left-color: var(--danger);
}

.diag-icon {
  font-size: 25px;
  font-weight: 700;
  color: var(--warning);
  line-height: 1;
  text-align: center;
}
.diag-toast--error .diag-icon {
  color: var(--danger);
}

.diag-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  line-height: 1.3;
}

.diag-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 6px;
}

.diag-action {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  font-style: italic;
}

.diag-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  padding: 0;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: background 0.12s, color 0.12s;
}
.diag-close:hover {
  background: #f3f4f6;
  color: var(--text);
}

@keyframes diag-slide-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
