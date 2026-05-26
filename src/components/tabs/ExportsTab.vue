<template>
  <div class="exports-tab">
    <header class="exports-header">
      <h2>Exports</h2>
      <p class="exports-subtitle">
        Téléchargez des extractions CSV à partager avec vos clients. Les sources
        (scans physiques, live, replay) sont chargées automatiquement à l'ouverture
        de cet onglet et se rafraîchissent toutes les 10 min.
      </p>
    </header>

    <div v-if="errors.length > 0" class="exports-errors">
      <p v-for="err in errors" :key="err">⚠ {{ err }}</p>
    </div>

    <!-- ═══ Catégorie : Présence par session ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'session-attendance' }">
      <header class="export-category-header" @click="toggleCategory('session-attendance')">
        <div>
          <h3>Présence par session</h3>
          <p>
            Pour une session donnée : liste des personnes présentes physiquement,
            en live et/ou en replay. Un CSV par session.
          </p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'session-attendance' }">▾</span>
      </header>

      <div v-if="openCategory === 'session-attendance'" class="export-category-body">
        <div v-if="loading" class="loading-row">
          <div class="spinner-small-dark"></div>
          <span>Chargement des sources (scans, live, replay)…</span>
        </div>
        <template v-else>
          <div class="info-row">
            <div class="info-chip">
              <span class="info-chip-label">Sessions détectées</span>
              <span class="info-chip-value">{{ sessions.length }}</span>
            </div>
            <div class="info-chip">
              <span class="info-chip-label">Délégués chargés</span>
              <span class="info-chip-value">{{ (delegates || []).length }}</span>
            </div>
          </div>

          <div class="search-row">
            <input
              v-model="search"
              type="text"
              placeholder="Rechercher une session par titre ou ID…"
              class="search-input"
            />
            <button
              class="btn-primary"
              :disabled="filteredSessions.length === 0 || exportingAll"
              @click="exportAllSessionsCsv"
            >
              <span v-if="exportingAll" class="spinner-small-light"></span>
              {{ exportingAll
                ? `Export ${exportAllProgress}/${filteredSessions.length}…`
                : `Tout exporter (${filteredSessions.length} CSV)` }}
            </button>
          </div>

          <div v-if="filteredSessions.length === 0" class="empty-msg">
            Aucune session ne correspond à votre recherche.
          </div>
          <div v-else class="table-wrapper">
            <table class="data-table sessions-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Début</th>
                  <th class="num" title="Scans audience pour cette session (1 ligne = 1 scan)">
                    Physique <span class="th-hint">(scans)</span>
                  </th>
                  <th class="num" title="Vues live pour cette session">
                    Live <span class="th-hint">(vues)</span>
                  </th>
                  <th class="num" title="Vues replay pour cette session">
                    Replay <span class="th-hint">(vues)</span>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in filteredSessions" :key="s.id">
                  <td>
                    <div class="session-title">{{ s.title }}</div>
                    <code class="session-id">{{ s.id }}</code>
                  </td>
                  <td class="session-start">{{ formatStart(s.start) }}</td>
                  <td class="num">{{ fmt(s.audienceCount) }}</td>
                  <td class="num">{{ fmt(s.liveCount) }}</td>
                  <td class="num">{{ fmt(s.replayCount) }}</td>
                  <td>
                    <button class="btn-export" @click="exportSessionCsv(s)">
                      Exporter CSV
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="footnote">
            <strong>Présent physique</strong> = au moins un scan audience pour cette
            session. <strong>Vu en live / replay</strong> = au moins une vue ES
            associée à cette session. Les durées sont cumulées sur toutes les vues.
            Les viewers ES non rapprochés d'un délégué (user_id Keycloak inconnu)
            apparaissent en fin de liste avec leur fullName/email bruts.
          </p>
        </template>
      </div>
    </section>

    <!-- Autres catégories d'export à venir (no-show, audience par session, etc.) -->
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useRoomScans } from "../../composables/useRoomScans.js";
import { downloadCsv } from "../../utils/exportCsv.js";
import { fmt } from "@/utils/formatters.js";
import {
  buildSessionAttendance,
  ATTENDANCE_HEADERS,
  attendanceRowToCsv,
} from "../../utils/buildSessionAttendance.js";

