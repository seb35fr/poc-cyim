<template>
  <div class="exports-tab">
    <header class="exports-header">
      <h2>{{ t("exports.title") }}</h2>
      <p class="exports-subtitle">
        {{ t("exports.subtitle") }}
      </p>
    </header>

    <div v-if="errors.length > 0" class="exports-errors">
      <p v-for="err in errors" :key="err">⚠ {{ err }}</p>
    </div>

    <!-- ═══ Catégorie : Présence par session ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'session-attendance' }">
      <header class="export-category-header" @click="toggleCategory('session-attendance')">
        <div>
          <h3>{{ t("exports.session.title") }}</h3>
          <p>{{ t("exports.session.desc") }}</p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'session-attendance' }">▾</span>
      </header>

      <div v-if="openCategory === 'session-attendance'" class="export-category-body">
        <div v-if="loading" class="loading-row">
          <div class="spinner-small-dark"></div>
          <span>{{ t("exports.loadingSources") }}</span>
        </div>
        <template v-else>
          <div class="info-row">
            <div class="info-chip">
              <span class="info-chip-label">{{ t("exports.session.detected") }}</span>
              <span class="info-chip-value">{{ sessions.length }}</span>
            </div>
            <div class="info-chip">
              <span class="info-chip-label">{{ t("exports.session.delegatesLoaded") }}</span>
              <span class="info-chip-value">{{ (delegates || []).length }}</span>
            </div>
          </div>

          <div class="search-row">
            <input
              v-model="search"
              type="text"
              :placeholder="t('exports.session.searchPlaceholder')"
              class="search-input"
            />
            <select v-if="sessionTypes.length > 0" v-model="selectedSessionType" class="type-select">
              <option value="">{{ t("exports.presence.allTypes") }}</option>
              <option v-for="ty in sessionTypes" :key="ty" :value="ty">{{ ty }}</option>
            </select>
            <button
              class="btn-primary"
              :disabled="filteredSessions.length === 0 || exportingAll"
              @click="exportAllSessionsCsv"
            >
              <span v-if="exportingAll" class="spinner-small-light"></span>
              {{ exportingAll
                ? t("exports.session.exportAllProgress", { done: exportAllProgress, total: filteredSessions.length })
                : t("exports.session.exportAll", { n: filteredSessions.length }) }}
            </button>
          </div>

          <div v-if="filteredSessions.length === 0" class="empty-msg">
            {{ t("exports.session.noMatch") }}
          </div>
          <div v-else class="table-wrapper">
            <table class="data-table sessions-table">
              <thead>
                <tr>
                  <th>{{ t("exports.session.colSession") }}</th>
                  <th>{{ t("exports.session.colStart") }}</th>
                  <th class="num" :title="t('exports.session.thPhysical')">
                    {{ t("exports.session.colPhysical") }} <span class="th-hint">{{ t("exports.session.hintScans") }}</span>
                  </th>
                  <th class="num" :title="t('exports.session.thLive')">
                    {{ t("exports.session.colLive") }} <span class="th-hint">{{ t("exports.session.hintViews") }}</span>
                  </th>
                  <th class="num" :title="t('exports.session.thReplay')">
                    {{ t("exports.session.colReplay") }} <span class="th-hint">{{ t("exports.session.hintViews") }}</span>
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
                      {{ t("exports.session.exportCsv") }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="footnote" v-html="t('exports.session.footnote')"></p>
        </template>
      </div>
    </section>

    <!-- ═══ Catégorie : Présence par session en présentiel ═══ -->
    <SessionPresenceExport
      :open="openCategory === 'physical-attendance'"
      :loading="loading"
      :title="t('exports.physical.title')"
      :desc="t('exports.physical.desc')"
      :sessions="physicalSessions"
      :count-label="t('exports.physical.colCount')"
      :count-hint="t('exports.presence.hintScans')"
      :export-fn="exportPhysicalCsv"
      @toggle="toggleCategory('physical-attendance')"
    />

    <!-- ═══ Catégorie : Présence par session en Live ═══ -->
    <SessionPresenceExport
      :open="openCategory === 'live-attendance'"
      :loading="loading"
      :title="t('exports.live.title')"
      :desc="t('exports.live.desc')"
      :sessions="liveSessions"
      :count-label="t('exports.live.colCount')"
      :count-hint="t('exports.presence.hintViews')"
      :export-fn="exportLiveCsv"
      @toggle="toggleCategory('live-attendance')"
    />

    <!-- ═══ Catégorie : Présence par session en Replay ═══ -->
    <SessionPresenceExport
      :open="openCategory === 'replay-attendance'"
      :loading="loading"
      :title="t('exports.replay.title')"
      :desc="t('exports.replay.desc')"
      :sessions="replaySessions"
      :count-label="t('exports.replay.colCount')"
      :count-hint="t('exports.presence.hintViews')"
      :export-fn="exportReplayCsv"
      @toggle="toggleCategory('replay-attendance')"
    />

    <!-- ═══ Catégorie : Export industrie (1 XLSX par organisation) ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'industry' }">
      <header class="export-category-header" @click="toggleCategory('industry')">
        <div>
          <h3>{{ t("exports.industry.title") }}</h3>
          <p>{{ t("exports.industry.desc") }}</p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'industry' }">▾</span>
      </header>

      <div v-if="openCategory === 'industry'" class="export-category-body">
        <div v-if="loading" class="loading-row">
          <div class="spinner-small-dark"></div>
          <span>{{ t("exports.loadingSources") }}</span>
        </div>
        <template v-else>
          <div class="info-row">
            <div class="info-chip">
              <span class="info-chip-label">{{ t("exports.industry.detected") }}</span>
              <span class="info-chip-value">{{ industries.length }}</span>
            </div>
          </div>

          <div v-if="industries.length === 0" class="empty-msg">{{ t("exports.industry.empty") }}</div>
          <template v-else>
            <div class="search-row">
              <input
                v-model="industrySearch"
                type="text"
                :placeholder="t('exports.industry.searchPlaceholder')"
                class="search-input"
              />
              <button
                class="btn-primary"
                :disabled="filteredIndustries.length === 0 || exportingIndustries"
                @click="exportAllIndustries"
              >
                <span v-if="exportingIndustries" class="spinner-small-light"></span>
                {{ exportingIndustries
                  ? t("exports.industry.exportAllProgress", { done: industryProgress, total: filteredIndustries.length })
                  : t("exports.industry.exportAll", { n: filteredIndustries.length }) }}
              </button>
            </div>

            <div v-if="filteredIndustries.length === 0" class="empty-msg">
              {{ t("exports.industry.noMatch") }}
            </div>
            <div v-else class="table-wrapper">
              <table class="data-table sessions-table">
                <thead>
                  <tr>
                    <th>{{ t("exports.industry.colOrganizer") }}</th>
                    <th class="num">{{ t("exports.industry.colSessions") }}</th>
                    <th class="num">{{ t("exports.industry.colLive") }}</th>
                    <th class="num">{{ t("exports.industry.colReplay") }}</th>
                    <th class="num">{{ t("exports.industry.colOnsite") }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in filteredIndustries" :key="e.organizer">
                    <td><div class="session-title">{{ e.organizer }}</div></td>
                    <td class="num">{{ fmt(e.sessions) }}</td>
                    <td class="num">{{ fmt(e.live) }}</td>
                    <td class="num">{{ fmt(e.replay) }}</td>
                    <td class="num">{{ fmt(e.onsite) }}</td>
                    <td>
                      <button class="btn-export" @click="exportIndustryXlsx(e.organizer)">
                        {{ t("exports.industry.exportXlsx") }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <p class="footnote" v-html="t('exports.industry.footnote')"></p>
        </template>
      </div>
    </section>

    <!-- ═══ Catégorie : Parcours par personne ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'delegate-journey' }">
      <header class="export-category-header" @click="toggleCategory('delegate-journey')">
        <div>
          <h3>{{ t("exports.journey.title") }}</h3>
          <p>{{ t("exports.journey.desc") }}</p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'delegate-journey' }">▾</span>
      </header>

      <div v-if="openCategory === 'delegate-journey'" class="export-category-body">
        <div v-if="loading" class="loading-row">
          <div class="spinner-small-dark"></div>
          <span>{{ t("exports.loadingSources") }}</span>
        </div>
        <template v-else>
          <form class="journey-form" @submit.prevent="lookupJourney">
            <input
              v-model="journeyEmail"
              type="email"
              :placeholder="t('exports.journey.emailPlaceholder')"
              class="search-input"
              autocomplete="off"
            />
            <button class="btn-primary" type="submit" :disabled="!journeyEmail.trim()">
              {{ t("exports.journey.search") }}
            </button>
            <button
              v-if="journeyResult"
              type="button"
              class="btn-secondary"
              @click="resetJourney"
            >
              {{ t("exports.journey.clear") }}
            </button>
          </form>

          <div v-if="journeyResult" class="journey-result">
            <div v-if="!journeyResult.delegate && !journeyResult.esFallback" class="journey-empty">
              {{ t("exports.journey.notFound") }}
            </div>

            <template v-else>
              <div class="journey-card">
                <div class="journey-card-head">
                  <div>
                    <div class="journey-name">
                      {{ journeyDisplayName }}
                      <span v-if="!journeyResult.delegate" class="journey-pill warn">
                        {{ t("exports.journey.notMatched") }}
                      </span>
                    </div>
                    <div class="journey-sub">
                      {{ journeyResult.delegate?.email || journeyResult.esFallback?.email || journeyEmail }}
                    </div>
                  </div>
                  <button
                    class="btn-export big"
                    :disabled="journeyResult.rows.length === 0"
                    @click="exportJourneyCsv"
                  >
                    {{ t("exports.journey.exportCsv") }}
                  </button>
                </div>

                <div class="journey-meta">
                  <span v-if="journeyResult.delegate" class="meta-chip">
                    <span class="meta-label">{{ t("exports.journey.congressCheckin") }}</span>
                    <span class="checkin-badge" :class="journeyCheckin ? 'yes' : 'no'">
                      {{ journeyCheckin ? t("exports.journey.yes") : t("exports.journey.no") }}
                    </span>
                  </span>
                  <span v-if="journeyResult.delegate?.id" class="meta-chip">
                    <span class="meta-label">{{ t("exports.journey.delegateId") }}</span>
                    <code>{{ journeyResult.delegate.id }}</code>
                  </span>
                  <span v-if="journeyResult.keycloakId" class="meta-chip">
                    <span class="meta-label">{{ t("exports.journey.keycloakId") }}</span>
                    <code>{{ journeyResult.keycloakId }}</code>
                  </span>
                  <span v-if="journeyResult.delegate" class="meta-chip">
                    <span class="meta-label">{{ t("exports.journey.badgeType") }}</span>
                    <span>{{ journeyBadgeType || "—" }}</span>
                  </span>
                </div>

                <div class="journey-counts">
                  <div class="count-box">
                    <span class="count-label">{{ t("exports.journey.sessionsInteracted") }}</span>
                    <span class="count-value">{{ fmt(journeyResult.counts.sessions) }}</span>
                  </div>
                  <div class="count-box">
                    <span class="count-label">{{ t("exports.journey.physicalRoom") }}</span>
                    <span class="count-value">{{ fmt(journeyResult.counts.physiqueSalle) }}</span>
                  </div>
                  <div class="count-box">
                    <span class="count-label">{{ t("exports.journey.physicalZone") }}</span>
                    <span class="count-value">{{ fmt(journeyResult.counts.zones) }}</span>
                  </div>
                  <div class="count-box">
                    <span class="count-label">{{ t("exports.journey.live") }}</span>
                    <span class="count-value">{{ fmt(journeyResult.counts.live) }}</span>
                  </div>
                  <div class="count-box">
                    <span class="count-label">{{ t("exports.journey.replay") }}</span>
                    <span class="count-value">{{ fmt(journeyResult.counts.replay) }}</span>
                  </div>
                </div>

                <div v-if="journeyResult.rows.length === 0" class="journey-empty soft">
                  {{ t("exports.journey.noInteraction") }}
                </div>

                <div v-else class="table-wrapper">
                  <table class="data-table sessions-table">
                    <thead>
                      <tr>
                        <th>{{ t("exports.journey.colSession") }}</th>
                        <th>{{ t("exports.journey.colStart") }}</th>
                        <th class="num">{{ t("exports.journey.colPhysical") }}</th>
                        <th class="num">{{ t("exports.journey.colLive") }}</th>
                        <th class="num">{{ t("exports.journey.colReplay") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in journeyResult.rows" :key="r.sessionId">
                        <td>
                          <div class="session-title">
                            <span v-if="r.kind === 'zone'" class="zone-tag">{{ t("exports.journey.zoneTag") }}</span>
                            {{ r.sessionTitle || r.sessionId }}
                          </div>
                          <code class="session-id">{{ r.kind === 'zone' ? r.sessionId.replace(/^zone:/, '') : r.sessionId }}</code>
                        </td>
                        <td class="session-start">{{ r.sessionStart || "—" }}</td>
                        <td class="num">
                          <span v-if="r.physiquePresent === 'O'">
                            {{ t("exports.journey.scanCount", r.nbScansPhysiques, { n: r.nbScansPhysiques }) }}
                          </span>
                          <span v-else class="muted">—</span>
                        </td>
                        <td class="num">
                          <span v-if="r.live === 'O'">{{ r.nbVuesLive }}</span>
                          <span v-else class="muted">—</span>
                        </td>
                        <td class="num">
                          <span v-if="r.replay === 'O'">{{ r.nbVuesReplay }}</span>
                          <span v-else class="muted">—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <p class="footnote" v-html="t('exports.journey.footnote')"></p>
        </template>
      </div>
    </section>

    <!-- ═══ Catégorie : Délégués check-in (présents physiques) ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'checked-in' }">
      <header class="export-category-header" @click="toggleCategory('checked-in')">
        <div>
          <h3>{{ t("exports.checkedIn.title") }}</h3>
          <p>{{ t("exports.checkedIn.desc") }}</p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'checked-in' }">▾</span>
      </header>

      <div v-if="openCategory === 'checked-in'" class="export-category-body">
        <div class="info-row">
          <div class="info-chip">
            <span class="info-chip-label">{{ t("exports.checkedIn.count") }}</span>
            <span class="info-chip-value">{{ fmt(checkedInRows.length) }}</span>
          </div>
        </div>

        <div v-if="checkedInRows.length === 0" class="empty-msg">
          {{ t("exports.checkedIn.empty") }}
        </div>
        <div v-else class="search-row">
          <button class="btn-primary" @click="exportCheckedInCsv">
            {{ t("exports.checkedIn.exportCsv", { n: checkedInRows.length }) }}
          </button>
        </div>

        <p class="footnote" v-html="t('exports.checkedIn.footnote')"></p>
      </div>
    </section>

    <!-- ═══ Catégorie : Scans de session (audience entrée de salle, à plat) ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'session-scans' }">
      <header class="export-category-header" @click="toggleCategory('session-scans')">
        <div>
          <h3>{{ t("exports.sessionScans.title") }}</h3>
          <p>{{ t("exports.sessionScans.desc") }}</p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'session-scans' }">▾</span>
      </header>

      <div v-if="openCategory === 'session-scans'" class="export-category-body">
        <div v-if="loading" class="loading-row">
          <div class="spinner-small-dark"></div>
          <span>{{ t("exports.loadingSources") }}</span>
        </div>
        <template v-else>
          <div class="info-row">
            <div class="info-chip">
              <span class="info-chip-label">{{ t("exports.sessionScans.count") }}</span>
              <span class="info-chip-value">{{ fmt(filteredSessionScanRows.length) }}</span>
            </div>
          </div>
          <div v-if="sessionScanRows.length === 0" class="empty-msg">{{ t("exports.sessionScans.empty") }}</div>
          <div v-else class="search-row">
            <select
              v-if="scanSessionTypes.length > 0"
              v-model="selectedScanSessionType"
              class="type-select"
            >
              <option value="">{{ t("exports.presence.allTypes") }}</option>
              <option v-for="ty in scanSessionTypes" :key="ty" :value="ty">{{ ty }}</option>
            </select>
            <select
              v-if="scanOrganizers.length > 0"
              v-model="selectedScanOrganizer"
              class="type-select"
            >
              <option value="">{{ t("exports.presence.allOrganizers") }}</option>
              <option v-for="org in scanOrganizers" :key="org" :value="org">{{ org }}</option>
            </select>
            <button
              class="btn-primary"
              :disabled="filteredSessionScanRows.length === 0"
              @click="exportSessionScansCsv"
            >
              {{ t("exports.sessionScans.exportCsv", { n: filteredSessionScanRows.length }) }}
            </button>
          </div>
          <p class="footnote" v-html="t('exports.sessionScans.footnote')"></p>
        </template>
      </div>
    </section>

    <!-- ═══ Catégorie : Scans de zone (stands, lounges, à plat) ═══ -->
    <section class="export-category" :class="{ open: openCategory === 'zone-scans' }">
      <header class="export-category-header" @click="toggleCategory('zone-scans')">
        <div>
          <h3>{{ t("exports.zoneScans.title") }}</h3>
          <p>{{ t("exports.zoneScans.desc") }}</p>
        </div>
        <span class="chevron" :class="{ rotated: openCategory === 'zone-scans' }">▾</span>
      </header>

      <div v-if="openCategory === 'zone-scans'" class="export-category-body">
        <div v-if="loading" class="loading-row">
          <div class="spinner-small-dark"></div>
          <span>{{ t("exports.loadingSources") }}</span>
        </div>
        <template v-else>
          <div class="info-row">
            <div class="info-chip">
              <span class="info-chip-label">{{ t("exports.zoneScans.count") }}</span>
              <span class="info-chip-value">{{ fmt(zoneScanRows.length) }}</span>
            </div>
          </div>
          <div v-if="zoneScanRows.length === 0" class="empty-msg">{{ t("exports.zoneScans.empty") }}</div>
          <div v-else class="search-row">
            <button class="btn-primary" @click="exportZoneScansCsv">
              {{ t("exports.zoneScans.exportCsv", { n: zoneScanRows.length }) }}
            </button>
          </div>
          <p class="footnote" v-html="t('exports.zoneScans.footnote')"></p>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { downloadCsv } from "../../utils/exportCsv.js";
