<template>
  <div ref="rootEl" class="badge-type-filter">
    <button
      type="button"
      class="bt-trigger"
      :class="{ open, active: selected.size > 0 }"
      @click="toggleOpen"
    >
      <span class="bt-trigger-label">{{ t("badgeFilter.label") }}</span>
      <span class="bt-trigger-value">
        <template v-if="selected.size === 0">{{ t("badgeFilter.all") }}</template>
        <template v-else-if="selected.size === 1">{{ firstSelected }}</template>
        <template v-else>{{ t("badgeFilter.selectedN", { n: selected.size }) }}</template>
      </span>
      <span class="bt-trigger-chevron" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="bt-popover" role="dialog">
      <div class="bt-popover-head">
        <input
          ref="searchEl"
          v-model="query"
          type="text"
          class="bt-search"
          :placeholder="t('badgeFilter.searchPlaceholder')"
          @keydown.escape.prevent="close"
        />
      </div>

      <div class="bt-popover-actions">
        <button type="button" class="bt-link" @click="checkAllVisible">
          {{ query ? t("badgeFilter.checkAllVisible") : t("badgeFilter.checkAll") }}
        </button>
        <button type="button" class="bt-link" :disabled="selected.size === 0" @click="$emit('clear')">
          {{ t("badgeFilter.clear") }}
        </button>
      </div>

      <div class="bt-options">
        <label
          v-for="bt in filteredTypes"
          :key="bt"
          class="bt-option"
          :class="{ checked: selected.has(bt) }"
        >
          <input
            type="checkbox"
            :checked="selected.has(bt)"
            @change="$emit('toggle', bt)"
          />
          <span class="bt-checkbox" aria-hidden="true">
            <svg v-if="selected.has(bt)" width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="bt-option-label" :title="bt">{{ bt }}</span>
        </label>
        <div v-if="filteredTypes.length === 0" class="bt-empty">
          {{ t("badgeFilter.noMatch") }}
        </div>
      </div>

      <div class="bt-popover-foot">
        <span class="bt-count">
          {{ t("badgeFilter.count", selected.size, { selected: selected.size, total: types.length }) }}
        </span>
        <button type="button" class="bt-close" @click="close">{{ t("badgeFilter.close") }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// Dropdown multi-select pour le filtre badge type. Le composant n'est qu'un
// "controlled input" : selected vient du composable useBadgeTypeFilter
// (instancie au niveau StatisticsView), les actions remontent via emits.
//
// Le v-if sur le composant est cote parent (cf. OverviewTab) pour eviter le
// bug Vue 3 du v-if-at-root-template qui casse le patch.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({
  types: { type: Array, required: true },
  // type: Object (non Set) pour eviter la validation Vue qui peut peter
  // quand un Ref<Set> est passe puis auto-unwrappe.
  selected: { type: Object, required: true },
});

const emit = defineEmits(["toggle", "clear", "select"]);

const open = ref(false);
const query = ref("");
const rootEl = ref(null);
const searchEl = ref(null);

const firstSelected = computed(() => {
  const sel = props.selected;
  for (const t of props.types) if (sel.has(t)) return t;
  return "";
});

const filteredTypes = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.types;
  return props.types.filter((t) => t.toLowerCase().includes(q));
});

function toggleOpen() {
  open.value = !open.value;
}

function close() {
  open.value = false;
  query.value = "";
}

function checkAllVisible() {
  // Union de la selection courante + tous les types actuellement visibles.
  // Si pas de filtre, on coche tout. Si filtre actif, on coche les visibles
  // sans toucher aux selections existantes hors-filtre.
  const next = new Set(props.selected);
  for (const t of filteredTypes.value) next.add(t);
  emit("select", [...next]);
}

// Outside-click : ferme le dropdown. On capture en bubble phase pour eviter de
// se fermer sur un clic interne (les clics sur les checkboxes restent dans
// le composant).
function handleDocClick(e) {
  if (!open.value) return;
  if (rootEl.value && !rootEl.value.contains(e.target)) close();
}
function handleEscape(e) {
  if (e.key === "Escape" && open.value) close();
}

