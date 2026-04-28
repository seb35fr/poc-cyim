<template>
  <div class="data-tab">
    <!-- Toolbar -->
    <div class="data-toolbar">
      <div class="search-wrapper">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Rechercher..."
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">&#215;</button>
      </div>
      <div class="toolbar-meta">
        <span class="result-count">
          {{ filteredDelegates.length }}<span class="result-sep">/</span>{{ delegates.length }}
        </span>
        <button class="btn-csv" @click="exportDetailedCsv" :disabled="!delegates.length">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M8 10L5 7M8 10l3-3M2 12v2h12v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          CSV
        </button>
      </div>
    </div>

    <!-- Filtres -->
    <div class="filter-bar" v-if="allRegTypes.length > 0 || allAddonContents.length > 0">
      <div class="filter-group" v-if="allRegTypes.length > 0">
        <label class="filter-label">Type d'inscription</label>
        <select v-model="filterRegType" class="filter-select">
          <option value="">Tous</option>
          <option v-for="t in allRegTypes" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div class="filter-group" v-if="allAddonContents.length > 0">
        <label class="filter-label">Option / Addon</label>
        <select v-model="filterAddonContent" class="filter-select">
          <option value="">Tous</option>
          <option v-for="c in allAddonContents" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <button
        v-if="filterRegType || filterAddonContent"
        class="filter-clear-btn"
        @click="filterRegType = ''; filterAddonContent = '';"
      >Effacer les filtres</button>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table class="dtable">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key"
              :class="['dtable-th', { sorted: sortKey === col.key }]"
              @click="toggleSort(col.key)"
            >
              <span class="th-label">{{ col.label }}</span>
              <span class="th-arrow" v-if="sortKey === col.key">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              <span class="th-arrow th-arrow-idle" v-else>⇅</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, i) in paginatedDelegates" :key="d.id" :class="{ 'row-alt': i % 2 === 1 }">
            <td class="cell-name">{{ d.familyName || '—' }}</td>
            <td class="cell-name">{{ d.givenName || '—' }}</td>
            <td>{{ getCountryName(d) }}</td>
            <td class="cell-email">{{ d.email || '—' }}</td>
            <td><span class="status-pill" :class="statusClass(d.status)">{{ d.status || '—' }}</span></td>
            <td class="cell-date">{{ formatDate(d.createdAt) }}</td>
            <td class="cell-mono">{{ getRpps(d) || '—' }}</td>
            <td>{{ getMembershipTypes(d) || '—' }}</td>
            <td class="cell-mono">{{ d.externalContactId || '—' }}</td>
            <td class="cell-mono">{{ d.externalId || '—' }}</td>
            <td>{{ getRegTypes(d) || '—' }}</td>
            <td class="cell-center">{{ d.badges?.length || 0 }}</td>
            <td class="cell-center">
              <template v-if="d.badges?.length">
                <a
                  v-for="b in d.badges.filter(b => b.storage?.publicUrl)"
                  :key="b.id"
                  :href="b.storage.publicUrl"
                  target="_blank"
                  class="badge-pdf-link"
                  :title="b.type"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/><polyline points="9 1 9 5 13 5"/></svg>
                  {{ b.type }}
                </a>
              </template>
              <span v-else>—</span>
            </td>
          </tr>
          <tr v-if="filteredDelegates.length === 0">
            <td :colspan="columns.length" class="cell-empty">Aucun resultat</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pager" v-if="totalPages > 0">
      <div class="pager-left">
        <span class="pager-label">Lignes</span>
        <select v-model.number="pageSize" class="pager-select">
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="250">250</option>
          <option :value="500">500</option>
        </select>
      </div>
      <div class="pager-center" v-if="totalPages > 1">
        <button class="pager-btn" :disabled="currentPage <= 1" @click="currentPage = 1">&#171;</button>
        <button class="pager-btn" :disabled="currentPage <= 1" @click="currentPage--">&#8249;</button>
        <span class="pager-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="pager-btn" :disabled="currentPage >= totalPages" @click="currentPage++">&#8250;</button>
        <button class="pager-btn" :disabled="currentPage >= totalPages" @click="currentPage = totalPages">&#187;</button>
      </div>
      <div class="pager-right">
        <span class="pager-range">
          {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredDelegates.length) }}
          sur {{ filteredDelegates.length }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { COUNTRY_NAMES } from "../../utils/countries.js";
import { downloadCsv } from "../../utils/exportCsv.js";

const props = defineProps({
  stats: Object,
  delegates: Array,
  mobileAppId: String,
  eventName: String,
});

const searchQuery = ref("");
const sortKey = ref("familyName");
const sortDir = ref("asc");
const currentPage = ref(1);
const pageSize = ref(100);
const filterRegType = ref("");
const filterAddonContent = ref("");

const columns = [
  { key: "familyName", label: "Nom" },
  { key: "givenName", label: "Prenom" },
  { key: "country", label: "Pays" },
  { key: "email", label: "Email" },
  { key: "status", label: "Statut" },
  { key: "createdAt", label: "Date creation" },
  { key: "rpps", label: "RPPS" },
  { key: "membershipType", label: "Adhesion" },
  { key: "externalContactId", label: "Contact ext." },
  { key: "externalId", label: "Participant ext." },
  { key: "regTypes", label: "Types inscr." },
  { key: "badgesCount", label: "Badges" },
  { key: "badgePdf", label: "Badge PDF" },
];

function getCountryCode(d) {
  return d.primaryAddress?.country?.code || d.primaryAddress?.countryCode || "";
}

function getCountryName(d) {
  const code = getCountryCode(d);
  return COUNTRY_NAMES[code] || code || "—";
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "registered") return "st-registered";
  if (s === "pending") return "st-pending";
  if (s === "cancelled") return "st-cancelled";
  if (s === "refused") return "st-refused";
  return "";
}

