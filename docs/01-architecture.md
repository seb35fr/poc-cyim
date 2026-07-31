# 01 — Architecture & runtime

## 1.1 Positionnement

`statistics` est une **application front autonome**, hors du monorepo applicatif
`congress/microservices/`. Elle se branche en **lecture seule** sur l'infrastructure de
production existante et n'écrit **jamais** : aucune mutation GraphQL, aucun `_update`
Elasticsearch, aucun événement Kafka produit.

Conséquences directes de ce positionnement :

- **Aucun déploiement backend n'est requis** pour la faire fonctionner — c'est ce qui a permis
  de la livrer vite.
- **Aucune donnée n'est persistée** : chaque chargement de page refait l'intégralité des
  requêtes. Il n'y a ni cache serveur, ni cache navigateur applicatif (seul le cache HTTP
  standard s'applique).
- **Le navigateur porte toute la charge de calcul.** Sur un congrès de 15 000 délégués et
  100 000 scans, c'est le poste de travail de l'utilisateur qui agrège.

Le PoC recouvre fonctionnellement le microservice `congress/microservices/xlsx-stats` sur le
périmètre des scans sur site (audience par session, check-in d'entrée, accès aux zones) : les
deux lisent **les mêmes index Elasticsearch**.

## 1.2 Les cinq couches

```
┌──────────────────────────────────────────────────────────────────────┐
│  5. PRÉSENTATION            views/ · components/tabs/ · components/charts/
│     Vue 3 SFC, Chart.js, CSS maison
├──────────────────────────────────────────────────────────────────────┤
│  4. ÉTAT RÉACTIF            composables/
│     useStatistics · useLive · useReplay · useRoomScans
│     useBadgeTypeFilter · useDateRangeFilter · useFilteredStats · useDiagnostics
├──────────────────────────────────────────────────────────────────────┤
│  3. CALCUL (pur, sans Vue)  utils/
│     computeStats · computeScanStats · computeLiveStats · computeReplayStats
│     viewerJoin · participation · build*Export · generateAnalysis
├──────────────────────────────────────────────────────────────────────┤
│  2. ACCÈS DONNÉES           api/
│     graphql.js (gqlFetch + 5 opérations)   ·   elasticsearch.js (5 index)
├──────────────────────────────────────────────────────────────────────┤
│  1. TRANSVERSE              i18n/ · constants.js · utils/formatters · utils/debug
└──────────────────────────────────────────────────────────────────────┘
```

La règle de dépendance est respectée de haut en bas : **la couche 3 (calcul) n'importe
jamais Vue**, ce qui la rend directement portable et testable — c'est la propriété qui rend
l'extraction d'une bibliothèque `stats-core` réaliste (cf. plan de migration, lot L4).

Deux exceptions à cette pureté, à connaître :

| Fichier | Écart | Raison |
|---|---|---|
| `utils/viewerJoin.js` | importe `useDiagnostics` et `i18n` | émet un avertissement UI quand la couverture Keycloak est basse |
| `utils/generateAnalysis.js`, `composables/useExportMarkdown.js` | utilisent `i18n.global.t` | l'analyse textuelle exportée suit la langue active |

## 1.3 Flux de données

```
   NAVIGATEUR
   ┌─────────────────────────────────────────────────────────────────────────┐
   │  StatisticsView.vue  ─ propriétaire de TOUT l'état réactif partagé      │
   │                                                                         │
   │   useStatistics ──┐                                                     │
   │   useLive ────────┤                                                     │
   │   useReplay ──────┼──► pageStats / pageDelegates ──► onglets (props)   │
   │   useRoomScans ───┤                                                     │
   │   badgeFilter ────┤                                                     │
   │   dateFilter ─────┘                                                     │
   └───────┬──────────────────────────────────────────┬──────────────────────┘
           │ GraphQL POST (Bearer .env)               │ HTTP POST /_search
           │ dev : proxy Vite /api/graphql            │ dev : proxy Vite /api/es
           ▼                                          ▼
   ┌──────────────────────┐              ┌──────────────────────────────────┐
   │   Apollo Gateway     │              │   Elasticsearch (5 index)        │
   │   (fédération)       │              │   sans authentification          │
   └──────────┬───────────┘              └────────────────▲─────────────────┘
              │                                           │  sink
   registration · contacts ·                     ┌────────┴────────┐   Kafka
   event-microservice · location                 │   Flink SQL     │◄── cyim.webhooks
              │                                  └─────────────────┘    (app de scan)
              ▼                                                          SI-views (live/VOD)
        MongoDB (prod)
```

Point structurant : **les deux sources sont indépendantes et jointes côté navigateur.**
La jointure ES ↔ délégué n'existe nulle part côté serveur ; elle est refaite à chaque
chargement (cf. [03 — Modèle de calcul](03-modele-calcul.md#33-jointures)).

## 1.4 Bootstrap — ce qui s'exécute au démarrage

`src/main.js` (54 lignes) fait exactement quatre choses, dans cet ordre :

1. **Enregistrement Chart.js** — `ArcElement`, `BarElement`, `LineElement`, `PointElement`,
   `CategoryScale`, `LinearScale`, `Tooltip`, `Legend`, `Filler` + le plugin
   `chartjs-plugin-datalabels`.
2. **Défauts Chart.js** — police `Poppins` 14 px, et surtout
   `Chart.defaults.plugins.datalabels.display = false` : les datalabels sont **désactivés
   globalement** et réactivés au cas par cas. Certains graphiques contournent ce défaut par
   des **plugins Chart.js locaux** qui dessinent les totaux en bout de barre.
3. **Routeur** — deux routes seulement (cf. §1.6).
4. **Montage** — `createApp(App).use(router).use(i18n).mount("#app")`.

Il n'y a **ni Pinia, ni garde de route, ni initialisation d'authentification** : le token est
lu directement depuis `import.meta.env` au premier appel réseau.

## 1.5 Cycle de vie d'un chargement

```
1. Route /:eventId  →  StatisticsView monté
2. useStatistics(eventId) : appel immédiat de load() (pas d'attente de onMounted)
   ├─ fetchEventConfig()  ─── résolu tôt ──► eventName/eventLogo affichés
   │                                         dans l'écran de chargement
   └─ fetchAllDelegates() ─── pagination curseur 500/page, onProgress par page
3. En parallèle (instanciés dans le même setup) :
   ├─ useLive     : fetchLiveViews (ES)    + fetchEventSessions (GraphQL)  [Promise.all]
   ├─ useReplay   : fetchReplayViews (ES)  + fetchEventSessions (GraphQL)  [Promise.all]
   └─ useRoomScans: fetchRoomAudience + fetchCongressCheckin + fetchZoneAccess (ES)
                    puis fetchLocationNames (GraphQL) pour les libellés de zones
4. computeAllStats(delegates, mobileAppId, dateRange) → objet à getters LAZY
5. Premier accès à stats.global par le template → calcul de la section « global » seulement
6. Rendu de l'onglet actif
```

L'écran de chargement affiche **une ligne par source réellement en cours** (`loadingSources`
dans `StatisticsView`), avec un état `spinner → ✓` : Configuration, Inscriptions, Sessions du
programme, Vues live, Vues replay, Scans QR. Les sous-états `viewsLoading` (Elasticsearch) et
`sessionsLoading` (GraphQL) de `useLive`/`useReplay` sont dissociés précisément pour alimenter
cet affichage.

## 1.6 Routage

| Route | Composant | Note |
|---|---|---|
| `/:eventId` | `views/StatisticsView.vue` (import dynamique) | `props: true` ; l'`eventId` est **obligatoire** |
| `/` | redirection → `/no-event` | route inexistante → écran d'erreur |

Un unique paramètre de requête est interprété : **`?compareWith=<autreEventId>`**. Sa présence
déclenche l'instanciation d'un **second jeu complet de composables** (`compareApi`,
`compareLiveApi`, `compareReplayApi`, `compareScansApi`) et l'apparition des onglets
comparatifs. Le second événement est chargé **sans auto-refresh**.

Il n'y a **aucune garde de route ni vérification de permission** : quiconque atteint l'URL
avec un token valide voit toutes les données de l'événement.

## 1.7 Dépendances

**Production** (9 paquets, tous publics) :

| Paquet | Version | Rôle |
|---|---|---|
| `vue` | ^3.5.13 | framework |
| `vue-router` | ^4.5.0 | routage |
| `vue-i18n` | ^11.4.4 | internationalisation FR/EN |
| `chart.js` | ^4.4.6 | moteur de graphiques |
| `vue-chartjs` | ^5.3.2 | intégration Vue |
| `chartjs-chart-geo` | ^4.3.3 | cartes choroplèthes |
| `chartjs-plugin-datalabels` | ^2.2.0 | étiquettes sur les graphiques |
| `topojson-client` | ^3.1.0 | décodage des fonds de carte |
| `xlsx` | ^0.18.5 | export XLSX multi-onglets (**import dynamique**) |

**Développement** : `vite` ^6.0.0, `@vitejs/plugin-vue` ^5.2.1.

À noter :

- **Aucune dépendance `@platform/*` ni `@congress/*`** — le PoC n'utilise pas le registre npm
  privé CYIM, donc aucun composant, client ou thème maison.
- **Aucun outil de qualité** : pas d'ESLint, pas de Prettier, pas de TypeScript, pas de Vitest.
- `xlsx` est chargé en **import dynamique** dans `utils/exportXlsx.js` : le *chunk* n'est
  téléchargé qu'au premier export industrie, ce qui évite d'alourdir le *bundle* initial.
- `d3-geo` est mentionné dans `CLAUDE.md` mais **n'est pas dans `package.json`** — la
  projection Lambert des cartes France repose sur ce qui est disponible via
  `chartjs-chart-geo`, avec repli Mercator.

## 1.8 Alias de module

`vite.config.js` définit un seul alias : **`@/` → `/src/`**. Les imports récents l'utilisent
(`@/utils/...`) ; des imports relatifs historiques (`../../utils/...`) subsistent et restent
valides. Aucune migration forcée n'a été faite — les deux formes cohabitent, y compris dans
un même fichier (`StatisticsView.vue` importe ses composables en `@/` et ses onglets en
`../components/`).
