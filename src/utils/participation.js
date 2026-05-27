// Decomposition "Total participants" — photo unique et dedoublonnee de
// "qui a reellement participe au congres".
//
// Un meme delegue ne compte qu'UNE fois (dedupe sur delegate.id Mongo) :
//   - s'il est physiquement checke-in, il compte la (toutes ses vues
//     live/replay sont absorbees) ;
//   - sinon, on regarde s'il a vu en live, en replay ou les deux, et chacun
//     ne compte qu'une fois meme s'il a fait les deux.
//
//   total = checkedIn + liveOnly + both + replayOnly
//
// La jointure ES (user_id = Keycloak) <-> delegate (emailAddresses[].source.id
// type ACCOUNT) est portee par viewerJoin.js. Source de verite unique partagee
// par OverviewTab (decomposition visuelle + deltas) et useExportMarkdown
// (section "Total participants" du dump LLM).

import {
  buildDelegateLookup,
  getCheckedInDelegateIds,
  getRemoteOnlyDelegateIds,
} from "@/utils/viewerJoin.js";

// Retourne les Set<delegate.id> de chaque composante + un objet `counts`.
// `liveItems` / `replayItems` sont les `stats.items` ES bruts (peuvent etre
// null/undefined pendant le chargement — la fonction renvoie alors juste la
// composante physique).
export function computeParticipation(delegates, liveItems, replayItems, { datasetLabel = "" } = {}) {
  const lookup = buildDelegateLookup(delegates || [], { datasetLabel });
  const checkedIn = getCheckedInDelegateIds(delegates || []);
  const liveRemote = getRemoteOnlyDelegateIds(liveItems, lookup, { datasetLabel: `${datasetLabel}-live` });
  const replayRemote = getRemoteOnlyDelegateIds(replayItems, lookup, { datasetLabel: `${datasetLabel}-replay` });

  // Decoupe des distanciels (non physiques) en live-only / both / replay-only.
  const both = new Set();
  const liveOnly = new Set();
  for (const id of liveRemote) {
    if (replayRemote.has(id)) both.add(id);
    else liveOnly.add(id);
  }
  const replayOnly = new Set();
  for (const id of replayRemote) {
    if (!liveRemote.has(id)) replayOnly.add(id);
  }

  // Total = union dedoublonnee. liveRemote/replayRemote sont par construction
  // disjoints du physique, donc total === checkedIn + liveOnly + both + replayOnly.
  const total = new Set(checkedIn);
  for (const id of liveRemote) total.add(id);
  for (const id of replayRemote) total.add(id);

  return {
    checkedIn,
    liveRemote,
    replayRemote,
    liveOnly,
    both,
    replayOnly,
    total,
    counts: {
      checkedIn: checkedIn.size,
      liveOnly: liveOnly.size,
      both: both.size,
      replayOnly: replayOnly.size,
      total: total.size,
    },
  };
}
