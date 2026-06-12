<template>
  <div class="chart-card">
    <div class="chart-header">
      <h3>{{ t("scans.detailTitle", { n: fmt(scans.length) }) }} <InfoTooltip :text="t('scans.detailHint')" /></h3>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <div class="period-selector">
          <button
            v-for="opt in kindFilterOptions"
            :key="opt.value"
            :class="['period-btn', { active: kindFilter === opt.value }]"
            @click="kindFilter = opt.value"
          >{{ opt.label }}</button>
        </div>
        <div class="detail-date-filter">
          <label>{{ t("scans.detailDate.from") }}
            <input v-model="detailFrom" type="date" :max="detailTo || undefined" />
          </label>
          <label>{{ t("scans.detailDate.to") }}
            <input v-model="detailTo" type="date" :min="detailFrom || undefined" />
          </label>
          <button
            v-if="hasDetailDateFilter"
            class="detail-date-clear"
            :title="t('scans.detailDate.clear')"
            @click="clearDetailDate"
          >✕</button>
        </div>
        <div class="detail-qr-filter">
          <input
            v-model="qrFilter"
            type="search"
            class="qr-filter-input"
            :placeholder="t('scans.qrFilter.placeholder')"
            :title="t('scans.qrFilter.title')"
          />
          <button
            v-if="hasQrFilter"
            class="detail-date-clear"
            :title="t('scans.qrFilter.clear')"
            @click="clearQrFilter"
          >✕</button>
        </div>
        <CsvButton
          filename="scans-detail"
          :headers="[t('scans.csv.type'), t('scans.csv.timestamp'), t('scans.csv.qrCode'), 'delegateId', 'badgeId', 'fullName', 'email', 'badgeType', 'sessionId', 'sessionTitle', 'sessionStart', 'roomName', 'industryName', t('scans.csv.zone'), t('scans.csv.direction')]"
          :rows="filteredScans.map(s => [s.kind, formatTimestamp(s.timestamp), s.rawQrCode || '', s.delegateId || '', s.badgeId || '', s.fullName, s.email, s.badgeType, s.sessionId || '', s.sessionTitle || '', formatTimestamp(s.sessionStart) || '', s.roomName || '', s.industryName || '', s.kind === 'zone' ? zoneName(s.zoneId) : '', s.direction])"
        />
      </div>
    </div>
    <p
      v-if="recovered.total > 0 || unmatched.total > 0"
      class="scans-recovery-note"
    >
      {{ t("scans.recoveryNote", { recovered: fmt(recovered.total), unmatched: fmt(unmatched.total) }) }}
      <InfoTooltip :text="t('scans.recoveryHint')" />
    </p>
    <div v-if="filteredScans.length > 0" class="scans-table-wrap">
      <table class="data-table scans-detail-table">
        <thead>
          <tr>
            <th></th>
            <th>{{ t("scans.csv.type") }}</th>
            <th>{{ t("scans.csv.timestamp") }}</th>
            <th>{{ t("scans.csv.qrCode") }}</th>
            <th>delegateId</th>
            <th>badgeId</th>
            <th>fullName</th>
            <th>email</th>
            <th>badgeType</th>
            <th>sessionId</th>
            <th>sessionTitle</th>
            <th>sessionStart</th>
            <th>roomName</th>
            <th>{{ t("scans.csv.zone") }}</th>
            <th>{{ t("scans.csv.direction") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in pagedScans" :key="s.kind + '-' + s.id">
            <td><button class="detail-btn" type="button" @click="openDetail(s)">{{ t("scans.detailRow.button") }}</button></td>
            <td><span class="kind-pill" :class="'kind-' + s.kind">{{ kindLabel(s.kind) }}</span></td>
            <td>{{ formatTimestamp(s.timestamp) }}</td>
            <td class="mono" :title="s.rawQrCode">{{ s.rawQrCode || '—' }}</td>
            <td :class="['mono', { 'cell-enriched': s.recovered }]" :title="s.recovered ? t('scans.recoveredTag') : null">{{ s.delegateId || '—' }}</td>
            <td :class="['mono', { 'cell-enriched': s.badgeIdEnriched }]" :title="s.badgeId">{{ s.badgeId || '—' }}</td>
            <td :class="{ 'cell-enriched': s.fullNameEnriched }" :title="s.fullName">{{ s.fullName }}</td>
            <td :class="{ 'cell-enriched': s.emailEnriched }" :title="s.email">{{ s.email || '—' }}</td>
            <td :class="{ 'cell-enriched': s.badgeTypeEnriched }">{{ s.badgeType }}</td>
            <td class="mono">{{ s.sessionId || '—' }}</td>
            <td :title="s.sessionTitle">{{ s.sessionTitle || '—' }}</td>
            <td>{{ formatTimestamp(s.sessionStart) || '—' }}</td>
            <td :title="s.roomName">{{ s.roomName || '—' }}</td>
            <td>{{ s.kind === 'zone' ? (zoneName(s.zoneId) || '—') : '—' }}</td>
            <td>{{ directionLabel(s.direction) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="filteredScans.length > pageSize" class="scans-hint">
        {{ t("scans.pageHint", { size: pageSize, total: fmt(filteredScans.length) }) }}
      </p>
    </div>
    <p v-else class="empty-msg">{{ t("scans.empty.noMatch") }}</p>

    <ScanDetailModal v-if="detailRow" :row="detailRow" @close="closeDetail" />
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { fmt } from "@/utils/formatters.js";
import { parisDateParts, toEpochMs } from "@/utils/parisTime.js";
import { qrKeys } from "@/utils/computeScanStats.js";
import CsvButton from "./CsvButton.vue";
import InfoTooltip from "./InfoTooltip.vue";
import ScanDetailModal from "./ScanDetailModal.vue";

const props = defineProps({
  // Tous les scans normalisés/enrichis (= scansApi.stats.value.all).
  scans: { type: Array, default: () => [] },
  // Délégués complets (pour résoudre délégué + badge dans le modal détail).
  delegates: { type: Array, default: () => [] },
  // Map<zone_id, nom> (cf. useRoomScans.zoneNames).
  zoneNames: { type: Object, default: null },
  // Compteurs de ré-association (stats.global.recoveredScans / unmatchedScans).
  recovered: { type: Object, default: () => ({ total: 0 }) },
  unmatched: { type: Object, default: () => ({ total: 0 }) },
});

const { t } = useI18n();

const pageSize = 200;

const kindFilter = ref("all");
const kindFilterOptions = computed(() => [
  { value: "all", label: t("scans.kind.all") },
  { value: "audience", label: t("scans.kind.room") },
  { value: "checkin", label: t("scans.kind.entrance") },
  { value: "zone", label: t("scans.kind.zone") },
]);

// Filtre de date LOCAL au tableau (independant du filtre date global) : bornes
// YMD inclusives, vides = non bornees. Filtre aussi le CSV (meme source).
const detailFrom = ref("");
const detailTo = ref("");
const hasDetailDateFilter = computed(() => !!detailFrom.value || !!detailTo.value);
function clearDetailDate() {
  detailFrom.value = "";
  detailTo.value = "";
}

// Filtre par QR code : recherche insensible casse dans le raw_qr_code (contains).
const qrFilter = ref("");
const hasQrFilter = computed(() => !!qrFilter.value.trim());
function clearQrFilter() {
  qrFilter.value = "";
}

// Lookup delegue par id (pour le modal "Details").
const delegateById = computed(() => {
  const m = new Map();
  for (const d of props.delegates || []) if (d?.id) m.set(d.id, d);
  return m;
});

// Modal "Details" : null = ferme, sinon { scan, delegate, badge }.
const detailRow = ref(null);
function openDetail(scan) {
  const delegate = scan.delegateId ? delegateById.value.get(scan.delegateId) || null : null;
  // Badge : par badge_id ES si dispo, sinon 1er badge dont le QR matche le
  // raw_qr_code (mêmes clés que la ré-association), sinon 1er badge.
  let badge = null;
  if (delegate?.badges?.length) {
    const scanKeys = new Set(qrKeys(scan.rawQrCode));
    badge =
      (scan.badgeId && delegate.badges.find((b) => b.id === scan.badgeId)) ||
      delegate.badges.find((b) =>
        [b.qrCode?.value, b.qrCode?.decodedValue].some((q) => qrKeys(q).some((k) => scanKeys.has(k))),
      ) ||
      delegate.badges[0];
  }
  detailRow.value = { scan, delegate, badge };
}
function closeDetail() {
  detailRow.value = null;
}

function scanDay(ts) {
  return parisDateParts(toEpochMs(ts))?.ymd ?? null;
}

const filteredScans = computed(() => {
  let result = [...props.scans].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  if (kindFilter.value !== "all") result = result.filter((s) => s.kind === kindFilter.value);
  const from = detailFrom.value;
  const to = detailTo.value;
  if (from || to) {
    result = result.filter((s) => {
      const day = scanDay(s.timestamp);
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }
  const qr = qrFilter.value.trim().toLowerCase();
  if (qr) result = result.filter((s) => (s.rawQrCode || "").toLowerCase().includes(qr));
  return result;
});
const pagedScans = computed(() => filteredScans.value.slice(0, pageSize));

function kindLabel(k) {
  if (k === "audience") return t("scans.kind.room");
  if (k === "checkin") return t("scans.kind.entrance");
  if (k === "zone") return t("scans.kind.zone");
  return k;
}
function directionLabel(d) {
  if (d === "in") return t("scans.direction.in");
  if (d === "out") return t("scans.direction.out");
  return "—";
}
function formatTimestamp(ts) {
  if (!ts) return "—";
  const p = parisDateParts(toEpochMs(ts));
  if (!p) return String(ts);
  return `${p.ymd} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
// Nom de zone (zone_id = location.id) via le map résolu, fallback id brut.
function zoneName(id) {
  if (!id) return "";
  return props.zoneNames?.get?.(id) || id;
}
</script>

<style scoped>
.scans-recovery-note {
  font-size: 13px; color: var(--text-muted); margin: 0 0 10px;
  display: flex; align-items: center; gap: 6px;
}
/* Cellules enrichies par l'app (jointure délégué/badge), pas issues de l'index ES. */
.cell-enriched {
  background: rgba(48, 221, 146, 0.14);
  box-shadow: inset 2px 0 0 var(--accent, #30dd92);
}
.detail-btn {
  border: 1px solid var(--border, #d1d5db); background: #fff; border-radius: 4px;
  padding: 1px 8px; font-size: 11px; color: var(--primary, #1e4e66);
  cursor: pointer; white-space: nowrap; font-family: inherit;
}
.detail-btn:hover { background: var(--primary, #1e4e66); color: #fff; border-color: var(--primary, #1e4e66); }

.scans-table-wrap { max-height: 600px; overflow: auto; }
.scans-table-wrap .data-table th { position: sticky; top: 0; z-index: 2; }
.scans-detail-table { min-width: 1400px; }
.scans-detail-table td {
  white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis;
}
.scans-detail-table .mono {
  font-family: "Fira Code", Consolas, monospace; font-size: 12px; color: var(--text-secondary);
}

.kind-pill {
  display: inline-block; padding: 1px 7px;
  font-size: 12px; font-weight: 600; border-radius: 8px; color: #fff;
}
.kind-pill.kind-audience { background: #1e4e66; }
.kind-pill.kind-checkin { background: #30dd92; color: #0a3a23; }
.kind-pill.kind-zone { background: #6f45ff; }

.period-selector { display: flex; gap: 3px; }
.period-btn {
  padding: 3px 10px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 4px; font-size: 12px; cursor: pointer; color: #646464; font-weight: 500;
}
.period-btn.active { background: #1e4e66; color: #fff; border-color: #1e4e66; }

.detail-date-filter { display: flex; gap: 6px; align-items: center; }
.detail-date-filter label {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #646464; font-weight: 500;
}
.detail-date-filter input[type="date"] {
  border: 1px solid #d1d5db; border-radius: 4px; padding: 2px 6px;
  font-size: 12px; color: #414141; font-family: inherit;
}
.detail-date-clear {
  border: 1px solid #d1d5db; background: #fff; border-radius: 4px;
  width: 22px; height: 22px; cursor: pointer; color: #646464; font-size: 12px;
  display: inline-flex; align-items: center; justify-content: center;
}
.detail-date-clear:hover { background: #f3f4f6; color: #1e4e66; }
.detail-qr-filter { display: flex; gap: 6px; align-items: center; }
.qr-filter-input {
  border: 1px solid #d1d5db; border-radius: 4px; padding: 3px 8px;
  font-size: 12px; color: #414141; font-family: inherit; min-width: 180px;
}
.qr-filter-input:focus { outline: none; border-color: var(--primary, #1e4e66); }

/* Partagé avec ScansTab (note de pagination + hint connexion ES). */
.scans-hint { font-size: 13px; color: var(--text-muted); margin-top: 8px; font-style: italic; }
</style>
