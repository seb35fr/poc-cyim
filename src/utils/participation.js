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
// `delegates` = population de JOINTURE viewers : delegues + pseudo-delegues
// "membres non inscrits" (cf. useViewerMembers) -> ces membres comptent dans
// liveOnly / both / replayOnly et sont identifies via counts.members*.
//
// La jointure ES (user_id = Keycloak) <-> delegate (emailAddresses[].source.id
// type ACCOUNT) est portee par viewerJoin.js. Source de verite unique partagee
// par OverviewTab (decomposition visuelle + deltas) et useExportMarkdown
// (section "Total participants" du dump LLM).

import {
  buildDelegateLookup,
  getCheckedInDelegateIds,
  getMatchedViewerDelegateIds,
  getRemoteOnlyDelegateIds,
  hasValidCheckin,
} from "@/utils/viewerJoin.js";
import { makeInRange } from "@/utils/dateRange.js";

// Retourne les Set<delegate.id> de chaque composante + un objet `counts`.
// `liveItems` / `replayItems` sont les `stats.items` ES bruts (peuvent etre
// null/undefined pendant le chargement — la fonction renvoie alors juste la
// composante physique).
export function computeParticipation(delegates, liveItems, replayItems, { datasetLabel = "", dateRange = null } = {}) {
  const lookup = buildDelegateLookup(delegates || [], { datasetLabel });
  // Le check-in physique FAIT partie du perimetre du filtre date : on ne compte
  // un present physique que si son check-in tombe dans la plage. liveItems/
  // replayItems sont deja filtres par date en amont (stats ES), donc liveRemote/
  // replayRemote refletent aussi la plage.
  let checkedIn;
  if (dateRange) {
    const inRange = makeInRange(dateRange);
    checkedIn = new Set();
    for (const d of delegates || []) {
      if (d.id && hasValidCheckin(d) && inRange(d.checkedInDate)) checkedIn.add(d.id);
    }
  } else {
    checkedIn = getCheckedInDelegateIds(delegates || []);
  }
  const liveRemote = getRemoteOnlyDelegateIds(liveItems, lookup, { datasetLabel: `${datasetLabel}-live` });
  const replayRemote = getRemoteOnlyDelegateIds(replayItems, lookup, { datasetLabel: `${datasetLabel}-replay` });

  // Decoupe des PHYSIQUEMENT presents selon leur consommation distancielle.
  // liveViewers / replayViewers = tous les viewers live/replay rapproches d'un
  // delegue (check-in inclus, contrairement a liveRemote/replayRemote qui
  // excluent les checked-in). On intersecte avec la population physique.
  //
  // 4 sous-groupes DISJOINTS (somme == checkedIn) :
  //   - checkedInOnly       : present, aucune consommation distancielle ;
  //   - checkedInLive       : present + live SEUL (pas de replay) ;
  //   - checkedInReplay     : present + replay SEUL (pas de live) ;
  //   - checkedInLiveReplay : present + live ET replay (cas mixte).
  const liveViewers = getMatchedViewerDelegateIds(liveItems, lookup);
  const replayViewers = getMatchedViewerDelegateIds(replayItems, lookup);
  const checkedInOnly = new Set();
  const checkedInLive = new Set();
  const checkedInReplay = new Set();
  const checkedInLiveReplay = new Set();
  for (const id of checkedIn) {
    const sawLive = liveViewers.has(id);
    const sawReplay = replayViewers.has(id);
    if (sawLive && sawReplay) checkedInLiveReplay.add(id);
    else if (sawReplay) checkedInReplay.add(id);
    else if (sawLive) checkedInLive.add(id);
    else checkedInOnly.add(id);
  }

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

  // Membres NON inscrits (pseudo-delegues `isMemberViewer`, cf. useViewerMembers) :
  // jamais checked-in -> ils tombent dans liveOnly / both / replayOnly. On expose
  // leur part pour les identifier dans le total (sous-ensembles, pas des
  // composantes additionnelles).
  const memberIds = new Set();
  for (const d of delegates || []) if (d?.isMemberViewer && d.id) memberIds.add(d.id);
  const countMembers = (set) => {
    let n = 0;
    for (const id of set) if (memberIds.has(id)) n++;
    return n;
  };

  return {
    checkedIn,
    checkedInOnly,
    checkedInLive,
    checkedInReplay,
    checkedInLiveReplay,
    liveRemote,
    replayRemote,
    liveOnly,
    both,
    replayOnly,
    total,
    counts: {
      checkedIn: checkedIn.size,
      checkedInOnly: checkedInOnly.size,
      checkedInLive: checkedInLive.size,
      checkedInReplay: checkedInReplay.size,
      checkedInLiveReplay: checkedInLiveReplay.size,
      liveOnly: liveOnly.size,
      both: both.size,
      replayOnly: replayOnly.size,
      total: total.size,
      // Sous-ensembles "membres non inscrits" (inclus dans les compteurs ci-dessus).
      members: countMembers(total),
      membersLiveOnly: countMembers(liveOnly),
      membersBoth: countMembers(both),
      membersReplayOnly: countMembers(replayOnly),
    },
  };
}