onMounted(() => {
  document.addEventListener("click", handleDocClick);
  document.addEventListener("keydown", handleEscape);
});
onUnmounted(() => {
  document.removeEventListener("click", handleDocClick);
  document.removeEventListener("keydown", handleEscape);
});

// Auto-focus la recherche quand on ouvre.
watch(open, async (v) => {
  if (v) {
    await nextTick();
    searchEl.value?.focus();
  }
});
</script>

<style scoped>
.badge-type-filter {
  position: relative;
  display: inline-flex; align-items: center;
  margin-bottom: 12px;
  font-family: inherit;
}

/* Trigger : bouton compact qui affiche l'etat courant. */
.bt-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow);
  transition: border-color .12s, background .12s;
}
.bt-trigger:hover { border-color: var(--primary); }
.bt-trigger.open { border-color: var(--primary); }
.bt-trigger.active {
  background: var(--primary); color: #fff;
  border-color: var(--primary);
}
.bt-trigger-label {
  color: var(--text-muted); font-size: 12px; text-transform: uppercase;
  letter-spacing: .3px; font-weight: 600;
}
.bt-trigger.active .bt-trigger-label { color: rgba(255,255,255,.85); }
.bt-trigger-value {
  font-weight: 600; color: var(--text);
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bt-trigger.active .bt-trigger-value { color: #fff; }
.bt-trigger-chevron {
  font-size: 12px; color: var(--text-muted); transition: transform .15s;
}
.bt-trigger.open .bt-trigger-chevron { transform: rotate(180deg); }
.bt-trigger.active .bt-trigger-chevron { color: rgba(255,255,255,.85); }

/* Popover : positionnement absolute sous le trigger. */
.bt-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 320px;
  max-width: calc(100vw - 24px);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 50;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.bt-popover-head { padding: 10px 10px 6px; }
.bt-search {
  width: 100%; padding: 6px 10px;
  font-size: 14px; font-family: inherit;
  border: 1px solid var(--border); border-radius: 5px;
  background: #fff; color: var(--text);
  transition: border-color .12s;
}
.bt-search:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(30, 78, 102, .12);
}

.bt-popover-actions {
  display: flex; gap: 8px; padding: 0 10px 6px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
  margin-bottom: 2px;
}
.bt-link {
  background: none; border: none;
  font-size: 13px; font-weight: 600;
  color: var(--primary); cursor: pointer;
  padding: 2px 6px; border-radius: 4px;
  transition: background .12s;
}
.bt-link:hover { background: rgba(30, 78, 102, .08); }
.bt-link:disabled { color: var(--text-muted); cursor: not-allowed; }
.bt-link:disabled:hover { background: none; }

.bt-options {
  flex: 1; overflow-y: auto;
  max-height: 280px;
  padding: 4px 0;
}
.bt-option {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; cursor: pointer;
  font-size: 11.5px; color: var(--text);
  transition: background .1s;
}
.bt-option:hover { background: #f5f7fa; }
.bt-option.checked { background: rgba(30, 78, 102, .06); }
.bt-option input { position: absolute; opacity: 0; pointer-events: none; }
.bt-checkbox {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; flex-shrink: 0;
  border: 1.5px solid var(--border); border-radius: 3px;
  background: #fff; color: #fff;
  transition: background .12s, border-color .12s;
}
.bt-option.checked .bt-checkbox {
  background: var(--primary); border-color: var(--primary);
}
.bt-option-label {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.bt-empty {
  padding: 16px 12px; text-align: center;
  font-size: 13px; color: var(--text-muted); font-style: italic;
}

.bt-popover-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  background: #fafbfc;
}
.bt-count { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.bt-close {
  background: var(--primary); color: #fff; border: none;
  padding: 4px 12px; border-radius: 4px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .12s;
}
.bt-close:hover { background: var(--primary-light); }
</style>