import { downloadWorkbook } from "@/utils/exportXlsx.js";
import { fmt } from "@/utils/formatters.js";
import SessionPresenceExport from "../SessionPresenceExport.vue";
import {
  buildSessionAttendance,
  ATTENDANCE_HEADERS,
  attendanceRowToCsv,
  PHYSICAL_ATTENDANCE_HEADERS,
  physicalAttendanceRowToCsv,
  LIVE_ATTENDANCE_HEADERS,
  liveAttendanceRowToCsv,
  REPLAY_ATTENDANCE_HEADERS,
  replayAttendanceRowToCsv,
  REPLAY_VIEW_HEADERS,
  buildReplayViewRows,
  replayViewRowToCsv,
  filterAttendanceBySource,
} from "../../utils/buildSessionAttendance.js";
import {
  buildDelegateJourney,
  JOURNEY_HEADERS,
  journeyRowToCsv,
} from "../../utils/buildDelegateJourney.js";
import {
  buildCheckedInDelegates,
  CHECKED_IN_HEADERS,
  checkedInRowToCsv,
} from "../../utils/buildCheckedInDelegates.js";
import {
  ZONE_SCAN_HEADERS,
  buildZoneScanRows,
  zoneScanRowToCsv,
  SESSION_SCAN_HEADERS,
  buildSessionScanRows,
  sessionScanRowToCsv,
} from "../../utils/buildScanExport.js";
import { delegateBadgeType } from "@/utils/checkinByType.js";
import { hasValidCheckin } from "@/utils/viewerJoin.js";

