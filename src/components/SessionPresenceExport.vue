<template>
  <section class="export-category" :class="{ open }">
    <header v-if="!headerless" class="export-category-header" @click="$emit('toggle')">
      <div>
        <h3>{{ title }}</h3>
        <p>{{ desc }}</p>
      </div>
      <span class="chevron" :class="{ rotated: open }">▾</span>
    </header>

    <div v-if="open" class="export-category-body">
      <div v-if="loading" class="loading-row">
        <div class="spinner-small-dark"></div>
        <span>{{ t("exports.loadingSources") }}</span>
      </div>
      <template v-else>
        <div class="info-row">
          <div class="info-chip">
            <span class="info-chip-label">{{ t("exports.presence.detected") }}</span>
            <span class="info-chip-value">{{ sessions.length }}</span>
          </div>
        </div>

        <div class="search-row">
          <input
            v-model="search"
            type="text"
            :placeholder="t('exports.presence.searchPlaceholder')"
            class="search-input"
          />
          <select v-if="types.length > 0" v-model="selectedType" class="type-select">
            <option value="">{{ t("exports.presence.allTypes") }}</option>
            <option v-for="ty in types" :key="ty" :value="ty">{{ ty }}</option>
          </select>
          <select v-if="organizers.length > 0" v-model="selectedOrganizer" class="type-select">
            <option value="">{{ t("exports.presence.allOrganizers") }}</option>
            <option v-for="org in organizers" :key="org" :value="org">{{ org }}</option>
          </select>
          <button
            class="btn-primary"
            :disabled="filtered.length === 0 || exportingAll"
            @click="exportAll"
          >
            <span v-if="exportingAll" class="spinner-small-light"></span>
            {{ exportingAll
              ? t("exports.presence.exportAllProgress", { done: exportAllProgress, total: filtered.length })
              : t("exports.presence.exportAll", { n: filtered.length }) }}
          </button>
          <button
            v-if="mergedExportFn"
            class="btn-primary"
            :disabled="filtered.length === 0 || exportingAll"
            :title="t('exports.presence.exportMergedHint')"
            @click="exportMerged"
          >
            {{ t("exports.presence.exportMerged", { n: filtered.length }) }}
          </button>
        </div>

        <div v-if="filtered.length === 0" class="empty-msg">
          {{ t("exports.presence.noMatch") }}
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table sessions-table">
            <thead>
              <tr>
                <th>{{ t("exports.presence.colSession") }}</th>
                <th>{{ t("exports.presence.colOrganizer") }}</th>
                <th>{{ t("exports.presence.colType") }}</th>
                <th>{{ t("exports.presence.colStart") }}</th>
                <th class="num">
                  {{ countLabel }} <span v-if="countHint" class="th-hint">{{ countHint }}</span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in filtered" :key="s.id">
                <td>
                  <div class="session-title">{{ s.title }}</div>
                  <code class="session-id">{{ s.id }}</code>
                </td>
                <td>{{ s.organizer || "—" }}</td>
                <td>{{ s.type || "—" }}</td>
                <td class="session-start">{{ formatStart(s.start) }}</td>
                <td class="num">{{ fmt(s.count) }}</td>
                <td>
                  <button class="btn-export" @click="exportFn(s)">
                    {{ t("exports.presence.exportCsv") }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { fmt } from "@/utils/formatters.js";

const props = defineProps({
  open: { type: Boolean, default: false },
  // Masque l'en-tete interne (utilise en mode "lanceur de cartes" : la carte
  // joue le role de titre/declencheur, le composant ne rend que son corps).
  headerless: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  title: { type: String, required: true },
  desc: { type: String, default: "" },
  // [{ id, title, start, count, type, organizer }] — deja restreintes a la source.
  sessions: { type: Array, default: () => [] },
  countLabel: { type: String, default: "" },
  countHint: { type: String, default: "" },
  // (session) => void : construit + telecharge le CSV de la session.
  exportFn: { type: Function, required: true },
  // (sessions, { filtersActive }) => void : export complet en UN seul CSV, non
  // groupe par session, sur les sessions filtrees. Bouton masque si absent.
  mergedExportFn: { type: Function, default: null },
});

defineEmits(["toggle"]);

const { t, locale } = useI18n();

const search = ref("");
const selectedType = ref("");
const selectedOrganizer = ref("");
const exportingAll = ref(false);
const exportAllProgress = ref(0);

const types = computed(() => {
  const set = new Set();
  for (const s of props.sessions) if (s.type) set.add(s.type);
  return [...set].sort((a, b) => a.localeCompare(b));
});

const organizers = computed(() => {
  const set = new Set();
  for (const s of props.sessions) if (s.organizer) set.add(s.organizer);
  return [...set].sort((a, b) => a.localeCompare(b));
});

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return props.sessions.filter((s) => {
    if (selectedType.value && s.type !== selectedType.value) return false;
    if (selectedOrganizer.value && s.organizer !== selectedOrganizer.value) return false;
    if (!q) return true;
    return (s.title || "").toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
  });
});

