# 04 — État, filtres & rafraîchissement

## 4.1 Le patron du « lift » — où vit l'état

Il n'y a **pas de bibliothèque de gestion d'état** : ni Pinia, ni Vuex. L'état réactif vit
dans des composables à base de `ref` / `computed` / `readonly`.

La règle structurante du PoC : **tout composable porteur d'un `setInterval` ou d'un appel
réseau est instancié une seule fois, dans `StatisticsView.vue`**, puis propagé aux onglets par
`props`.

```
StatisticsView.vue (propriétaire unique)
├── statsApi        = useStatistics(eventId)
├── liveApi         = useLive(eventId, { getDateRange })
├── replayApi       = useReplay(eventId, { getDateRange })
├── scansApi        = useRoomScans(eventId, { getDateRange, getBadgeTypes, getQrLookup })
├── dateFilter      = useDateRangeFilter(() => delegates)
├── badgeFilter     = useBadgeTypeFilter(() => delegates, () => compareDelegates)
└── si ?compareWith= :  compareApi · compareLiveApi · compareReplayApi · compareScansApi
```

**Pourquoi** — trois problèmes concrets que le composant autonome provoquait :

| Problème | Symptôme |
|---|---|
| appels réseau dupliqués | l'onglet Scans et l'onglet Exports fetchaient chacun les mêmes trois index |
| minuteries fantômes | un `setInterval` créé au montage d'un onglet survivait au rechargement à chaud de Vite |
| données absentes de l'export | l'export Markdown ne pouvait pas inclure les scans si l'onglet Scans n'avait jamais été ouvert |

Le lift résout les trois : une seule instance, disponible immédiatement pour tous les
consommateurs, et **chaque composable nettoie sa minuterie** par `onUnmounted(stopTimer)`. Il
n'y a **aucun cache au niveau du module**.

### Inventaire