const props = defineProps({
  delegates: { type: Array, default: () => [] },
  eventName: { type: String, default: "" },
  // Instances proprietees par StatisticsView (timer + cache mutualises).
  liveApi: { type: Object, required: true },
  replayApi: { type: Object, required: true },
  scansApi: { type: Object, required: true },
});

const { t, locale } = useI18n();
const route = useRoute();
const eventId = route.params.eventId;

const live = props.liveApi;
const replay = props.replayApi;
const scans = props.scansApi;

const openCategory = ref(null); // tous les volets replies par defaut
const search = ref("");
const selectedSessionType = ref(""); // "" = tous les types (filtre categorie "Presence par session")
const selectedScanSessionType = ref(""); // "" = tous les types (filtre categorie "Scans de session")
const selectedScanOrganizer = ref(""); // "" = tous les organisateurs (filtre categorie "Scans de session")
const exportingAll = ref(false);
const exportAllProgress = ref(0);
const industrySearch = ref(""); // filtre texte sur le nom d'organisation (categorie "Export industrie")
const exportingIndustries = ref(false);
const industryProgress = ref(0);

// Parcours par personne
const journeyEmail = ref("");
const journeyResult = ref(null);

function toggleCategory(id) {
  openCategory.value = openCategory.value === id ? null : id;
}