async function exportAll() {
  if (exportingAll.value) return;
  exportingAll.value = true;
  exportAllProgress.value = 0;
  try {
    for (const session of filtered.value) {
      props.exportFn(session);
      exportAllProgress.value += 1;
      // Petite pause pour laisser le navigateur enchainer les downloads.
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    exportingAll.value = false;
    exportAllProgress.value = 0;
  }
}

function exportMerged() {
  const filtersActive = !!(search.value.trim() || selectedType.value || selectedOrganizer.value);
  props.mergedExportFn(filtered.value, { filtersActive });
}

function formatStart(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(locale.value === "en" ? "en-GB" : "fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
.export-category {
  background: var(--card); border-radius: 10px;
  box-shadow: var(--shadow); margin-bottom: 12px;
  border: 1px solid var(--border); overflow: hidden;
}
.export-category-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; cursor: pointer; user-select: none;
  transition: background .15s;
}
.export-category-header:hover { background: #fafbfc; }
.export-category.open .export-category-header {
  border-bottom: 1px solid var(--border);
  background: #fafbfc;
}
.export-category-header h3 {
  font-size: 16px; font-weight: 600; color: #254f65;
  margin: 0 0 3px;
}
.export-category-header p {
  font-size: 13px; color: var(--text-muted);
  margin: 0; line-height: 1.4; max-width: 640px;
}
.chevron {
  color: var(--text-muted); font-size: 18px; padding: 0 4px;
  transition: transform .15s;
}
.export-category:not(.open) .chevron { transform: rotate(-90deg); }

.export-category-body { padding: 14px 18px; }

.loading-row {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: var(--text-secondary); padding: 12px 0;
}
.spinner-small-dark {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--border); border-top-color: var(--primary);
  animation: spin .6s linear infinite;
}
.spinner-small-light {
  display: inline-block; width: 10px; height: 10px;
  border: 2px solid rgba(255, 255, 255, .35); border-top-color: #fff;
  border-radius: 50%; animation: spin .6s linear infinite;
  margin-right: 4px; vertical-align: -1px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.info-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.info-chip {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 4px 10px; background: #eef6ff;
  border: 1px solid #bdd8f1; border-radius: 999px;
}
.info-chip-label {
  font-size: 12px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .3px; font-weight: 600;
}
.info-chip-value { font-size: 14px; font-weight: 700; color: var(--primary); }

.search-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
.search-input {
  flex: 1; padding: 7px 12px; font-size: 14px;
  border: 1px solid var(--border); border-radius: 6px;
  background: #fff; color: var(--text); font-family: inherit;
  transition: border-color .15s;
}
.search-input:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(30, 78, 102, .12);
}
.type-select {
  padding: 7px 10px; font-size: 14px; font-family: inherit;
  border: 1px solid var(--border); border-radius: 6px;
  background: #fff; color: var(--text); cursor: pointer; max-width: 220px;
}
.type-select:focus { outline: none; border-color: var(--primary); }
.btn-primary {
  padding: 7px 14px; border: none; border-radius: 6px;
  background: var(--primary); color: #fff;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background .15s; white-space: nowrap;
  display: inline-flex; align-items: center;
}
.btn-primary:hover { background: var(--primary-light); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; background: var(--primary); }

.table-wrapper {
  border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; background: #fff;
}
.sessions-table { font-size: 13px; }
.sessions-table th.num, .sessions-table td.num { text-align: right; }
.sessions-table th { padding: 8px 10px; }
.sessions-table td { padding: 8px 10px; vertical-align: middle; }
.th-hint {
  font-weight: 400; color: var(--text-muted);
  text-transform: none; letter-spacing: 0; font-size: 10px;
}
.session-title {
  font-weight: 600; color: var(--text); line-height: 1.3;
  max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.session-id {
  font-size: 10px; color: var(--text-muted); font-family: monospace;
  background: #f5f6f8; padding: 1px 5px; border-radius: 3px;
  display: inline-block; margin-top: 2px;
}
.session-start { white-space: nowrap; color: var(--text-secondary); }

.btn-export {
  padding: 5px 12px; border: 1px solid var(--primary);
  background: #fff; color: var(--primary); border-radius: 5px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  white-space: nowrap; transition: all .12s;
}
.btn-export:hover { background: var(--primary); color: #fff; }

.empty-msg {
  text-align: center; padding: 32px;
  color: var(--text-muted); font-size: 14px;
  background: #fafbfc; border-radius: 8px;
}
</style>
