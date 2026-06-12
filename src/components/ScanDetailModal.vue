<template>
  <!-- Détail d'une ligne de scan : données brutes ES (`ES`) + délégué/badge
       rapprochés côté app (`APP`). Fermeture par ✕ ou clic sur l'overlay. -->
  <div class="scan-modal-overlay" @click.self="$emit('close')">
    <div class="scan-modal" role="dialog" aria-modal="true">
      <div class="scan-modal-head">
        <h3>{{ t("scans.detailRow.title") }}</h3>
        <button class="scan-modal-close" type="button" :title="t('scans.detailRow.close')" @click="$emit('close')">✕</button>
      </div>
      <div class="scan-modal-body">
        <!-- Données indexées dans l'ES (raw _source du scan) -->
        <section class="scan-modal-section">
          <h4>{{ t("scans.detailRow.esSection") }} <span class="src-pill src-es">ES</span></h4>
          <table class="kv-table">
            <tbody>
              <tr v-for="[k, v] in detailEntries(row.scan.raw)" :key="'es-' + k">
                <th>{{ k }}</th><td class="mono">{{ fmtVal(v) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Données du délégué (registration, via jointure app) -->
        <section class="scan-modal-section">
          <h4>{{ t("scans.detailRow.delegateSection") }} <span class="src-pill src-app">APP</span></h4>
          <p v-if="!row.delegate" class="scan-modal-empty">{{ t("scans.detailRow.delegateNotFound") }}</p>
          <table v-else class="kv-table">
            <tbody>
              <tr><th>id</th><td class="mono">{{ row.delegate.id }}</td></tr>
              <tr><th>givenName</th><td>{{ row.delegate.givenName || '—' }}</td></tr>
              <tr><th>familyName</th><td>{{ row.delegate.familyName || '—' }}</td></tr>
              <tr><th>email</th><td>{{ row.delegate.email || '—' }}</td></tr>
              <tr><th>status</th><td>{{ row.delegate.status || '—' }}</td></tr>
              <tr><th>occupation</th><td>{{ row.delegate.occupation || '—' }}</td></tr>
              <tr><th>company</th><td>{{ row.delegate.company || '—' }}</td></tr>
              <tr><th>country</th><td>{{ row.delegate.primaryAddress?.country?.code || row.delegate.primaryAddress?.countryCode || '—' }}</td></tr>
              <tr><th>checkedInDate</th><td class="mono">{{ row.delegate.checkedInDate || '—' }}</td></tr>
              <tr><th>externalId</th><td class="mono">{{ row.delegate.externalId || '—' }}</td></tr>
              <tr><th>createdAt</th><td class="mono">{{ row.delegate.createdAt || '—' }}</td></tr>
            </tbody>
          </table>
        </section>

        <!-- Données du badge correspondant -->
        <section class="scan-modal-section">
          <h4>{{ t("scans.detailRow.badgeSection") }} <span class="src-pill src-app">APP</span></h4>
          <p v-if="!row.badge" class="scan-modal-empty">{{ t("scans.detailRow.badgeNotFound") }}</p>
          <table v-else class="kv-table">
            <tbody>
              <tr><th>id</th><td class="mono">{{ row.badge.id }}</td></tr>
              <tr><th>type</th><td>{{ row.badge.type || '—' }}</td></tr>
              <tr><th>qrCode.value</th><td class="mono">{{ row.badge.qrCode?.value || '—' }}</td></tr>
              <tr><th>qrCode.decodedValue</th><td class="mono">{{ row.badge.qrCode?.decodedValue || '—' }}</td></tr>
              <tr><th>deliveredAt</th><td class="mono">{{ row.badge.deliveredAt || '—' }}</td></tr>
              <tr><th>storage.publicUrl</th><td><a v-if="row.badge.storage?.publicUrl" :href="row.badge.storage.publicUrl" target="_blank" class="mono">PDF</a><span v-else>—</span></td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps({
  // { scan, delegate, badge } — résolu par le parent (ScansTab.openDetail).
  row: { type: Object, required: true },
});
defineEmits(["close"]);

// Entrées du _source ES (triées) pour le tableau clé/valeur.
function detailEntries(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).sort((a, b) => a[0].localeCompare(b[0]));
}
// Affichage lisible d'une valeur ES (objets -> JSON, null/vide -> '—').
function fmtVal(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
</script>

<style scoped>
.scan-modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
  padding: 20px;
}
.scan-modal {
  background: #fff; border-radius: 10px; width: 100%; max-width: 640px;
  max-height: 85vh; display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.scan-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #eee;
}
.scan-modal-head h3 { margin: 0; font-size: 16px; color: #254f65; }
.scan-modal-close {
  border: none; background: transparent; font-size: 18px; cursor: pointer;
  color: #646464; line-height: 1; padding: 2px 6px;
}
.scan-modal-close:hover { color: #1e4e66; }
.scan-modal-body { padding: 16px 18px; overflow: auto; }
.scan-modal-section { margin-bottom: 18px; }
.scan-modal-section:last-child { margin-bottom: 0; }
.scan-modal-section h4 {
  margin: 0 0 8px; font-size: 13px; color: #1e4e66; text-transform: uppercase;
  letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px;
}
.src-pill {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  text-transform: none; letter-spacing: 0;
}
.src-pill.src-es { background: #e6eef3; color: #1e4e66; }
.src-pill.src-app { background: #e3f9ee; color: #1a8f5e; }
.scan-modal-empty { font-size: 13px; color: var(--text-muted, #646464); font-style: italic; margin: 0; }
.kv-table { width: 100%; border-collapse: collapse; }
.kv-table th {
  text-align: left; font-weight: 600; color: #646464; font-size: 12px;
  padding: 3px 10px 3px 0; vertical-align: top; white-space: nowrap; width: 1%;
}
.kv-table td { font-size: 12px; color: #414141; padding: 3px 0; word-break: break-word; }
.mono { font-family: "Fira Code", ui-monospace, monospace; font-size: 11px; }
</style>