const loading = computed(
  () => live.loading.value || replay.loading.value || scans.loading.value
);

const errors = computed(() => {
  const arr = [];
  if (live.error.value) arr.push(t("exports.errLive", { msg: live.error.value }));
  if (replay.error.value) arr.push(t("exports.errReplay", { msg: replay.error.value }));
  if (scans.error.value) arr.push(t("exports.errScans", { msg: scans.error.value }));
  return arr;
});

// Type de session par sessionId. PRIORITE au `session_type` ES (deja resolu
// dans les items normalises audience/live/replay) — exactement la meme source
// que les indicateurs (computeLiveStats/computeReplayStats/computeScanStats) et
// que l'export xlsx-stats. Le `type` du noeud event GraphQL
// (children(eventType: SESSION).type) n'est que le discriminant generique
// (~ "SESSION"), trop large : on ne le garde qu'en dernier recours pour les
// sessions sans session_type ES.
const sessionTypeById = computed(() => {
  const map = new Map();
  const addItems = (arr) => {
    for (const it of arr || []) {
      if (it.sessionId && it.sessionType && !map.has(it.sessionId)) {
        map.set(it.sessionId, it.sessionType);
      }
    }
  };
  addItems(scans.stats.value.audience.scans);
  addItems(live.stats.value.items);
  addItems(replay.stats.value.items);
  // Repli GraphQL pour les sessions sans session_type ES.
  const addList = (arr) => {
    for (const s of arr || []) if (s?.id && s.type && !map.has(s.id)) map.set(s.id, s.type);
  };
  addList(live.sessions?.value);
  addList(replay.sessions?.value);
  return map;
});

