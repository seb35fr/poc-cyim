import { ref, readonly } from "vue";

// Bus de diagnostic global. Permet a n'importe quel module (utils, composables)
// de pousser un warning visible en UI — typiquement quand la jointure ES <->
// delegates a une couverture suspecte (cf. viewerJoin.js), pour que l'admin
// qui consulte les stats se rende compte qu'un KPI peut etre faux et nous
// previenne.
//
// Dedupe par fingerprint : un meme probleme ne s'affiche qu'une seule fois,
// meme si plusieurs computeds le detectent (lookup recalculee a chaque
// changement de filtre). Le fingerprint est partage avec console.warn pour
// rester coherent.
//
// Le composant <DiagnosticsBanner> consomme `diagnostics` et affiche un toast
// top-right par diagnostic actif. L'utilisateur peut dismiss individuellement.

const _items = ref([]);
const _seenFingerprints = new Set();
let _nextId = 1;

export function pushDiagnostic({ severity = "warn", title, message, fingerprint }) {
  // Idempotent : meme fingerprint = pas de re-push (evite la duplication
  // quand un computed se recalcule sur le meme dataset).
  if (fingerprint && _seenFingerprints.has(fingerprint)) return;
  if (fingerprint) _seenFingerprints.add(fingerprint);
  _items.value = [
    ..._items.value,
    {
      id: _nextId++,
      severity,
      title,
      message,
      timestamp: Date.now(),
      fingerprint,
    },
  ];
}

export function dismissDiagnostic(id) {
  _items.value = _items.value.filter((d) => d.id !== id);
}

// Reset complet (utile pour les tests ou un reload manuel "tout est OK").
// On vide AUSSI les fingerprints sinon impossible de re-warn sur le meme cas
// apres dismiss.
export function clearDiagnostics() {
  _items.value = [];
  _seenFingerprints.clear();
}

export function useDiagnostics() {
  return {
    diagnostics: readonly(_items),
    dismiss: dismissDiagnostic,
    clear: clearDiagnostics,
  };
}
