<template>
  <div class="picker">
    <header class="picker-topbar">
      <span class="picker-brand">{{ t("picker.title") }}</span>
      <LanguageToggle class="picker-lang" />
    </header>

    <main class="picker-main">
      <!-- Saisie directe d'un eventId (toujours disponible, y compris si la liste echoue). -->
      <section class="picker-card">
        <h2>{{ t("picker.manualTitle") }}</h2>
        <p class="picker-hint">{{ t("picker.manualHint") }}</p>
        <form class="picker-manual" @submit.prevent="openManual">
          <input
            v-model="manualId"
            type="text"
            :placeholder="t('picker.manualPlaceholder')"
            spellcheck="false"
            autocomplete="off"
          />
          <button type="submit" class="btn-primary" :disabled="!manualEventId">{{ t("picker.open") }}</button>
        </form>
        <p v-if="manualId && !manualEventId" class="picker-error">{{ t("picker.invalidId") }}</p>
      </section>

      <section class="picker-card">
        <div class="picker-list-head">
          <h2>{{ search.trim() ? t("picker.searchTitle") : t("picker.recentTitle", { n: SINCE_MONTHS }) }}</h2>
          <input
            v-model="search"
            class="picker-search"
            type="search"
            :placeholder="t('picker.searchPlaceholder')"
          />
        </div>
        <p class="picker-hint">{{ search.trim() ? t("picker.searchHint") : t("picker.recentHint", { n: SINCE_MONTHS }) }}</p>

        <p v-if="error" class="picker-error">{{ t("picker.loadError") }} — {{ error }}</p>
        <p v-else-if="!loading && events.length === 0" class="picker-empty">{{ t("picker.empty") }}</p>

        <ul class="picker-list">
          <li v-for="ev in events" :key="ev.id">
            <router-link :to="{ name: 'statistics', params: { eventId: ev.id } }" class="picker-item">
              <span class="picker-logo">
                <img v-if="ev.picture && !brokenPictures.has(ev.id)" :src="ev.picture" alt="" @error="markBroken(ev.id)" />
                <span v-else>{{ initials(ev.title) }}</span>
              </span>
              <span class="picker-item-text">
                <span class="picker-item-title">{{ ev.title }}</span>
                <span class="picker-item-meta">
                  {{ formatRange(ev.start, ev.end) }}
                  <span v-if="isOngoing(ev)" class="picker-badge">{{ t("picker.ongoing") }}</span>
                </span>
              </span>
              <code class="picker-item-id">{{ ev.id }}</code>
            </router-link>
          </li>
        </ul>

        <div v-if="loading" class="picker-loading">{{ t("picker.loading") }}</div>
        <button v-else-if="nextPageToken" class="btn-secondary" type="button" @click="load(true)">
          {{ t("picker.more") }}
        </button>
      </section>
    </main>
  </div>
</template>

<script setup>
// Ecran d'accueil quand l'URL ne porte pas d'eventId : saisie manuelle de
// l'identifiant, ou choix dans la liste des congres en cours / termines depuis
// SINCE_MONTHS mois (recherche par titre = toutes dates).
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import LanguageToggle from "@/components/LanguageToggle.vue";
import { fetchRecentEvents } from "@/api/graphql.js";

const SINCE_MONTHS = 3;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const { t, locale } = useI18n();
const router = useRouter();

// Saisie manuelle : accepte un UUID seul ou une URL complete (registration-admin,
// dashboard...) dont on extrait le 1er UUID.
const manualId = ref("");
const manualEventId = computed(() => manualId.value.match(UUID_RE)?.[0]?.toLowerCase() || "");
function openManual() {
  if (manualEventId.value) router.push({ name: "statistics", params: { eventId: manualEventId.value } });
}

const search = ref("");
const events = ref([]);
const nextPageToken = ref(null);
const loading = ref(false);
const error = ref("");
let requestSeq = 0;

async function load(append = false) {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = "";
  try {
    const res = await fetchRecentEvents({
      sinceMonths: SINCE_MONTHS,
      search: search.value,
      pageToken: append ? nextPageToken.value : null,
    });
    if (seq !== requestSeq) return; // reponse perimee (recherche modifiee entre-temps)
    events.value = append ? [...events.value, ...res.items] : res.items;
    nextPageToken.value = res.nextPageToken;
  } catch (err) {
    if (seq !== requestSeq) return;
    error.value = err?.message || String(err);
    if (!append) events.value = [];
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

let debounce = null;
watch(search, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => load(false), 300);
});
onMounted(() => load(false));

const brokenPictures = ref(new Set());
function markBroken(id) {
  brokenPictures.value = new Set(brokenPictures.value).add(id);
}

function initials(title) {
  return String(title || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function isOngoing(ev) {
  const now = Date.now();
  const s = Date.parse(ev.start);
  const e = Date.parse(ev.end);
  return Number.isFinite(s) && Number.isFinite(e) && s <= now && now <= e;
}

function formatRange(start, end) {
  const fmt = (v) => {
    const d = new Date(v);
    if (!v || Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(locale.value === "en" ? "en-GB" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Europe/Paris",
    });
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return t("picker.noDates");
  if (!e || s === e) return s || e;
  return `${s} → ${e}`;
}
</script>

<style scoped>
.picker { min-height: 100vh; background: var(--bg); }
.picker-topbar {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 22px;
  background: var(--primary); color: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.12);
}
.picker-brand { font-size: 17px; font-weight: 700; }
.picker-lang { margin-left: auto; }
.picker-main {
  max-width: 900px; margin: 0 auto; padding: 24px 16px 48px;
  display: flex; flex-direction: column; gap: 20px;
}
.picker-card {
  background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 20px 22px;
}
.picker-card h2 { font-size: 16px; font-weight: 700; color: var(--primary); }
.picker-hint { font-size: 13px; color: var(--text-secondary); margin: 4px 0 14px; }
.picker-manual { display: flex; gap: 10px; flex-wrap: wrap; }
.picker-manual input, .picker-search {
  flex: 1; min-width: 0;
  padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px;
  font: inherit; font-size: 14px; color: var(--text); background: #fff;
}
.picker-manual input { font-family: ui-monospace, Consolas, monospace; }
.picker-list-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.picker-list-head h2 { flex: 1 1 auto; }
.picker-search { flex: 0 1 280px; }
.btn-primary, .btn-secondary {
  padding: 9px 18px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-primary { background: var(--accent); color: var(--primary); border: none; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary {
  display: block; margin: 14px auto 0;
  background: #fff; color: var(--primary); border: 1px solid var(--primary);
}
.picker-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.picker-item {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px;
  text-decoration: none; color: inherit;
  transition: border-color .15s, background .15s;
}
.picker-item:hover, .picker-item:focus-visible { border-color: var(--primary-light); background: #f8fafc; outline: none; }
.picker-logo {
  flex-shrink: 0; width: 44px; height: 44px; border-radius: 8px;
  background: #fff; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  font-size: 14px; font-weight: 700; color: var(--primary);
}
.picker-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.picker-item-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.picker-item-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker-item-meta { font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; }
.picker-badge {
  font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
  background: rgba(48, 221, 146, .18); color: #157a4f;
}
.picker-item-id { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.picker-loading, .picker-empty { font-size: 13px; color: var(--text-secondary); padding: 10px 0; text-align: center; }
.picker-error { font-size: 13px; color: var(--danger); margin: 6px 0; }
@media (max-width: 640px) {
  .picker-item-id { display: none; }
  .picker-search { flex: 1 1 100%; }
}
</style>
