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
          <div v-if="eventId" class="ds-dl-bar">
            <span class="ds-dl-note">{{ t("dataSources.download.note") }}</span>
            <button class="ds-btn ds-btn-primary" type="button" :disabled="busy !== null" @click="downloadAll">
              {{ busy === "all" ? t("dataSources.download.loading", { n: progress }) : t("dataSources.download.all") }}
            </button>
          </div>
          <p v-if="error" class="ds-error">{{ error }}</p>
          <table class="ds-table">
            <tbody>
              <tr v-for="row in ES" :key="row.index">
                <td class="mono">{{ row.index }}</td>
                <td>
                  {{ row.desc }}
                  <span v-if="counts[row.key] != null" class="ds-count">
                    · {{ t("dataSources.download.docs", { n: counts[row.key] }) }}
                  </span>
                </td>
                <td v-if="eventId" class="ds-actions">
                  <span v-if="busy === row.key" class="ds-progress">{{ progress }}…</span>
                  <template v-else>
                    <button class="ds-btn" type="button" :disabled="busy !== null" @click="downloadOne(row.key, 'json')">JSON</button>
                    <button class="ds-btn" type="button" :disabled="busy !== null" @click="downloadOne(row.key, 'csv')">CSV</button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { INDEX, fetchRawIndex } from "@/api/elasticsearch.js";
import { downloadCsv } from "@/utils/exportCsv.js";

const { t } = useI18n();
defineEmits(["close"]);
const props = defineProps({
  eventId: { type: String, default: "" },
  eventName: { type: String, default: "" },
});

// Modèles / opérations GraphQL interrogés via l'Apollo Gateway.
const GQL = [
  { op: "event(id).config.branding · getEvent(id).config", desc: t("dataSources.gql.config") },
  { op: "event(id).organizers · root.organizers", desc: t("dataSources.gql.organizers") },
  { op: "event(id).searchDelegates", desc: t("dataSources.gql.delegates") },
  { op: "event(id).children(eventType: SESSION)", desc: t("dataSources.gql.sessions") },
  { op: "event(id).location(id)", desc: t("dataSources.gql.locations") },
  { op: "contactByAccountId(accountId).membership(organizationId)", desc: t("dataSources.gql.viewerContacts") },
  { op: "organization(id).members.contact.apps", desc: t("dataSources.gql.orgMembersApps") },
];
// Index Elasticsearch lus en direct (proxy /api/es). Noms réels via INDEX.
const ES = [
  { key: "audience", index: INDEX.audience, desc: t("dataSources.es.audience") },
  { key: "checkin", index: INDEX.checkin, desc: t("dataSources.es.checkin") },
  { key: "zone", index: INDEX.zone, desc: t("dataSources.es.zone") },
  { key: "live", index: INDEX.live, desc: t("dataSources.es.live") },
  { key: "replay", index: INDEX.replay, desc: t("dataSources.es.replay") },
];

// --- Téléchargement du contenu brut des index (filtré sur l'event courant) ---
// Re-fetch à la demande (pas les hits déjà en mémoire, qui excluent les comptes
// @cyim.com côté live/replay) → reflet fidèle de l'index pour ce congress_id.
const busy = ref(null); // clé d'index en cours, "all", ou null
const progress = ref(0);
const error = ref("");
const counts = reactive({});

function fileBase() {
  const name = (props.eventName || props.eventId || "event").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
  return `${name}-${new Date().toISOString().slice(0, 10)}`;
}

function downloadJson(content, filename) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// CSV : 1 ligne = 1 document, colonnes = union des clés de _source (triées),
// précédées de _id. Les valeurs objet/tableau sont sérialisées en JSON.
function hitsToCsv(key, hits) {
  const cols = [...new Set(hits.flatMap((h) => Object.keys(h._source || {})))].sort();
  const cell = (v) => (v != null && typeof v === "object" ? JSON.stringify(v) : v);
  const rows = hits.map((h) => [h._id, ...cols.map((c) => cell(h._source?.[c]))]);
  downloadCsv(`es-${key}-${fileBase()}`, ["_id", ...cols], rows);
}

async function fetchIndex(key) {
  progress.value = 0;
  const hits = await fetchRawIndex(key, props.eventId, ({ loaded }) => (progress.value = loaded));
  counts[key] = hits.length;
  return hits;
}

async function downloadOne(key, format) {
  if (busy.value) return;
  busy.value = key;
  error.value = "";
  try {
    const hits = await fetchIndex(key);
    if (format === "csv") hitsToCsv(key, hits);
    else
      downloadJson(
        { index: INDEX[key], congressId: props.eventId, fetchedAt: new Date().toISOString(), total: hits.length, hits },
        `es-${key}-${fileBase()}.json`
      );
  } catch (e) {
    error.value = t("dataSources.download.error", { msg: e.message });
  } finally {
    busy.value = null;
  }
}

// Un seul JSON regroupant les 5 index (fetch séquentiel pour ménager le cluster).
async function downloadAll() {
  if (busy.value) return;
  busy.value = "all";
  error.value = "";
  try {
    const indexes = {};
    for (const { key } of ES) {
      const hits = await fetchIndex(key);
      indexes[key] = { index: INDEX[key], total: hits.length, hits };
    }
    downloadJson({ congressId: props.eventId, fetchedAt: new Date().toISOString(), indexes }, `es-all-${fileBase()}.json`);
  } catch (e) {
    error.value = t("dataSources.download.error", { msg: e.message });
  } finally {
    busy.value = null;
  }
}
</script>

<style scoped>
.ds-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
}
.ds-modal {
  background: #fff; border-radius: 10px; width: 100%; max-width: 880px;
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
.ds-actions { white-space: nowrap; width: 1%; text-align: right; }
.ds-btn {
  font-size: 11px; font-weight: 600; padding: 3px 8px; margin-left: 4px; cursor: pointer;
  border: 1px solid #c9d6de; background: #fff; color: #1e4e66; border-radius: 4px;
}
.ds-btn:hover:not(:disabled) { background: #e6eef3; }
.ds-btn:disabled { opacity: 0.5; cursor: default; }
.ds-btn-primary { background: #1e4e66; color: #fff; border-color: #1e4e66; }
.ds-btn-primary:hover:not(:disabled) { background: #254f65; }
.ds-dl-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 8px; flex-wrap: wrap; }
.ds-dl-note { font-size: 11px; color: var(--text-muted, #646464); }
.ds-progress, .ds-count { font-size: 11px; color: var(--text-muted, #646464); }
.ds-error { font-size: 12px; color: #c0392b; margin: 0 0 8px; }
@media (max-width: 600px) {
  .ds-table .mono { white-space: normal; }
}
</style>
