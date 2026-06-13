<template>
  <!-- Détail technique des données interrogées : modèles GraphQL (Apollo Gateway)
       + index Elasticsearch. Ouvert depuis le bouton « i » du header. -->
  <div class="ds-overlay" @click.self="$emit('close')">
    <div class="ds-modal" role="dialog" aria-modal="true">
      <div class="ds-head">
        <h3>{{ t("dataSources.title") }}</h3>
        <button class="ds-close" type="button" :title="t('dataSources.close')" @click="$emit('close')">✕</button>
      </div>
      <div class="ds-body">
        <p class="ds-intro">{{ t("dataSources.intro") }}</p>

        <section class="ds-section">
          <h4>{{ t("dataSources.graphqlSection") }} <span class="ds-pill ds-gql">GraphQL</span></h4>
          <p class="ds-section-sub">{{ t("dataSources.graphqlSub") }}</p>
          <table class="ds-table">
            <tbody>
              <tr v-for="row in GQL" :key="row.op">
                <td class="mono">{{ row.op }}</td>
                <td>{{ row.desc }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="ds-section">
          <h4>{{ t("dataSources.esSection") }} <span class="ds-pill ds-es">Elasticsearch</span></h4>
          <p class="ds-section-sub">{{ t("dataSources.esSub") }}</p>
          <table class="ds-table">
            <tbody>
              <tr v-for="row in ES" :key="row.index">
                <td class="mono">{{ row.index }}</td>
                <td>{{ row.desc }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from "vue-i18n";
import { INDEX } from "@/api/elasticsearch.js";

const { t } = useI18n();
defineEmits(["close"]);

// Modèles / opérations GraphQL interrogés via l'Apollo Gateway.
const GQL = [
  { op: "getEvent(id).config", desc: t("dataSources.gql.config") },
  { op: "event(id).searchDelegates", desc: t("dataSources.gql.delegates") },
  { op: "event(id).children(eventType: SESSION)", desc: t("dataSources.gql.sessions") },
  { op: "event(id).location(id)", desc: t("dataSources.gql.locations") },
];
// Index Elasticsearch lus en direct (proxy /api/es). Noms réels via INDEX.
const ES = [
  { index: INDEX.audience, desc: t("dataSources.es.audience") },
  { index: INDEX.checkin, desc: t("dataSources.es.checkin") },
  { index: INDEX.zone, desc: t("dataSources.es.zone") },
  { index: INDEX.live, desc: t("dataSources.es.live") },
  { index: INDEX.replay, desc: t("dataSources.es.replay") },
];
</script>

<style scoped>
.ds-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
}
.ds-modal {
  background: #fff; border-radius: 10px; width: 100%; max-width: 720px;
  max-height: 85vh; display: flex; flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.ds-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #eee;
}
.ds-head h3 { margin: 0; font-size: 16px; color: #254f65; }
.ds-close {
  border: none; background: transparent; font-size: 18px; cursor: pointer;
  color: #646464; line-height: 1; padding: 2px 6px;
}
.ds-close:hover { color: #1e4e66; }
.ds-body { padding: 16px 18px; overflow: auto; }
.ds-intro { font-size: 13px; color: var(--text-muted, #646464); margin: 0 0 16px; line-height: 1.5; }
.ds-section { margin-bottom: 20px; }
.ds-section:last-child { margin-bottom: 0; }
.ds-section h4 {
  margin: 0 0 4px; font-size: 13px; color: #1e4e66; text-transform: uppercase;
  letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px;
}
.ds-section-sub { font-size: 12px; color: var(--text-muted, #646464); margin: 0 0 8px; }
.ds-pill {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
  text-transform: none; letter-spacing: 0;
}
.ds-pill.ds-gql { background: #ede4ff; color: #5b2bd6; }
.ds-pill.ds-es { background: #e6eef3; color: #1e4e66; }
.ds-table { width: 100%; border-collapse: collapse; }
.ds-table td {
  font-size: 12px; color: #414141; padding: 5px 10px 5px 0;
  vertical-align: top; border-top: 1px solid #f0f0f0;
}
.ds-table tr:first-child td { border-top: none; }
.ds-table .mono {
  font-family: "Fira Code", Consolas, monospace; font-size: 11px;
  color: #254f65; white-space: nowrap; width: 1%; word-break: break-all;
}
@media (max-width: 600px) {
  .ds-table .mono { white-space: normal; }
}
</style>