const props = defineProps({
  delegates: { type: Array, default: () => [] },
  eventName: { type: String, default: "" },
  // Instances live/replay proprietees par StatisticsView (timer + cache mutualises).
  liveApi: { type: Object, required: true },
  replayApi: { type: Object, required: true },
});

const route = useRoute();
const eventId = route.params.eventId;

// Live/Replay = instances heritees (cf. props). Scans = instance locale a ce
// tab — pas encore mutualisee avec ScansTab (TODO Day 1.3+). En contrepartie
// la 1re ouverture refetch les scans meme si ScansTab a deja ete visite.
const live = props.liveApi;
const replay = props.replayApi;
const scans = useRoomScans(eventId);

const openCategory = ref("session-attendance"); // ouvert par defaut
const search = ref("");
const exportingAll = ref(false);
const exportAllProgress = ref(0);

function toggleCategory(id) {
  openCategory.value = openCategory.value === id ? null : id;
}

const loading = computed(
  () => live.loading.value || replay.loading.value || scans.loading.value
);

const errors = computed(() => {
  const arr = [];
  if (live.error.value) arr.push(`Live : ${live.error.value}`);
  if (replay.error.value) arr.push(`Replay : ${replay.error.value}`);
  if (scans.error.value) arr.push(`Scans : ${scans.error.value}`);
  return arr;
});

// Union des sessions detectees dans les 3 sources. Compteurs bruts (1 scan = 1 unite).
const sessions = computed(() => {
  const map = new Map();

  const ensure = (id, { title, start, end } = {}) => {
    if (!map.has(id)) {
      map.set(id, {
        id,
        title: title || id,
        start: start || null,
        end: end || null,
        audienceCount: 0,
        liveCount: 0,
        replayCount: 0,
      });
    }
    const entry = map.get(id);
    if (title && (entry.title === id || !entry.title)) entry.title = title;
    if (start && !entry.start) entry.start = start;
    if (end && !entry.end) entry.end = end;
    return entry;
  };

  // audience scans n'exposent pas sessionEnd, mais live/replay le recuperent
  // via GraphQL sessionMap (cf. computeLiveStats / computeReplayStats).
  for (const s of scans.stats.value.audience.scans || []) {
    if (!s.sessionId) continue;
    const e = ensure(s.sessionId, { title: s.sessionTitle, start: s.sessionStart });
    e.audienceCount += 1;
  }
  for (const it of live.stats.value.items || []) {
    if (!it.sessionId) continue;
    const e = ensure(it.sessionId, {
      title: it.sessionTitle,
      start: it.sessionStart,
      end: it.sessionEnd,
    });
    e.liveCount += 1;
  }
  for (const it of replay.stats.value.items || []) {
    if (!it.sessionId) continue;
    const e = ensure(it.sessionId, {
      title: it.sessionTitle,
      start: it.sessionStart,
      end: it.sessionEnd,
    });
    e.replayCount += 1;
  }

  // Tri par date de debut puis titre
  return [...map.values()].sort((a, b) => {
    const sa = a.start || "";
    const sb = b.start || "";
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.title || "").localeCompare(b.title || "");
  });
});

const filteredSessions = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return sessions.value;
  return sessions.value.filter(
    (s) =>
      (s.title || "").toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
  );
});

function exportSessionCsv(session) {
  const audienceScans = (scans.stats.value.audience.scans || []).filter(
    (s) => s.sessionId === session.id
  );
  const liveItems = (live.stats.value.items || []).filter(
    (it) => it.sessionId === session.id
  );
  const replayItems = (replay.stats.value.items || []).filter(
    (it) => it.sessionId === session.id
  );

  const rows = buildSessionAttendance({
    session,
    audienceScans,
    liveItems,
    replayItems,
    delegates: props.delegates,
  });

  if (rows.length === 0) {
    alert("Aucune personne n'a participé à cette session (audience, live ou replay).");
    return;
  }

  const safeTitle = (session.title || session.id)
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const safeEvent = (props.eventName || eventId)
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .slice(0, 40);
  const filename = `audiance_${safeEvent}-${safeTitle}`;
  downloadCsv(filename, ATTENDANCE_HEADERS, rows.map(attendanceRowToCsv));
}

