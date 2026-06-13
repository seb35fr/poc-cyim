# Statistics Registration — POC

Dashboard de statistiques pour les organisateurs de congrès. Application **standalone** qui se branche sur l'infrastructure existante (gateway GraphQL + cluster Elasticsearch) en **lecture seule**, sans rien modifier côté production. Tout le calcul des statistiques se fait **côté navigateur**.

## Ce que ça fait

À partir d'un `eventId`, l'app charge les délégués (GraphQL) et les données de consultation (Elasticsearch), puis affiche un tableau de bord complet : inscriptions, démographie/géographie, check-in & badges, audience en salle, suivi **live**/**replay**, scans de zone, et un onglet d'**exports** (CSV par session, parcours individuel, bilan Markdown + dump JSON).

## Stack

- **Vue 3** + **Vite 6** + **Vue Router** + **vue-i18n** (FR/EN)
- **Chart.js 4** + **vue-chartjs** : Doughnut, Bar, Line, StackedBar
- **chartjs-chart-geo** + **topojson-client** : cartes choroplèthes (monde, Europe, régions FR)
- Exports client-side : CSV, Markdown (destiné aux LLM) + dump JSON intégral

## Démarrage rapide

```bash
npm install
cp .env.example .env   # puis renseigner les variables ci-dessous
npm run dev
```

Ouvrir **`http://localhost:5174/{eventId}`** en remplaçant `{eventId}` par l'identifiant de l'événement.

> Comparer deux events : ajouter `?compareWith={autreEventId}` à l'URL → des sous-onglets « Comparatif » et des deltas apparaissent.

### Configuration (`.env`)

```env
VITE_GRAPHQL_URL=https://your-gateway-url/graphql
VITE_AUTH_TOKEN=your-bearer-token
VITE_ES_URL=http://es-cluster-host:9200
```

| Variable | Rôle |
|----------|------|
| `VITE_GRAPHQL_URL` | URL du gateway Apollo GraphQL (délégués, sessions, locations, branding) |
| `VITE_AUTH_TOKEN` | Token Bearer d'authentification (récupérable depuis l'interface `registration-admin`) |
| `VITE_ES_URL` | URL du cluster Elasticsearch (scans, live, replay) |

> **En développement**, Elasticsearch est appelé via le proxy Vite `/api/es` (cf. `vite.config.js`) qui forwarde vers `VITE_ES_URL`. **En production**, il faut exposer `/api/es` côté nginx vers le cluster ES interne. Le cluster ES n'a pas d'auth configurée.

## Sources de données

L'app ne possède aucune base : elle agrège deux sources en lecture seule.

```
                ┌────────────────────────┐
                │  Gateway Apollo (GQL)  │   VITE_GRAPHQL_URL
                ├────────────────────────┤
   délégués ◄───┤ searchDelegates (cursor, 500/page)
   sessions ◄───┤ event.children(SESSION)
   zones    ◄───┤ location(id){ name }   (libellés des zones)
   branding ◄───┤ event.config.branding  (nom + logo)
                └────────────────────────┘

                ┌────────────────────────┐
                │  Elasticsearch (5 idx) │   VITE_ES_URL  (proxy /api/es)
                ├────────────────────────┤
   audience ◄───┤ stats_user__onsite-audience-per-session-per-user   (scan salle)
   checkin  ◄───┤ stats_user__onsite_congress_checkin_per_user       (portique)
   zone     ◄───┤ stats_user__onsite_zone_checkin_per_user           (stands, lounges)
   live     ◄───┤ stats_user__live-view-duration-per-user-per-session
   replay   ◄───┤ stats_user__vod-view-per-user-per-session-per-origin
                └────────────────────────┘
```

Pagination ES en `search_after` (batch de `ES_BATCH_SIZE` = 2000). Auto-refresh optionnel toutes les 10 min (`AUTO_REFRESH_MS`), désactivé par défaut.

> **Transparence** : un bouton **base de données** dans le header (à droite du toggle FR/EN) ouvre une modale **« Données utilisées — détail technique »** listant les modèles GraphQL interrogés et les 5 index Elasticsearch. L'**écran de chargement** détaille aussi chaque récupération séparément (config · inscriptions · sessions — GraphQL ; vues live · replay · scans — Elasticsearch) avec un état spinner→✓ par source.

## Architecture

```
src/
├── api/
│   ├── graphql.js              # Fetch GraphQL : délégués, sessions, location, config (pagination curseur)
│   └── elasticsearch.js        # Client ES direct (search_after) — 5 index audience/checkin/zone/live/replay
├── composables/                # Sources réactives (1 instance / event, propagées en props)
│   ├── useStatistics.js        # Délégués + computeStats (KPIs, démo, inscriptions, temporel, badges…)
│   ├── useLive.js              # Vues live (ES) + sessions GraphQL → computeLiveStats
│   ├── useReplay.js            # Vues replay/VOD (ES) + sessions → computeReplayStats
│   ├── useRoomScans.js         # Scans salle/checkin/zone (ES) → computeScanStats + résolution noms de zone
│   ├── useBadgeTypeFilter.js   # Filtre global « type de badge »
│   ├── useDateRangeFilter.js   # Filtre global « plage de dates »
│   ├── useFilteredStats.js     # Stats recalculées selon les filtres locaux d'un onglet
│   ├── useExportMarkdown.js    # Export bilan Markdown + dump JSON intégral
│   └── useDiagnostics.js       # Bannière d'avertissements (sessions GQL manquantes…)
├── utils/                      # Calcul pur (testable, sans Vue)
│   ├── computeStats.js         # Toutes les stats d'inscription (getters lazy par section)
│   ├── computeLiveStats.js / computeReplayStats.js / computeScanStats.js
│   ├── participation.js        # Décompte dédoublonné « Total participants » (physique ∪ live ∪ replay)
│   ├── viewerJoin.js           # Jointure user_id Keycloak (ES) ↔ delegate Mongo (emailAddresses ACCOUNT)
│   ├── buildSessionAttendance.js  # Lignes « présence par session » (export CSV)
│   ├── buildDelegateJourney.js    # Parcours d'une personne (sessions salle + zones + live + replay)
│   ├── physicalReplay.js       # Présents physiques ayant consulté du replay
│   ├── checkinByType.js / generateAnalysis.js / burndown.js
│   ├── countries.js / frenchRegions.js / heatColor.js   # Géographie + échelle de couleur des cartes
│   ├── typeColors.js / formatters.js / formatDateLabel.js / parisTime.js / dateRange.js / exportCsv.js
├── components/
│   ├── charts/
│   │   ├── DoughnutChart.vue / HBarChart.vue / LineChart.vue / StackedBarChart.vue
│   │   ├── ChoroplethMap.vue   # Carte choroplèthe monde OU Europe (scope + outline de cadrage)
│   │   ├── FrenchRegionMap.vue / RegionalMaps.vue   # Carte France (régions INSEE) + DOM
│   │   └── KpiCompareGrid.vue  # Grille A | Δ | B (mode comparaison)
│   ├── tabs/
│   │   ├── OverviewTab.vue     # KPIs, décompo participants, modalité, cartes géo, engagement
│   │   ├── DemographicsTab.vue / RegistrationsTab.vue / TemporalTab.vue / DataTab.vue
│   │   ├── BadgesTab.vue       # Check-in, badges, cartes géo (monde + France)
│   │   ├── ViewersTab.vue      # Live OU Replay (KPIs, origines, sessions, engagement)
│   │   ├── ScansTab.vue        # Scans salle/entrée/zone (par jour, par zone, flux horaire)
│   │   ├── ExportsTab.vue      # Présence par session + Parcours par personne
│   │   ├── ComparisonTab.vue / ViewersComparisonTab.vue   # Vues comparatives (?compareWith=)
│   │   └── DayOfTab.vue
│   ├── SessionPresenceExport.vue  # Bloc réutilisable « présence par session » (présentiel/live/replay)
│   ├── CsvButton.vue / FilterBanner.vue / BadgeTypeFilter.vue / DiagnosticsBanner.vue / LanguageToggle.vue
├── i18n/                       # locales/fr.js + en.js, labels.js
├── views/StatisticsView.vue    # Layout : topbar, sidebar (onglets), filtres globaux, refresh
├── App.vue · main.js · constants.js
```

## Les onglets

La navigation (sidebar) regroupe certains onglets. Les sous-onglets « Comparatif » n'apparaissent qu'avec `?compareWith=`.

| Onglet | Contenu | Source |
|--------|---------|--------|
| **Vue d'ensemble** | KPIs, décomposition « Total participants », filtre **modalité** (présentiel/live/replay), **participants par jour** (histogramme groupé suivant la modalité), cartes géo (monde + Europe), engagement (sessions uniques/délégué), type de session + **sessions** (toutes, scroll) | GraphQL + ES |
| **Démographie** | Pays, continents, genre, professions, qualifications, sociétés | GraphQL |
| **Registration** (groupe) | **Inscriptions** (types, catégories, jours d'accès), **Dynamique** (courbes, hebdo), **Badges & Check-in** (progression, flux horaire, cartes monde + France), **Données** (table brute) | GraphQL + ES (badges) |
| **Live** | Délégués uniques, vues par origine, par jour & par chaîne, type de session + **sessions** (toutes, scroll), engagement | ES + GraphQL (sessions) |
| **Replay** | Délégués uniques + nouveaux/cumul par jour, type de session + **sessions** (par délégués / par vues, toutes, scroll), présents physiques ayant revu | ES + GraphQL (sessions) |
| **Scans QR** | Volumétrie salle/entrée/zone, cartes géo, scans de zone par jour, flux horaire, type de session + **sessions** (toutes, scroll), **détail** (filtre QR, modale par ligne) | ES + GraphQL (zones) |
| **Exports** | Présence par session (combiné + présentiel/live/replay), **scans de session / de zone** (enrichis), Parcours par personne, délégués check-in | GraphQL + ES |

> Les libellés de sessions des graphes sont préfixés de leur date (`JJ/MM : …`). La **ré-association QR** (cf. *Concepts clés*) rattache côté navigateur les scans que le pipeline a laissés sans `delegate_id`.

## Filtres globaux

Définis dans la barre du haut (`StatisticsView`), propagés à tous les onglets :

- **Plage de dates** — filtre par activité (check-in, vues live/replay) ; par défaut désactivé (toute la période).
- **Type de badge** — restreint la population de délégués.
- **Modalité de participation** (Vue d'ensemble) — `PHYSIQUE` / `LIVE` / `REPLAY` ; pilote la décomposition participants, les cartes géo et l'engagement de la page.

## Exports

- **Bouton CSV** sur chaque graphe (téléchargement immédiat des données affichées).
- **Export Markdown** (sidebar) → télécharge **deux fichiers** : un bilan `.md` exhaustif (destiné à un LLM) **et** un dump `.json` contenant 100 % des données ayant servi aux stats (délégués bruts + stats calculées + items live/replay/scans).
- **Onglet Exports** :
  - *Présence par session* — combiné, puis trois exports mono-source (présentiel, live, replay), filtrables par type de session ; un CSV par session.
  - *Parcours par personne* — à partir d'un email : toutes les sessions interagies (salle/live/replay) **et** les zones scannées ; indicateurs dissociés « présence en salle » / « présence en zone ».

## Concepts clés

- **Tout est calculé côté client** : aucune écriture, aucune modification backend.
- **Jointure ES ↔ délégué** (`viewerJoin.js`) : les vues live/replay sont indexées par `user_id` Keycloak ; on les rattache au délégué Mongo via `contact.emailAddresses[].source.id` de type `ACCOUNT`. Les scans (salle/zone) utilisent directement le `delegate.id` Mongo.
- **« Total participants » dédoublonné** (`participation.js`) : un même délégué ne compte qu'une fois (présence physique ∪ live ∪ replay).
- **Sessions uniques** : dans l'engagement, une session du programme vue via plusieurs canaux (salle + replay…) compte **une seule fois**.
- **Ré-association QR des scans** (`computeScanStats.js`) : quand le pipeline Flink n'a pas résolu un scan (`delegate_id = '-'`) alors que le badge/délégué existent, on le **rattache côté navigateur** via le QR (`raw_qr_code` ↔ `badges.qrCode`), **sans appel réseau** — et on en profite pour enrichir nom/email/type de badge/badgeId quand l'ES les laisse vides. Compteurs « ré-associés / non associés » + cellules surlignées dans le détail.

## Build

```bash
npm run build
npm run preview
```

## Limitations

- **Pas de temps réel** : données chargées au montage ; bouton *Rafraîchir* ou auto-refresh optionnel (10 min).
- **Performance** : chargement séquentiel (curseur GraphQL + batches ES) → quelques secondes pour les gros événements.
- **Elasticsearch en prod** : nécessite un proxy `/api/es` côté nginx ; le cluster ES n'a pas d'authentification.
- **Données ES dépendantes du pipeline** : si un index est vide (ex. portique d'entrée non scanné), les indicateurs correspondants restent à zéro.
- **Jointure imparfaite** : les viewers live/replay dont le `user_id` Keycloak n'est rattaché à aucun délégué apparaissent comme « non reconnus ».

---

_POC — périmètre service Registration (+ indices ES de consultation). Pas de croisement avec les autres microservices._