| Composable | Charge | Expose |
|---|---|---|
| `useStatistics(eventId, {autoRefresh})` | délégués (GraphQL, curseur) + config | `loading`, **`configLoading`**, `refreshing`, `error`, `progress`, `stats`, `eventName`, `eventLogo`, `eventConfig`, `delegates`, `mobileAppId`, `nextRefreshAt`, `autoRefreshEnabled`, `setAutoRefresh`, `reload` |
| `useLive(eventId, {getDateRange})` | vues live (ES) + sessions (GraphQL) en `Promise.all` | `stats`, **`viewsLoading`** / **`sessionsLoading`** dissociés, `reload`, … |
| `useReplay(eventId, {getDateRange})` | idem pour la VOD | idem |
| `useRoomScans(eventId, {getDateRange, getBadgeTypes, getQrLookup})` | 3 index de scans en `Promise.all` + noms de zones | `audience`, `checkin`, `zone`, `zoneNames`, `stats`, `progress` (par index) |
| `useBadgeTypeFilter(getDelegates, getCompareDelegates)` | — | `selected` (`Set`), `allBadgeTypes`, `filteredDelegates`, `filteredCompareDelegates`, `toggle`, `clear`, `setSelection` |
| `useDateRangeFilter(getDelegates)` | — | `startYMD`, `endYMD`, `range`, `isDefault`, `reset` |
| `useFilteredStats(getDelegates, getMobileAppId, getDateRange)` | — | `filteredDelegates` + stats recalculées (filtre croisé **local à un onglet**) |
| `useDiagnostics` | — | `pushDiagnostic`, `dismissDiagnostic` (bus d'avertissements) |
| `useExportMarkdown` | — | génération du bilan Markdown + dump JSON |

`configLoading` est dissocié de `loading` pour une raison d'ergonomie précise : la
configuration de l'événement est une requête légère, elle est donc exposée **dès son arrivée**
sans attendre la pagination des délégués — l'écran de chargement peut ainsi afficher le titre
et le logo de l'événement en quelques centaines de millisecondes.

`useRoomScans` maintient un **cache des noms de zones à travers les rafraîchissements** : seuls
les `zone_id` encore inconnus sont résolus. La résolution est hors du chemin critique — son
échec est journalisé sans faire échouer le chargement des scans.

---

## 4.2 Filtre type de badge

Multi-sélection sur la **population de délégués**. Le type de badge d'un délégué est déterminé
par `delegateBadgeType(d)` : **premier badge en base**, à défaut **première inscription**.

Propagation : les onglets d'inscription reçoivent `pageDelegates` / `pageCompareDelegates`
(déjà filtrés) ; les scans sont filtrés sur leur champ `badge_type` ; Live et Replay filtrent
leur population de jointure.

Le composant `<BadgeTypeFilter>` ne porte **que l'interface** — l'état vit dans le composable,
ce qui garantit la persistance d'un onglet à l'autre.

---

## 4.3 Filtre plage de dates

C'est le mécanisme le plus subtil du PoC, et celui qu'il faut comprendre avant de le modifier.

### Portée volontairement restreinte

Le filtre s'applique **uniquement aux statistiques datées par une activité de présence ou de
consultation** :

| Appliqué à | Champ de référence |
|---|---|
| check-in physique | `checkedInDate` |
| vues live | `sessionEnd` (date de diffusion) |
| vues replay | `timestamp` (date de visionnage) |
| scans QR (salle, zone, entrée) | `timestamp` |

**Non appliqué** aux inscriptions (`createdAt`), aux badges délivrés (`deliveredAt`), à
l'onboarding, à la démographie, ni aux répartitions par type ou catégorie.

Le raisonnement : restreindre une plage de dates répond à la question « que s'est-il passé
pendant ces journées ? ». Le nombre d'inscrits ou la répartition géographique d'un congrès ne
sont pas des événements datés dans cette fenêtre — les filtrer produirait des chiffres
trompeurs.

### Le mécanisme de neutralisation par défaut

Les bornes par défaut sont **début = inscription la plus ancienne** (le `createdAt` minimum
sur les deux événements en mode comparaison) et **fin = aujourd'hui**. Mais tant que
l'utilisateur n'a modifié **aucune** borne, `isDefault` vaut `true` et :

```js
const effectiveDateRange = computed(() => (isDateDefault.value ? null : dateRange.value));
```

→ **`null` est transmis, donc aucun filtrage n'a lieu.**

**Pourquoi ce garde est indispensable** : les items Elasticsearch n'ont pas toujours un
horodatage de visionnage fiable. Le regroupement retombe alors sur `session_start` ou
`session_end`, qui peut tomber **hors** de la plage par défaut. Sans neutralisation, ouvrir le
dashboard afficherait un Live à zéro — un faux négatif spectaculaire. Le filtre ne s'active
donc **qu'après une action explicite** de l'utilisateur.

Ce garde est un **contournement d'un défaut de qualité de données amont**, pas un choix
d'ergonomie. Il disparaîtra quand le mapping Elasticsearch exposera un horodatage de vue
typé et systématique.

### Propagation

```js
pageStats = computeAllStats(pageDelegates, mobileAppId, effectiveDateRange)
// + :date-range="effectiveDateRange" passé aux onglets
// + getDateRange: () => effectiveDateRange.value passé aux composables ES
```

### Angle mort connu

Les cartes choroplèthes de l'onglet Badges (`RegionalMaps`) sont **filtrées par type de badge
mais pas par date** : elles consomment la liste brute de délégués et non les stats calculées.
Les KPI et graphiques passant par `useFilteredStats` le sont, eux, correctement.

---

## 4.4 Filtrage croisé (local à un onglet)

Indépendamment des deux filtres globaux, chaque onglet peut utiliser
`useFilteredStats(getDelegates, getMobileAppId, getDateRange)`. Cliquer sur un segment de
graphique filtre les délégués et **recalcule les sections consultées** dans cet onglet. Les
graphiques acceptent une prop `activeLabel` pour estomper les segments non sélectionnés.

Deux propriétés à connaître :

- **L'état est propre à l'onglet et perdu au changement d'onglet** : le `v-if` détruit et
  recrée le composant. C'est assumé — les filtres globaux, eux, persistent.
- **Un libellé traduit doit être comparé sur sa valeur localisée.** Quand une catégorie est
  produite en français canonique par `computeStats` puis traduite à l'affichage, le prédicat de
  filtre doit comparer la valeur **localisée** — ou conserver la valeur brute comme étiquette et
  comparer le brut. C'est le cas dans `DemographicsTab` (continents, genre), `BadgesTab`
  (appareil) et `TemporalTab` (jours de semaine). Oublier ce point produit un filtre qui ne
  renvoie rien en anglais.

---

## 4.5 Rafraîchissement automatique

| Paramètre | Valeur | Constante |
|---|---|---|
| intervalle | 10 minutes | `AUTO_REFRESH_MS` |
| tic du compte à rebours | 10 secondes | `COUNTDOWN_TICK_MS` |

**Le rafraîchissement automatique est désactivé par défaut** et pilotable à l'exécution par un
interrupteur dans la barre latérale (`setAutoRefresh(true/false)`). L'événement de comparaison
est toujours chargé **sans** rafraîchissement automatique.

Les quatre sources partagent la même cadence, par souci de prévisibilité pour l'utilisateur.
Le rafraîchissement manuel affiche une confirmation ; pendant l'opération, une barre de
progression apparaît **au-dessus** du contenu sans le remplacer (`refreshing` distinct de
`loading`).

Chaque composable nettoie sa minuterie par `onUnmounted(clearInterval)`. Il n'y a ni cache
au niveau du module, ni minuterie survivante après démontage.

**Limite** : le rafraîchissement recharge **tout** — aucun mécanisme différentiel ou
incrémental. Sur un gros congrès, c'est plusieurs secondes de requêtes toutes les 10 minutes.

---

## 4.6 Bus de diagnostics

`useDiagnostics` expose `pushDiagnostic` / `dismissDiagnostic`.
`<DiagnosticsBanner>`, monté globalement dans `App.vue`, affiche des notifications fixes en
haut à droite.

Le principe de sélection : **on n'affiche à l'utilisateur que les anomalies sur lesquelles il
peut agir.**

| Cas | Message | Persistance |
|---|---|---|
| couverture Keycloak < 50 % côté délégués | invite à prévenir l'équipe technique — la jointure live/replay va manquer du monde et le KPI « sans présence physique » devient silencieusement faux | **persistant** (pas d'auto-effacement) |
| échec de `fetchEventSessions` | titres, types et durées de session manquants — notification distincte pour Live et pour Replay | standard |

Le faible taux de rapprochement **côté Elasticsearch** reste en `console.warn` : c'est un
problème du pipeline Flink, l'administrateur n'y peut rien.

Une **empreinte partagée** entre `console.warn` et `pushDiagnostic` évite la duplication quand
un `computed` se recalcule sur le même jeu de données.