// Organisateur de session par sessionId. Source primaire : le champ GraphQL
// `organizers { displayName }` du noeud SESSION (children). Repli : le
// `industry_name` porte par les scans audience ES (meme entite — l'industry_id
// du webhook = l'organisation "telle que specifiee dans le programme").
const sessionOrganizerById = computed(() => {
  const map = new Map();
  const addList = (arr) => {
    for (const s of arr || []) {
      if (!s?.id || map.has(s.id)) continue;
      const label = (s.organizers || [])
        .map((o) => o?.displayName || o?.id)
        .filter(Boolean)
        .join(", ");
      if (label) map.set(s.id, label);
    }
  };
  addList(live.sessions?.value);
  addList(replay.sessions?.value);
  for (const s of scans.stats.value.audience?.scans || []) {
    if (s.sessionId && s.industryName && !map.has(s.sessionId)) map.set(s.sessionId, s.industryName);
  }
  return map;
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

  // Tri par date de debut puis titre. On attache le type + l'organisateur resolus.
  return [...map.values()]
    .map((e) => ({
      ...e,
      type: sessionTypeById.value.get(e.id) || "",
      organizer: sessionOrganizerById.value.get(e.id) || "",
    }))
    .sort((a, b) => {
      const sa = a.start || "";
      const sb = b.start || "";
      if (sa !== sb) return sa.localeCompare(sb);
      return (a.title || "").localeCompare(b.title || "");
    });
});

// Types de session distincts (pour le filtre deroulant de "Presence par session").
const sessionTypes = computed(() => {
  const set = new Set();
  for (const s of sessions.value) if (s.type) set.add(s.type);
  return [...set].sort((a, b) => a.localeCompare(b));
});

const filteredSessions = computed(() => {
  const q = search.value.trim().toLowerCase();
  return sessions.value.filter((s) => {
    if (selectedSessionType.value && s.type !== selectedSessionType.value) return false;
    if (!q) return true;
    return (s.title || "").toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
  });
});

// ─── Listes par source pour les exports mono-source ────────────────────────
// Chaque entree expose le compteur pertinent (count) consomme par
// SessionPresenceExport. Filtrees aux sessions ayant au moins 1 unite.
const physicalSessions = computed(() =>
  sessions.value
    .filter((s) => s.audienceCount > 0)
    .map((s) => ({ id: s.id, title: s.title, start: s.start, end: s.end, type: s.type, organizer: s.organizer, count: s.audienceCount }))
);
const liveSessions = computed(() =>
  sessions.value
    .filter((s) => s.liveCount > 0)
    .map((s) => ({ id: s.id, title: s.title, start: s.start, end: s.end, type: s.type, organizer: s.organizer, count: s.liveCount }))
);
const replaySessions = computed(() =>
  sessions.value
    .filter((s) => s.replayCount > 0)
    .map((s) => ({ id: s.id, title: s.title, start: s.start, end: s.end, type: s.type, organizer: s.organizer, count: s.replayCount }))
);