async function exportAllSessionsCsv() {
  if (exportingAll.value) return;
  exportingAll.value = true;
  exportAllProgress.value = 0;
  try {
    for (const session of filteredSessions.value) {
      exportSessionCsv(session);
      exportAllProgress.value += 1;
      // Petite pause pour laisser le navigateur enchainer les downloads.
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    exportingAll.value = false;
    exportAllProgress.value = 0;
  }
}

function formatStart(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
.exports-tab { max-width: 1100px; }
.exports-header h2 {
  font-size: 20px; font-weight: 600; color: var(--primary);
  margin: 0 0 4px;
}
.exports-subtitle {
  font-size: 12px; color: var(--text-muted);
  margin: 0 0 16px; line-height: 1.5; max-width: 720px;
}

.exports-errors {
  padding: 8px 12px; background: #fff7ed; border: 1px solid #fed7aa;
  border-radius: 8px; color: #9a3412; font-size: 11px;
  margin-bottom: 12px;
}
.exports-errors p { margin: 0; }

/* Carte categorie */
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
  font-size: 14px; font-weight: 600; color: var(--text);
  margin: 0 0 3px;
}
.export-category-header p {
  font-size: 11px; color: var(--text-muted);
  margin: 0; line-height: 1.4; max-width: 640px;
}
.chevron {
  color: var(--text-muted); font-size: 16px; padding: 0 4px;
  transition: transform .15s;
}
.chevron.rotated { transform: rotate(0deg); }
.export-category:not(.open) .chevron { transform: rotate(-90deg); }

.export-category-body { padding: 14px 18px; }

.loading-row {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: var(--text-secondary);
  padding: 12px 0;
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

.info-row {
  display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
}
.info-chip {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 4px 10px; background: #eef6ff;
  border: 1px solid #bdd8f1; border-radius: 999px;
}
.info-chip-label {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .3px; font-weight: 600;
}
.info-chip-value {
  font-size: 12px; font-weight: 700; color: var(--primary);
}

.search-row {
  display: flex; gap: 8px; margin-bottom: 12px; align-items: center;
}
.search-input {
  flex: 1; padding: 7px 12px; font-size: 12px;
  border: 1px solid var(--border); border-radius: 6px;
  background: #fff; color: var(--text); font-family: inherit;
  transition: border-color .15s;
}
.search-input:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(30, 78, 102, .12);
}
.btn-primary {
  padding: 7px 14px; border: none; border-radius: 6px;
  background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background .15s; white-space: nowrap;
  display: inline-flex; align-items: center;
}
.btn-primary:hover { background: var(--primary-light); }
.btn-primary:disabled {
  opacity: .5; cursor: not-allowed; background: var(--primary);
}

.table-wrapper {
  border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; background: #fff;
}
.sessions-table { font-size: 11px; }
.sessions-table th.num,
.sessions-table td.num { text-align: right; }
.sessions-table th { padding: 8px 10px; }
.sessions-table td { padding: 8px 10px; vertical-align: middle; }
.th-hint {
  font-weight: 400; color: var(--text-muted);
  text-transform: none; letter-spacing: 0; font-size: 9px;
}
.session-title {
  font-weight: 600; color: var(--text); line-height: 1.3;
  max-width: 420px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.session-id {
  font-size: 9px; color: var(--text-muted); font-family: monospace;
  background: #f5f6f8; padding: 1px 5px; border-radius: 3px;
  display: inline-block; margin-top: 2px;
}
.session-start { white-space: nowrap; color: var(--text-secondary); }

.btn-export {
  padding: 5px 12px; border: 1px solid var(--primary);
  background: #fff; color: var(--primary); border-radius: 5px;
  font-size: 10px; font-weight: 600; cursor: pointer;
  white-space: nowrap; transition: all .12s;
}
.btn-export:hover { background: var(--primary); color: #fff; }

.empty-msg {
  text-align: center; padding: 32px;
  color: var(--text-muted); font-size: 12px;
  background: #fafbfc; border-radius: 8px;
}

.footnote {
  margin-top: 12px; padding: 10px 14px;
  background: #fafbfc; border-radius: 6px;
  font-size: 10px; color: var(--text-muted); line-height: 1.5;
}
.footnote strong { color: var(--text-secondary); }
</style>