function getMembershipTypes(d) {
  const items = d.contact?.memberships?.items || [];
  return items.map((m) => m.type).filter(Boolean).join(", ");
}

function getRegTypes(d) {
  return (d.registrations || []).map((r) => r.type).filter(Boolean).join(", ");
}

function formatOptions(d) {
  const opts = d.options;
  if (!opts || typeof opts !== "object") return "";
  return Object.entries(opts)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.join(", ")}`;
      if (v === true) return k;
      if (v === false || v == null) return null;
      return `${k}: ${v}`;
    })
    .filter(Boolean)
    .join(" | ");
}

// --- Listes uniques pour filtres ---
const allRegTypes = computed(() => {
  const set = new Set();
  for (const d of props.delegates || []) {
    for (const r of d.registrations || []) {
      if (r.type) set.add(r.type);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});

const allAddonContents = computed(() => {
  const set = new Set();
  for (const d of props.delegates || []) {
    const addons = d.options?.addons;
    if (Array.isArray(addons)) {
      for (const a of addons) {
        if (Array.isArray(a.content)) {
          a.content.forEach((c) => { if (c) set.add(c); });
        }
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
});

function getSortValue(d, key) {
  if (key === "country") return getCountryName(d).toLowerCase();
  if (key === "badgesCount") return d.badges?.length || 0;
  if (key === "badgePdf") return d.badges?.filter((b) => b.storage?.publicUrl).length || 0;
  if (key === "createdAt") return d.createdAt || "";
  if (key === "rpps") return getRpps(d).toLowerCase();
  if (key === "membershipType") return getMembershipTypes(d).toLowerCase();
  if (key === "regTypes") return getRegTypes(d).toLowerCase();
  if (key === "options") return formatOptions(d).toLowerCase();
  const val = d[key];
  return typeof val === "string" ? val.toLowerCase() : val || "";
}

const filteredDelegates = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const regTypeFilter = filterRegType.value;
  const addonContentFilter = filterAddonContent.value;
  let list = props.delegates || [];

  // Filtre par type d'inscription
  if (regTypeFilter) {
    list = list.filter((d) =>
      (d.registrations || []).some((r) => r.type === regTypeFilter)
    );
  }

  // Filtre par addon content
  if (addonContentFilter) {
    list = list.filter((d) => {
      const addons = d.options?.addons;
      if (!Array.isArray(addons)) return false;
      return addons.some((a) =>
        Array.isArray(a.content) && a.content.includes(addonContentFilter)
      );
    });
  }

  // Recherche texte
  if (q) {
    list = list.filter((d) => {
      const hay = [
        d.familyName, d.givenName, d.email, d.status,
        getCountryName(d), getRpps(d), getMembershipTypes(d),
        d.externalContactId, d.externalId, getRegTypes(d), formatOptions(d),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  const key = sortKey.value;
  const dir = sortDir.value === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = getSortValue(a, key);
    const vb = getSortValue(b, key);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "fr") * dir;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredDelegates.value.length / pageSize.value)));

const paginatedDelegates = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredDelegates.value.slice(start, start + pageSize.value);
});

watch([searchQuery, sortKey, sortDir, pageSize, filterRegType, filterAddonContent], () => { currentPage.value = 1; });

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "asc";
  }
}

function exportDetailedCsv() {
  const headers = [
    "id", "externalContactId", "email", "RPPS",
    "familyName", "givenName", "city",
    "country", "countryCode",
    "checkedInDate", "status",
    "registrationTypes",
    "badgeType", "badgeQrCode", "badgeDecodedQr",
    "externalId",
    "badgesCount",
    "notes",
  ];

  const rows = [];
  const allDelegates = props.delegates || [];

  for (const d of allDelegates) {
    const rpps = getRpps(d);
    const city = d.primaryAddress?.city || "";
    const countryCode = getCountryCode(d);
    const countryName = getCountryName(d);
    const checkIn = d.checkedInDate || "";
    const regTypes = getRegTypes(d);
    const notes = Array.isArray(d.notes) ? d.notes.filter(Boolean).join(" | ") : "";

    const badges = d.badges || [];
    if (badges.length === 0) {
      rows.push([
        d.id, d.externalContactId || "", d.email || "", rpps,
        d.familyName || "", d.givenName || "",
        city, countryName, countryCode,
        checkIn, d.status || "",
        regTypes,
        "", "", "",
        d.externalId || "",
        badges.length,
        notes,
      ]);
    } else {
      for (const badge of badges) {
        rows.push([
          d.id, d.externalContactId || "", d.email || "", rpps,
          d.familyName || "", d.givenName || "",
          city, countryName, countryCode,
          checkIn, d.status || "",
          regTypes,
          badge.type || "", badge.qrCode?.value || "", badge.qrCode?.decodedValue || "",
          d.externalId || "",
          badges.length,
          notes,
        ]);
      }
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "h");
  const name = (props.eventName || "event").replace(/[^a-zA-Z0-9-_]/g, "_");
  downloadCsv(`delegates-${name}-${dateStr}-${timeStr}`, headers, rows);
}

function getRpps(d) {
  const externalIds = d.contact?.externalIds || [];
  const rpps = externalIds.find((e) => e.type?.toUpperCase() === "RPPS" || e.type?.includes("rpps"));
  return rpps?.value || "";
}
</script>

<style scoped>
.data-tab { display: flex; flex-direction: column; gap: 0; }

/* ── Toolbar ── */
.data-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
}
.search-wrapper {
  position: relative; flex: 1; min-width: 200px; max-width: 360px;
}
.search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); pointer-events: none;
}
.search-input {
  width: 100%; padding: 7px 30px 7px 30px;
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 12px; background: var(--card); outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(30, 78, 102, 0.08);
}
.search-clear {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  background: none; border: none; font-size: 16px; color: var(--text-muted);
  cursor: pointer; padding: 2px 4px; line-height: 1;
}
.search-clear:hover { color: var(--text); }

.toolbar-meta { display: flex; align-items: center; gap: 10px; }
.result-count {
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.result-sep { color: var(--text-muted); margin: 0 1px; }
.btn-csv {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 12px; background: var(--primary); color: #fff;
  border: none; border-radius: 6px; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: background .15s, transform .1s;
}
.btn-csv:hover { background: var(--primary-light); transform: translateY(-1px); }
.btn-csv:active { transform: translateY(0); }
.btn-csv:disabled { opacity: .4; cursor: not-allowed; transform: none; }

/* ── Table container ── */
.table-container {
  overflow-x: auto; border-radius: 10px;
  background: var(--card); box-shadow: var(--shadow);
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

/* ── Data table ── */
.dtable {
  width: 100%; border-collapse: collapse;
  font-size: 12px; line-height: 1.4;
}

/* Sticky header */
.dtable thead { position: sticky; top: 0; z-index: 5; }
.dtable-th {
  padding: 8px 10px; text-align: left;
  background: #f1f3f6; color: var(--text-secondary);
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .4px; white-space: nowrap;
  cursor: pointer; user-select: none;
  border-bottom: 2px solid var(--border);
  transition: background .1s, color .1s;
}
.dtable-th:hover { background: #e6e9ee; color: var(--text); }
.dtable-th.sorted { color: var(--primary); background: #e8eef3; }
.th-label { margin-right: 3px; }
.th-arrow { font-size: 8px; vertical-align: middle; }
.th-arrow-idle { opacity: .25; }

/* Rows */
.dtable td {
  padding: 5px 10px;
  border-bottom: 1px solid #f0f1f3;
  max-width: 180px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
  color: var(--text);
}
.row-alt td { background: #fafbfc; }
.dtable tbody tr:hover td { background: #edf2f7; }

/* Cell variants */
.cell-name { font-weight: 500; }
.cell-email { color: var(--text-secondary); font-size: 11px; }
.cell-date { font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 11px; color: var(--text-secondary); }
.cell-mono { font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 10.5px; color: var(--text-secondary); letter-spacing: -.2px; }
.cell-center { text-align: center; font-weight: 600; }
.cell-empty { text-align: center; color: var(--text-muted); padding: 40px 10px !important; font-style: italic; }

/* Badge PDF links */
.badge-pdf-link {
  display: inline-flex; align-items: center; gap: 3px;
  color: var(--primary); text-decoration: none;
  font-size: 10.5px; font-weight: 500;
  padding: 1px 5px; border-radius: 4px;
  transition: background .15s, color .15s;
  white-space: nowrap;
}
.badge-pdf-link:hover { background: rgba(30, 78, 102, 0.08); text-decoration: underline; }
.badge-pdf-link + .badge-pdf-link { margin-left: 4px; }

/* Status pills */
.status-pill {
  display: inline-block; padding: 1px 7px; border-radius: 8px;
  font-size: 10px; font-weight: 600; text-transform: capitalize;
  letter-spacing: .2px;
}
.st-registered { background: #d1fae5; color: #065f46; }
.st-pending { background: #fef3c7; color: #92400e; }
.st-cancelled { background: #fee2e2; color: #991b1b; }
.st-refused { background: #fce7f3; color: #9d174d; }

/* ── Pagination ── */
.pager {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; margin-top: 4px; font-size: 11px; color: var(--text-secondary);
}
.pager-left, .pager-right { display: flex; align-items: center; gap: 6px; }
.pager-center { display: flex; align-items: center; gap: 4px; }
.pager-label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); letter-spacing: .3px; }
.pager-select {
  padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px;
  font-size: 11px; background: var(--card); cursor: pointer;
}
.pager-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--card); cursor: pointer; font-size: 13px; line-height: 1;
  transition: background .1s;
}
.pager-btn:hover:not(:disabled) { background: #f3f4f6; }
.pager-btn:disabled { opacity: .3; cursor: default; }
.pager-info { font-weight: 600; min-width: 50px; text-align: center; }
.pager-range { font-variant-numeric: tabular-nums; color: var(--text-muted); }

/* ── Filter bar ── */
.filter-bar {
  display: flex; align-items: flex-end; gap: 12px;
  margin-bottom: 12px; flex-wrap: wrap;
  padding: 10px 14px;
  background: #f8f9fb; border-radius: 8px;
  border: 1px solid var(--border);
}
.filter-group { display: flex; flex-direction: column; gap: 3px; }
.filter-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .3px; color: var(--text-muted);
}
.filter-select {
  padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px;
  font-size: 12px; background: var(--card); cursor: pointer;
  min-width: 140px; max-width: 260px;
}
.filter-select:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 2px rgba(30, 78, 102, 0.08); }
.filter-clear-btn {
  padding: 5px 10px; border: 1px solid #e5e7eb; border-radius: 6px;
  background: #fff; font-size: 11px; color: var(--text-secondary);
  cursor: pointer; transition: all .15s;
}
.filter-clear-btn:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
</style>