// Construit les lignes (3 sources croisees) d'UNE session — base commune des
// exports combine + mono-source.
function buildRowsForSession(session) {
  const audienceScans = (scans.stats.value.audience.scans || []).filter(
    (s) => s.sessionId === session.id
  );
  const liveItems = (live.stats.value.items || []).filter((it) => it.sessionId === session.id);
  const replayItems = (replay.stats.value.items || []).filter((it) => it.sessionId === session.id);
  return buildSessionAttendance({
    session,
    audienceScans,
    liveItems,
    replayItems,
    delegates: props.delegates,
  });
}

function slug(str, n) {
  return (str || "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, n);
}

function buildFilename(prefix, session) {
  return `${prefix}_${slug(props.eventName || eventId, 40)}-${slug(session.title || session.id, 60)}`;
}

function exportSessionCsv(session) {
  const rows = buildRowsForSession(session);
  if (rows.length === 0) {
    alert(t("exports.session.noParticipant"));
    return;
  }
  downloadCsv(buildFilename("audiance", session), ATTENDANCE_HEADERS, rows.map(attendanceRowToCsv));
}

// Export mono-source (presentiel / live / replay) : memes lignes filtrees sur
// la seule source demandee, serialisees avec ses colonnes propres.
function exportSourceCsv(session, { source, headers, rowToCsv, prefix }) {
  const rows = filterAttendanceBySource(buildRowsForSession(session), source);
  if (rows.length === 0) {
    alert(t("exports.presence.noParticipant"));
    return;
  }
  downloadCsv(buildFilename(prefix, session), headers, rows.map(rowToCsv));
}

const exportPhysicalCsv = (session) =>
  exportSourceCsv(session, {
    source: "physique",
    headers: PHYSICAL_ATTENDANCE_HEADERS,
    rowToCsv: physicalAttendanceRowToCsv,
    prefix: "presentiel",
  });
const exportLiveCsv = (session) =>
  exportSourceCsv(session, {
    source: "live",
    headers: LIVE_ATTENDANCE_HEADERS,
    rowToCsv: liveAttendanceRowToCsv,
    prefix: "live",
  });
// Replay autonome : export PAR VUE (1 ligne = 1 vue VOD), aligne sur xlsx-stats
// (media/presentation/view date/origin par vue). N'utilise donc PAS
// exportSourceCsv (qui agrege par personne) mais le builder dedie.
function exportReplayCsv(session) {
  const replayItems = (replay.stats.value.items || []).filter((it) => it.sessionId === session.id);
  const rows = buildReplayViewRows({ session, replayItems, delegates: props.delegates });
  if (rows.length === 0) {
    alert(t("exports.presence.noParticipant"));
    return;
  }
  downloadCsv(buildFilename("replay", session), REPLAY_VIEW_HEADERS, rows.map(replayViewRowToCsv));
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

// ─── Export industrie (1 XLSX par organisation, onglets Live/Replay/On site) ──
// Liste des organisations detectees comme organisateur d'au moins une session,
// avec les compteurs bruts (vues/scans) par source — meme semantique que la
// table "Presence par session".
const industries = computed(() => {
  const map = new Map();
  for (const s of sessions.value) {
    if (!s.organizer) continue;
    let e = map.get(s.organizer);
    if (!e) {
      e = { organizer: s.organizer, sessions: 0, live: 0, replay: 0, onsite: 0 };
      map.set(s.organizer, e);
    }
    e.sessions += 1;
    e.live += s.liveCount;
    e.replay += s.replayCount;
    e.onsite += s.audienceCount;
  }
  return [...map.values()].sort((a, b) => a.organizer.localeCompare(b.organizer));
});

const filteredIndustries = computed(() => {
  const q = industrySearch.value.trim().toLowerCase();
  if (!q) return industries.value;
  return industries.value.filter((e) => e.organizer.toLowerCase().includes(q));
});

// Construit les 3 onglets (Live / Replay / On site) d'UNE organisation : on
// croise les sources sur chaque session de l'organisation, puis on filtre par
// source et on serialise avec EXACTEMENT les colonnes des exports mono-source.
function buildIndustrySheets(organizer) {
  const orgSessions = sessions.value.filter((s) => s.organizer === organizer);
  const live = [];
  const replay = [];
  const onsite = [];
  for (const session of orgSessions) {
    const rows = buildRowsForSession(session);
    for (const r of filterAttendanceBySource(rows, "live")) live.push(liveAttendanceRowToCsv(r));
    for (const r of filterAttendanceBySource(rows, "replay")) replay.push(replayAttendanceRowToCsv(r));
    for (const r of filterAttendanceBySource(rows, "physique")) onsite.push(physicalAttendanceRowToCsv(r));
  }
  return [
    { name: t("exports.industry.sheetLive"), headers: LIVE_ATTENDANCE_HEADERS, rows: live },
    { name: t("exports.industry.sheetReplay"), headers: REPLAY_ATTENDANCE_HEADERS, rows: replay },
    { name: t("exports.industry.sheetOnsite"), headers: PHYSICAL_ATTENDANCE_HEADERS, rows: onsite },
  ];
}

async function exportIndustryXlsx(organizer) {
  const sheets = buildIndustrySheets(organizer);
  await downloadWorkbook(`industrie_${slug(props.eventName || eventId, 40)}-${slug(organizer, 60)}`, sheets);
}

async function exportAllIndustries() {
  if (exportingIndustries.value) return;
  exportingIndustries.value = true;
  industryProgress.value = 0;
  try {
    for (const e of filteredIndustries.value) {
      await exportIndustryXlsx(e.organizer);
      industryProgress.value += 1;
      // Petite pause pour laisser le navigateur enchainer les telechargements.
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    exportingIndustries.value = false;
    industryProgress.value = 0;
  }
}

// ─── Parcours par personne ────────────────────────────────────────────────

const journeyDisplayName = computed(() => {
  const r = journeyResult.value;
  if (!r) return "";
  if (r.delegate) {
    const parts = [r.delegate.givenName, r.delegate.familyName].filter(Boolean);
    return parts.join(" ") || r.delegate.email || "—";
  }
  return r.esFallback?.fullName || journeyEmail.value;
});

const journeyBadgeType = computed(() =>
  journeyResult.value?.delegate ? delegateBadgeType(journeyResult.value.delegate) || "" : ""
);

const journeyCheckin = computed(() =>
  journeyResult.value?.delegate ? hasValidCheckin(journeyResult.value.delegate) : false
);

function lookupJourney() {
  const email = journeyEmail.value.trim();
  if (!email) return;
  journeyResult.value = buildDelegateJourney({
    email,
    delegates: props.delegates,
    audienceScans: scans.stats.value.audience.scans || [],
    liveItems: live.stats.value.items || [],
    replayItems: replay.stats.value.items || [],
    // Scans de zone (stands, lounges...) : comptent comme présence physique.
    zoneScans: scans.stats.value.zone?.scans || [],
    zoneNames: scans.zoneNames?.value || null,
  });
}

function resetJourney() {
  journeyEmail.value = "";
  journeyResult.value = null;
}

function exportJourneyCsv() {
  const result = journeyResult.value;
  if (!result || result.rows.length === 0) return;

  const personSlug = (journeyDisplayName.value || result.delegate?.email || journeyEmail.value)
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const safeEvent = (props.eventName || eventId)
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .slice(0, 40);
  const filename = `parcours_${safeEvent}-${personSlug}`;
  downloadCsv(filename, JOURNEY_HEADERS, result.rows.map(journeyRowToCsv));
}

// ─── Délégués check-in (présents physiques au congrès) ─────────────────────
// Source de l'info de présence : le délégué lui-même (checkedInDate). Aucun
// croisement ES nécessaire — uniquement les données registration.
const checkedInRows = computed(() => buildCheckedInDelegates(props.delegates));

function exportCheckedInCsv() {
  if (checkedInRows.value.length === 0) return;
  downloadCsv(
    `checkin_${safeEventName()}`,
    CHECKED_IN_HEADERS,
    checkedInRows.value.map(checkedInRowToCsv),
  );
}

function safeEventName() {
  return (props.eventName || eventId).replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
}

// ─── Scans de zone / de session (export a plat, enrichi delegue + type badge) ──
// Source = scans deja enrichis/recuperes par computeScanStats (delegateId, nom,
// email, badgeId, type repris du delegue charge quand l'ES est vide).
const zoneScanRows = computed(() =>
  buildZoneScanRows({
    zoneScans: scans.stats.value.zone?.scans || [],
    delegates: props.delegates,
    zoneNames: scans.zoneNames?.value || null,
  }),
);
// Début/fin de session (sessions GraphQL, start/end en UTC) par sessionId.
const sessionTimesById = computed(() => {
  const map = new Map();
  const add = (arr) => {
    for (const s of arr || []) {
      if (s?.id && !map.has(s.id) && (s.start || s.end)) map.set(s.id, { start: s.start, end: s.end });
    }
  };
  add(live.sessions?.value);
  add(replay.sessions?.value);
  return map;
});
const sessionScanRows = computed(() =>
  buildSessionScanRows({
    audienceScans: scans.stats.value.audience?.scans || [],
    delegates: props.delegates,
    sessionTypeById: sessionTypeById.value,
    sessionTimesById: sessionTimesById.value,
    sessionOrganizerById: sessionOrganizerById.value,
  }),
);
// Types de session distincts presents dans les scans de salle (filtre deroulant).
const scanSessionTypes = computed(() => {
  const set = new Set();
  for (const r of sessionScanRows.value) if (r.sessionType) set.add(r.sessionType);
  return [...set].sort((a, b) => a.localeCompare(b));
});
// Organisateurs distincts presents dans les scans de salle (filtre deroulant).
const scanOrganizers = computed(() => {
  const set = new Set();
  for (const r of sessionScanRows.value) if (r.sessionOrganizer) set.add(r.sessionOrganizer);
  return [...set].sort((a, b) => a.localeCompare(b));
});
const filteredSessionScanRows = computed(() => {
  return sessionScanRows.value.filter((r) => {
    if (selectedScanSessionType.value && r.sessionType !== selectedScanSessionType.value) return false;
    if (selectedScanOrganizer.value && r.sessionOrganizer !== selectedScanOrganizer.value) return false;
    return true;
  });
});

function exportZoneScansCsv() {
  if (zoneScanRows.value.length === 0) return;
  downloadCsv(`scans_zone_${safeEventName()}`, ZONE_SCAN_HEADERS, zoneScanRows.value.map(zoneScanRowToCsv));
}
function exportSessionScansCsv() {
  if (filteredSessionScanRows.value.length === 0) return;
  downloadCsv(
    `scans_session_${safeEventName()}`,
    SESSION_SCAN_HEADERS,
    filteredSessionScanRows.value.map(sessionScanRowToCsv),
  );
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
.exports-tab { max-width: 1100px; }
.exports-header h2 {
  font-size: 23px; font-weight: 600; color: var(--primary);
  margin: 0 0 4px;
}
.exports-subtitle {
  font-size: 14px; color: var(--text-muted);
  margin: 0 0 16px; line-height: 1.5; max-width: 720px;
}

.exports-errors {
  padding: 8px 12px; background: #fff7ed; border: 1px solid #fed7aa;
  border-radius: 8px; color: #9a3412; font-size: 13px;
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
.chevron.rotated { transform: rotate(0deg); }
.export-category:not(.open) .chevron { transform: rotate(-90deg); }

.export-category-body { padding: 14px 18px; }

.loading-row {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: var(--text-secondary);
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
  font-size: 12px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: .3px; font-weight: 600;
}
.info-chip-value {
  font-size: 14px; font-weight: 700; color: var(--primary);
}

.search-row {
  display: flex; gap: 8px; margin-bottom: 12px; align-items: center;
}
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
.btn-primary:disabled {
  opacity: .5; cursor: not-allowed; background: var(--primary);
}

.table-wrapper {
  border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; background: #fff;
}
.sessions-table { font-size: 13px; }
.sessions-table th.num,
.sessions-table td.num { text-align: right; }
.sessions-table th { padding: 8px 10px; }
.sessions-table td { padding: 8px 10px; vertical-align: middle; }
.th-hint {
  font-weight: 400; color: var(--text-muted);
  text-transform: none; letter-spacing: 0; font-size: 10px;
}
.session-title {
  font-weight: 600; color: var(--text); line-height: 1.3;
  max-width: 420px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
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

.footnote {
  margin-top: 12px; padding: 10px 14px;
  background: #fafbfc; border-radius: 6px;
  font-size: 12px; color: var(--text-muted); line-height: 1.5;
}
.footnote strong { color: var(--text-secondary); }
.footnote code {
  font-size: 9.5px; background: #eef0f3; padding: 1px 4px;
  border-radius: 3px; font-family: monospace; color: var(--text-secondary);
}

/* Parcours par personne */
.journey-form {
  display: flex; gap: 8px; align-items: center; margin-bottom: 12px;
}
.btn-secondary {
  padding: 7px 12px; border: 1px solid var(--border);
  background: #fff; color: var(--text-secondary); border-radius: 6px;
  font-size: 14px; font-weight: 500; cursor: pointer;
  transition: background .15s;
}
.btn-secondary:hover { background: #fafbfc; }

.journey-result { margin-top: 4px; }
.journey-empty {
  padding: 14px; background: #fff7ed; border: 1px solid #fed7aa;
  border-radius: 6px; color: #9a3412; font-size: 14px;
}
.journey-empty.soft {
  background: #fafbfc; border-color: var(--border);
  color: var(--text-muted); text-align: center;
  padding: 24px; margin-top: 10px;
}

.journey-card {
  background: #fff; border: 1px solid var(--border);
  border-radius: 8px; padding: 14px 16px;
}
.journey-card-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 12px;
}
.journey-name {
  font-size: 17px; font-weight: 600; color: var(--text);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.journey-sub {
  font-size: 14px; color: var(--text-muted); margin-top: 2px;
}
.journey-pill {
  display: inline-block; font-size: 12px; font-weight: 600;
  padding: 2px 8px; border-radius: 999px;
  background: #fef3c7; color: #92400e; border: 1px solid #fde68a;
}
.journey-pill.warn { background: #fef3c7; color: #92400e; border-color: #fde68a; }

.btn-export.big {
  padding: 8px 16px; font-size: 14px;
}
.btn-export:disabled {
  opacity: .5; cursor: not-allowed;
  background: #fff; color: var(--primary);
}

.journey-meta {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
}
.meta-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px; background: #f5f6f8; border: 1px solid var(--border);
  border-radius: 4px; font-size: 10.5px;
}
.meta-chip code {
  font-family: monospace; font-size: 12px; color: var(--text-secondary);
}
.meta-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: .3px;
  color: var(--text-muted); font-weight: 600;
}

/* Check-in congrès : OUI sur fond vert, NON sur fond rouge. */
.checkin-badge {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 700; line-height: 1.3;
}
.checkin-badge.yes { background: #dcfce7; color: #166534; }
.checkin-badge.no { background: #fee2e2; color: #991b1b; }

.journey-counts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;
  margin-bottom: 14px;
}
.count-box {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 12px; background: #fafbfc;
  border: 1px solid var(--border); border-radius: 6px;
}
.count-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px;
  color: var(--text-muted); font-weight: 600;
}
.count-value {
  font-size: 21px; font-weight: 700; color: var(--primary);
  line-height: 1.1;
}

.sessions-table .muted { color: var(--text-muted); }

/* Tag "Zone" dans le parcours : distingue une présence en zone d'une session. */
.zone-tag {
  display: inline-block; margin-right: 6px;
  padding: 1px 6px; border-radius: 6px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px;
  background: #6F45FF; color: #fff; vertical-align: 1px;
}
</style>
