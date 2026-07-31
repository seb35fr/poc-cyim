# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

POC statistics dashboard for CYIM congress registration. Standalone Vue 3 SPA that connects to the existing Apollo GraphQL gateway to display delegate statistics per event. No backend modifications required — all stats are computed client-side.

## Commands

```bash
npm run dev       # Dev server on http://localhost:5174
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

Access the app at `http://localhost:5174/{eventId}` — the eventId is required in the URL.

## Configuration

Copy `.env.example` to `.env` with:
- `VITE_GRAPHQL_URL` — Apollo Gateway GraphQL endpoint
- `VITE_AUTH_TOKEN` — Bearer token (grab from registration-admin browser session)
- `VITE_ES_URL` — base URL du cluster Elasticsearch (defaut `http://192.168.201.176:9200`, proxy dev `/api/es`)

## Stack

Vue 3 + Vite 6 + Vue Router + Chart.js 4 (vue-chartjs) + chartjs-chart-geo (cartes monde/Europe/FR) + d3-geo (Lambert projection FR, fallback mercator) + chartjs-plugin-datalabels + **vue-i18n** (bilingue FR/EN). No UI framework (custom CSS with CSS variables defined in `App.vue`). **Exports** : Markdown (destiné aux LLM) **+ dump JSON intégral** (téléchargés ensemble), **CSV par session** (combiné + mono-source présentiel/live/replay), **CSV par graphe**, et **XLSX par industrie** (SheetJS `xlsx`, en **import dynamique** → chunk chargé à la demande ; 1 fichier par organisation, onglets Live/Replay/On site). Les exports PDF/PPTX ont été retirés.

**Vite alias** : `@/` → `/src/` (configuré dans `vite.config.js`). Tous les nouveaux imports utilisent `@/utils/...` au lieu de `../../utils/...`. Les imports legacy `../../` restent valides — pas de migration forcée.

Sources de données :
- **Apollo Gateway** (GraphQL) : délégués + config event + sessions (`event(id).children(eventType: SESSION)`)
- **Elasticsearch direct** (proxy `/api/es` en dev) : scans onsite (audience, checkin, zone), live views, VOD replay views

## Architecture

**Data flow:** `api/graphql.js` fetches all delegates via cursor-paginated `searchDelegates` (500/page) + event config via `getEvent` → `utils/computeStats.js` computes statistics lazily (getter par section) → composable `useStatistics` exposes reactive state + auto-refresh every 10 min → tab components render charts with cross-filtering via `useFilteredStats`. Live/Replay/Scans + les **2 filtres globaux** (`badgeFilter` type de badge, `dateFilter` plage de dates) sont **liftés** au niveau `StatisticsView` et propagés en prop aux tabs (cf. section **Filtres globaux**).

**Key layers:**

| Layer | Files | Role |
|-------|-------|------|
| API | `src/api/graphql.js` | Apollo Gateway : `searchDelegates`, `getEvent` (config + mobileAppId), `fetchEventSessions`. Wrapper `gqlFetch` log opName + elapsed + timeout detection. |
| | `src/api/elasticsearch.js` | ES direct (proxy `/api/es`) : `fetchRoomAudience`, `fetchCongressCheckin`, `fetchZoneAccess`, `fetchLiveViews`, `fetchReplayViews` |
| Computation | `src/utils/computeStats.js` | **Lazy** `computeAllStats(delegates, mobileAppId, dateRange?)` : objet à getters par section (`global`, `demographics`, `registrations`, `temporal`, `checkinFlow`, `badges`, `onboarding`, `mobileApp`), calcul mémoïsé au 1er accès. `dateRange` (optionnel) n'est appliqué QU'AU **check-in** (`global.checkedInCount` + `checkinFlow`) — cf. **Filtres globaux**. |
| | `src/utils/computeScanStats.js` | Agrège les 3 index ES de scans onsite. `computeAllScanStats({audience,checkin,zone}, {dateRange?, badgeTypes?, qrLookup?})` : filtre les scans par timestamp (date) et par `badge_type`. Expose `audienceUniqueDelegateSessions` (= « vues en salle »). Conserve le `_source` ES brut (`scan.raw`) pour la modal détail. **`buildQrDelegateLookup(delegates)`** (exporté) construit une `Map<clé → délégué>` indexée **par QR** (`qrCode.value` + `decodedValue`, normalisation multi-clés) **ET par `delegateId`** ; passée en `qrLookup`, elle (1) **ré-associe** les scans `delegate_id = '-'` via le QR, (2) **enrichit** `fullName`/`email`/`badgeType`/`badgeId` quand l'ES les laisse vides (placeholder `'-'` traité comme vide via `isBlankField`). `fullName` enrichi au format `givenName familyName (delegateId)`. Flags par champ (`*Enriched`) pour le marquage UI. `global.recoveredScans` / `global.unmatchedScans` exposent les compteurs. Cf. **Ré-association QR**. |
| | `src/utils/computeLiveStats.js` | Normalise hits live + enrichit via `sessionMap` (GraphQL). `computeLiveStats(hits, sessionMap, dateRange?)` filtre par **`sessionEnd`** (date de diffusion). Le label de chaîne (`uniqueByDayByChannel.channels[].label`) vient de **`channel_name`** (champ exposé par l'index ES live, cf. `xlsx-stats/main.js`), avec fallback `Chaîne N` (tri par volume) si absent. |
| | `src/utils/computeReplayStats.js` | Idem pour VOD replay. `computeReplayStats(hits, sessionMap, dateRange?)` filtre par **`timestamp`** de visionnage. |
| | `src/utils/dateRange.js` | `makeInRange(dateRange)` → prédicat `(date) => bool` partagé (registration + ES) pour le filtre date global. |
| Composables | `src/composables/useStatistics.js` | Délégués + config, auto-refresh 10 min. **`configLoading`** exposé séparément (config event remontée dès qu'elle arrive, sans attendre les délégués → loader affiche titre/logo tôt). `debug.log` (DEV-only) des délégués checkedIn sans badge délivré |
| | `src/composables/useFilteredStats.js` | Cross-filtering : filtre delegates + recompute stats. Signature `(getDelegates, getMobileAppId?, getDateRange?)` — `getDateRange` propage le filtre date global (appliqué au check-in). Expose `filteredDelegates`. |
| | `src/composables/useRoomScans.js` | Scans onsite (audience + checkin + zone) en parallèle. **Lifté StatisticsView**. Options `{ getDateRange, getBadgeTypes, getQrLookup }` → filtre date + badge type + **lookup QR→délégué** pour la ré-association/enrichissement (cf. **Ré-association QR**). Cleanup `onUnmounted(clearInterval)`. |
| | `src/composables/useLive.js` | Live views ES + sessions GraphQL en `Promise.all`. **Lifté StatisticsView**. Option `{ getDateRange }`. Sous-états **`viewsLoading`** (ES) / **`sessionsLoading`** (GraphQL) dissociés (loader). Cleanup `onUnmounted`. |
| | `src/composables/useReplay.js` | Idem pour VOD replay. Option `{ getDateRange }`. Sous-états `viewsLoading` / `sessionsLoading`. (Dumps ES en `debug.*`, no-op en PROD.) |
| | `src/composables/useBadgeTypeFilter.js` | Filtre **global** type de badge (lifté StatisticsView). Expose `selected` (Set), `allBadgeTypes`, `filteredDelegates`, `filteredCompareDelegates`, `toggle`, `clear`, `setSelection`. Persiste cross-tab. |
| | `src/composables/useDateRangeFilter.js` | Filtre **global** plage de dates (lifté StatisticsView). Expose `startYMD`/`endYMD` (computed get/set), `range` ({start,end} ms), `isDefault`, `reset`. Défaut : début = inscription la plus ancienne (des 2 events), fin = aujourd'hui. |
| | `src/composables/useDiagnostics.js` | Bus de diagnostics UI (`pushDiagnostic`, `dismissDiagnostic`). Affiche des toasts top-right pour les anomalies data actionnables par l'admin. |
| | `src/composables/useExportMarkdown.js` | **Export MD (LLM) + dump JSON intégral** : télécharge `bilan-*.md` (stats + live + replay + scans + comparaison + analyse textuelle) **et** `donnees-*.json` (100 % des données source : délégués bruts + stats matérialisées + items live/replay/scans). Lecture directe des stats objects, pas de DOM walking. |
| View | `src/views/StatisticsView.vue` | Sidebar hiérarchique + **toolbar de filtres globaux** (plage de dates + type de badge). Propriétaire (lifted) de `liveApi`/`replayApi`/`scansApi` (+ `compareLiveApi`/`compareReplayApi`/`compareScansApi` si `?compareWith=`), `badgeFilter`, `dateFilter`. Calcule `pageStats`/`pageDelegates` (filtrés) passés aux tabs. Met à jour `document.title` selon l'event (et l'event comparé). Bouton export Markdown + **bouton « base de données »** (icône cylindre, à droite du toggle FR/EN) → modale `DataSourcesInfo`. **Écran de chargement** : carte avec **logo + titre de l'event** (remontés tôt par `useStatistics`) + **liste des sources chargées en parallèle, DISSOCIÉES par récupération réelle** (`loadingSources`) : Configuration (GraphQL) · Inscriptions (GraphQL) · Sessions du programme (GraphQL, `sessionsLoading`) · Vues live (ES, `viewsLoading`) · Vues replay (ES) · Scans QR (ES + noms de zones GraphQL) — spinner→✓ par ligne. |
| Tabs | `src/components/tabs/*.vue` | OverviewTab, DemographicsTab, RegistrationsTab, TemporalTab, BadgesTab, DataTab, ComparisonTab, ScansTab, **ViewersTab** (kind='live'\|'replay'), **ViewersComparisonTab** (générique), ExportsTab |
| Charts | `src/components/charts/*.vue` | DoughnutChart, HBarChart (espacement garanti via `categoryPercentage`/`barPercentage` + `maxBarThickness` ; `layout.padding.right` pour ne pas rogner le datalabel en bout de barre), LineChart, StackedBarChart (avec `@select` + `activeLabel` + `showTotal`), ChoroplethMap (**`scope` monde\|europe** + `outline` de cadrage Europe + `showLegend` échelle dégradée), FrenchRegionMap. **Composants composites** : `RegionalMaps.vue` (monde + FR + DOM, prop `showScaleLegend`), `KpiCompareGrid.vue` (grille KPI 3-col A∣Δ∣B partagée ComparisonTab + ViewersComparisonTab) |
| Tooltips UI | `src/components/InfoTooltip.vue` | Petit bouton « i » rond + bulle d'explication (CSS pur, ouverture au survol/focus ; bulle en **`v-html`** → HTML léger autorisé, `aria-label` = texte brut). Posé dans les `<h3>` de cartes via `<InfoTooltip :text="t('ns.xxxHint')" />`. `align` (`left` défaut/`right`). Présent sur Overview, Demographics, Registrations, Temporal, Badges, Scans, Viewers + ViewersComparison + Comparison + colonnes ambiguës de DataTab. **Pas** sur Exports (descriptions déjà visibles). |
| Modales | `src/components/ScanDetailModal.vue` | Détail d'une ligne de scan : `_source` ES brut (`ES`) + délégué/badge rapprochés (`APP`). Props `row` ({scan, delegate, badge}), `@close`. |
| | `src/components/ScanDetailTable.vue` | Table « Détail des scans » extraite de ScansTab : filtres (type/date/QR), pagination, note de ré-association, bouton « Détails » → `ScanDetailModal`. Props `scans`/`delegates`/`zoneNames`/`recovered`/`unmatched`. |
| | `src/components/DataSourcesInfo.vue` | Modale **« Données utilisées — détail technique »** (bouton cylindre du header) : liste les **modèles GraphQL** interrogés (`getEvent().config`, `searchDelegates`, `children(SESSION)`, `location`) et les **5 index Elasticsearch** (importe `INDEX` pour rester synchro). Lecture seule, alimentés par Flink. |
| Filter UI | `src/components/FilterBanner.vue` | Filtres cross-clic actifs avec boutons d'effacement |
| | `src/components/BadgeTypeFilter.vue` | Pills multi-select badge type. Composant UI seul, l'état vient de `useBadgeTypeFilter`. |
| Diagnostics UI | `src/components/DiagnosticsBanner.vue` | Toasts fixed top-right alimentés par `useDiagnostics`. Monté globalement dans `App.vue`. |
| CSV | `src/components/CsvButton.vue` | Bouton de téléchargement CSV (props `label` + `primary` pour accentuer un export), `src/utils/exportCsv.js`. `src/components/SessionPresenceExport.vue` : bloc réutilisable « présence par session » mono-source (présentiel/live/replay) avec recherche + filtre type de session + **filtre organisation** + colonne **Organisateur**. `src/utils/exportXlsx.js` : `downloadWorkbook` multi-onglets (SheetJS, import dynamique) pour l'export industrie. |
| Utils | `src/utils/formatters.js` | `fmt(n)`, `pct(a, b)`, `shortName(name, maxLen)`, `formatDurationHMS(sec)` — partagés (avant : 15 redéfinitions dans les tabs) |
| | `src/utils/debug.js` | Wrapper `debug.log` / `debug.table` no-op en PROD via `import.meta.env.DEV` |
| | `src/constants.js` | `AUTO_REFRESH_MS`, `COUNTDOWN_TICK_MS`, `DELEGATES_PAGE_SIZE`, `SLOW_QUERY_THRESHOLD_MS`, `ES_BATCH_SIZE` |
| | `src/utils/viewerJoin.js` | Jointure ES `user_id` (Keycloak ACCOUNT) ↔ délégué Mongo. `buildDelegateLookup`, `getRemoteOnlyDelegateIds`, `getCheckedInDelegateIds`, `hasValidCheckin`, `getKeycloakId`, **`getRpps`** (helpers délégué **canoniques** — dédupliqués depuis buildSessionAttendance/buildDelegateJourney/buildCheckedInDelegates/DataTab). **Warnings auto** si jointure suspecte. |
| | `src/utils/participation.js` | `computeParticipation(delegates, liveItems, replayItems, {datasetLabel?, dateRange?})` : décomposition **dédoublonnée** "Total participants". Présents physiques scindés en `checkedInOnly` / `checkedInLive` (live sans replay) / `checkedInReplay` (replay, ± live) ; distanciels en `liveOnly` / `both` / `replayOnly` ; + `total`. Source unique OverviewTab + export MD. `dateRange` filtre le check-in. S'appuie sur `viewerJoin.js`. |
| | `src/utils/physicalReplay.js` | `buildPhysicalReplayByDay` / `buildPhysicalReplayCumulative(items, lookup)` : funnel « présent physique PUIS revu en replay » (séries journalière + cumulée). Utilisé par ViewersTab + ViewersComparisonTab (replay). |
| | `src/utils/countries.js` | Country code ↔ continent/flag |
| | `src/utils/frenchRegions.js` | Mapping département (2 chars du zipCode) → région INSEE + libellés |
| | `src/utils/parisTime.js` | `parisDateParts(iso)` (UTC→Paris CET/CEST), `parisDay(iso)`, `parisDateTime(iso)`. **`toEpochMs(ts)`** : source unique de l'heuristique Flink ms/secondes (number/string/ISO → epoch ms) — utilisée partout au lieu de redupliquer `< 10**12`. **`wallClock(ts)`** : heure **murale sans conversion** (TIMESTAMP naive sans `Z`, ex. `session_start` SI-views). **`sessionDateShort(start)`** : date courte « JJ/MM » pour préfixer un libellé de session — gère instant UTC (→ Paris) ET murale naive (lue telle quelle). |
| | `src/utils/typeColors.js` | Palette déterministe par type d'inscription (hash sur libellé), 12 couleurs |
| | `src/utils/heatColor.js` | Échelle de chaleur partagée (gris→vert→orange→rouge) pour les cartes |
| | `src/utils/burndown.js` | Courbes de décroissance (restants à check-in) absolue/relative, paramétrable par step (15 min / 30 min) |
| | `src/utils/checkinByType.js` | Bar horizontale stacked check-in/restants par type de badge (partagé BadgesTab + ComparisonTab) |
| | `src/utils/buildSessionAttendance.js` | Croise scans audience + live + replay pour une session — CSV « présence par session ». Sérialiseurs combiné + mono-source (`physical`/`live`/`replay`) via `filterAttendanceBySource`. Marqueurs **`YES`/`NO`**. Les exports mono-source portent une colonne **« Session organisateur »** (avant le titre, depuis `session.organizer`). Exporte `delegateCoreFields(d)` + `getRpps(d)` (réutilisés par `buildScanExport`). |
| | `src/utils/buildScanExport.js` | Export **à plat** des scans (1 ligne = 1 scan) enrichi délégué + type de badge. `buildZoneScanRows` (scans de zone) et `buildSessionScanRows` (scans de salle/audience, avec **Début/Fin session** depuis les sessions GraphQL UTC→Paris, repli `wallClock` sur `session_start` brut, **+ colonne « Session organisateur »** avant le titre = `scan.industryName` ES, repli `organizers` GraphQL via `sessionOrganizerById`). Colonne `Rapproché` O/N. Source = scans déjà récupérés/enrichis (cf. **Ré-association QR**). |
| | `src/utils/buildDelegateJourney.js` | Parcours d'une personne : 1 ligne par session interagie (salle/live/replay) **+ par zone scannée** (stands, lounges). Présence physique **dissociée salle/zone** ; colonne CSV « Nature » (Session/Zone). Marqueurs `YES`/`NO`. |
| | `src/utils/generateAnalysis.js` | Analyse textuelle (présence, no-show, mix, comparatif Δ pts, etc.) — utilisée dans l'export MD |

**Stats object structure** (returned by `computeAllStats`) — getters lazy : `{ global, demographics, registrations, temporal, checkinFlow, badges, onboarding, mobileApp }`. Chaque tab consomme un sous-ensemble (typiquement 2-3 sections), ce qui évite de recalculer les sections inutiles à chaque cross-filter.

**Navigation hiérarchique (sidebar) :**
- Vue d'ensemble (leaf)
- Démographie (leaf)
- **Registration** (groupe non cliquable) → Inscriptions · Dynamique · Badges & Check-in · Données · Comparatif (conditionnel `?compareWith=…`)
- Live (leaf, ou groupe Single/Comparatif si `?compareWith=…`)
- Replay (idem)
- Scans QR (leaf)
- Exports (leaf — interface de génération CSV par session)

Le node "Registration" est un simple groupe (header non cliquable). "Exports" est l'onglet de génération CSV par session.

**Cross-filtering:** Each tab uses `useFilteredStats(getDelegates, getMobileAppId)` independently. Clicking a chart segment filters delegates and recomputes all stats within that tab. Charts accept `activeLabel` prop to dim non-selected segments. Filter state resets when switching tabs (v-if destroys/recreates components).

### Filtres globaux (toolbar persistante)

Une **toolbar** en haut du contenu (`StatisticsView`, classe `.global-filters`) porte 2 filtres **liftés** et appliqués à la source, **persistants sur tous les onglets/sous-onglets** :

**1. Type de badge** (`useBadgeTypeFilter`) — multi-select. Filtre la **population** de délégués (`delegateBadgeType(d)` = 1er badge en base, sinon 1ère registration). Propagé partout : tous les onglets registration reçoivent `pageDelegates`/`pageCompareDelegates` (déjà badge-filtrés) ; les scans sont filtrés par `badge_type` ; Live/Replay filtrent leur population de jointure. Le composant `<BadgeTypeFilter>` ne gère que l'UI ; l'état vit dans le composable.

**2. Plage de dates** (`useDateRangeFilter`) — début/fin. **Portée volontairement restreinte aux statistiques datées par une activité de présence/consultation** :
- **Check-in physique** (`checkedInDate`), **Live** (`sessionEnd`), **Replay** (`timestamp` de visionnage), **Scans QR** salle/zone/checkin (`timestamp`).
- **PAS** appliqué aux inscriptions (`createdAt`), badges délivrés, onboarding, démographie, types/catégories.
- **Gating** : tant que l'utilisateur n'a pas modifié les bornes (`isDefault`), `effectiveDateRange = null` → **aucun filtrage** (évite de masquer toute la donnée de consultation quand un timestamp ES est absent/hors plage par défaut). Le filtre ne s'active qu'après modification d'une borne.

`StatisticsView` calcule `pageStats`/`pageCompareStats` = `computeAllStats(pageDelegates, mobileAppId, effectiveDateRange)` et passe `:date-range="effectiveDateRange"` aux tabs ; les composables ES reçoivent `getDateRange: () => effectiveDateRange.value`.

**Routing:** Single route `/:eventId` → `StatisticsView.vue`. Root `/` redirects to `/no-event`. Query param `?compareWith=<otherEventId>` active l'onglet Comparatif et précharge un 2ᵉ event.

**Heure de Paris** : `parisDateParts(iso)` est utilisée partout où on bucke par jour/heure (check-in, deliveredAt, live, replay). Évite les décalages UTC sur les events tardifs et gère CET/CEST automatiquement.

**Chart.js setup:** Global registration in `main.js` (ArcElement, BarElement, LineElement, etc. + ChartDataLabels plugin with `display: false` by default). Font: Poppins. Charts emit `@select` events on click for cross-filtering. Certains charts (BadgesTab device, Progression par type, StackedBarChart totals) utilisent des **plugins Chart.js custom** pour dessiner les totaux en bout de barre — contournement du `display: false` global de datalabels.

**Design system:** CYIM design tokens (Poppins, `#1E4E66` primary, `#30DD92` accent, `#6F45FF` purple, `#414141` text). CSS variables centralized in `App.vue :root`. Palette par type d'inscription propagée à Overview/Registrations/Comparison/Badges. Échelle de chaleur propagée aux cartes.

**Grilles de cartes** (`StatisticsView.vue`) : `.charts-row` = grid 2 colonnes (`1fr 1fr`) ; variantes `.charts-row.cols-3` (`1fr 1fr 1fr`) et `.charts-row.cols-1-2` (`1fr 2fr`, **`align-items: stretch`**) — cette dernière pour le couple **« type de session » (1/3) + « sessions » (2/3)** côte à côte dans Scans / Live / Replay / **Overview**.

**Listes de sessions à hauteur alignée** : la carte « sessions » porte `.session-list-card` (flex colonne) ; sa liste scrolle dans `.session-scroll-host` (flex:1, `min-height:220px`) → `.session-scroll` (`position:absolute; inset:0; overflow:auto`). L'absolu **ne gonfle pas** la rangée → c'est la **carte type de session (gauche) qui fixe la hauteur**, la liste scrolle dedans. Pour un bloc **non appairé** (pleine largeur) : `.session-scroll-capped` (max-height + scroll). Plus de plafond « top N » : **toutes** les sessions sont listées (tri décroissant). Toutes les rangées se replient en 1 colonne en mobile.

**Préfixe date des sessions** : les libellés des graphes de sessions sont préfixés `JJ/MM : ` via `sessionDateShort(start)` (cf. `parisTime.js`).

## GraphQL Queries

Entry points utilisés :
- `event(id).searchDelegates(...)` — pagination cursor des délégués (`createdAt` asc, 500/page)
- `event(id).config.branding` — nom + logo de l'event
- `event(id).children(eventType: [SESSION], first: 500, pageToken)` — sessions du congrès (enrichit Live/Replay) ; inclut `organizers { id displayName }` (= **organisateur de session**, exposé dans les exports « Session organisateur » + filtre Organisation)
- `getEvent(id).config.mobileApplicationId` — service registration

Delegate fields : `givenName/familyName/email/status/gender/company/occupation/jobTitle/qualification/practiceModes/title/createdAt/checkedInDate/gdpr/categories/contactId/externalContactId/externalId/firstOnboardingConnection/notes`, `primaryAddress { countryCode city zipCode country.code }`, `registrations { id type status categories accessDays }`, `badges { id type deliveredAt deliveredBy storage.publicUrl qrCode.value/decodedValue }`, et `contact { ... on Person { externalIds { value type } emailAddresses { value source { id type } } memberships.items.type apps { id lastUsed version name platform } } }`.

**Le RPPS** vit dans `contact.externalIds[]` avec `type === "RPPS"` (case-insensitive) — utilisé par DataTab et ExportsTab.
**Le Keycloak ID** vit dans `contact.emailAddresses[].source.id` quand `source.type === "ACCOUNT"` — clé canonique de jointure ES live/replay (cf. `viewerJoin.js`).

`gqlFetch` (api/graphql.js) wraps chaque requête avec : opName extrait du `query OpName(...)`, mesure du elapsed time, détection HTTP 504/408/524 et messages `timeout/deadline` côté serveur, warning sur les requêtes >5s. Permet de diagnostiquer les pages de pagination qui meurent en silence.

## Business Rules (POC)

- **Pending count:** `d.status` case-insensitive match on `"pending"`
- **Registered delegates:** Status `"registered"` (case-insensitive) — base population pour la plupart des KPIs (dénominateur des taux)
- **Restants sans badge:** Delegates with status `registered` AND no `checkedInDate`
- **Présence physique (`hasValidCheckin`)** : `checkedInDate` doit être une vraie date parsable par `Date.parse` (truthy seul ne suffit pas — un champ string vide ou bidon est traité comme non-checké)
- **Onboarding %:** Based on `registered` count (only registered delegates can access onboarding)
- **Mobile app usage:** Delegates whose `contact.apps` contains an entry matching `mobileApplicationId` from config, with `lastUsed` < 3 months. KPI hidden if no `mobileApplicationId` configured.
- **Badges & Check-in tab:** Totals (badges delivered %, check-in %) are relative to `registered` count, not total delegates
- **Mix des présents** (ComparisonTab + BadgesTab) : population `status = registered AND checkedInDate non null/valide`
- **Décomposition Overview** (Types + Catégories) : **registered uniquement**, segmentée en `physique / live-replay seul / aucune participation`. Somme des 3 = total registered par type/catégorie.
- **Total participants — 3 grands modes** (OverviewTab) : `Présence physique` (sur place seul + sur place&live + sur place&replay) · `Live distanciel` (live seul + live&replay) · `Replay distanciel` (replay seul). « Sur place + live » = présent ayant suivi du live MAIS PAS de replay (le replay capte le cas mixte présent+live+replay). Barre en 3 zones colorées, longueur proportionnelle au total de chaque event.
- **Filtre date — portée** : appliqué UNIQUEMENT au check-in (`checkedInDate`) et aux consultations Live (`sessionEnd`) / Replay (`timestamp`) / Scans (`timestamp`). PAS aux inscriptions/badges/onboarding/démographie. Inactif tant que les bornes par défaut ne sont pas modifiées.
- **Vues en salle** (`audienceUniqueDelegateSessions`) : somme, sur toutes les sessions, des délégués distincts scannés en salle. Un délégué présent à N sessions compte N fois (multi-scans d'une même session dédupliqués). ≠ délégués uniques en salle.
- **Live/Replay "sans présence physique"** : jointure unique via `contact.emailAddresses[].source.id` (type ACCOUNT) ↔ `user_id` ES. Compte les délégués matched dont `checkedInDate` est invalide. Les viewers ES non liés sont `unknown`, exclus du KPI.
- **Bucketage Live "par jour"** : `sessionEnd` (jour de diffusion live), fetché via GraphQL puis fallback ES
- **Bucketage Replay "par jour"** : `timestamp` du visionnage (date où le user a regardé la VOD, possiblement très éloignée de la session originale)

## Auto-refresh

- Data refreshes automatically every 10 minutes (registrations, scans, live, replay — même cadence, constante `AUTO_REFRESH_MS` dans `src/constants.js`)
- Countdown timer displayed under the refresh button, updates every 10 seconds (`COUNTDOWN_TICK_MS`)
- Manual refresh shows a confirmation dialog
- During refresh, a progress bar appears above the tabs (not replacing content)
- Tous les composables d'auto-refresh (`useStatistics`, `useLive`, `useReplay`, `useRoomScans`) ont un `setInterval` proprement cleané via `onUnmounted(clearInterval)`. Pas de cache module-level ni de timer survivant — instances mutualisées via lift dans `StatisticsView`.

## Exports

> Les exports **PDF** (`useExportPdf.js`) et **PPTX** (`useExportPptx.js`) ont été **retirés** du PoC, ainsi que leurs utilitaires (`exportSpec.js` DOM walker, `renderChartHD.js`) et les dépendances `jspdf` / `pptxgenjs` / `html2canvas`. Exports actuels : **Markdown + dump JSON intégral** (bouton sidebar, téléchargés ensemble), **CSV par session** (onglet Exports : combiné + mono-source présentiel/live/replay), **Parcours par personne** (onglet Exports) et **CSV par graphe** (`CsvButton`).

**MD** (`useExportMarkdown.js`) — destiné aux LLM (Claude/ChatGPT/Gemini) :
- Dump **complet** : métadonnées, chiffres clés, **total participants dédoublonné**, démographie, inscriptions (statuts/**statut par type**/types/catégories + décomposition physique/distanciel/no-show), temporel (+ **hebdo par statut**), check-in flow, badges (+ **check-in par type** + **mix des présents**), onboarding, mobile, live, replay, scans QR (+ **par jour/sens/type de badge**), comparaison, analyse textuelle, **annexe complète de l'event comparé**
- Corps per-event factorisé dans `renderEventBody()` (rejoué pour l'event B en annexe)
- Lecture **directe** des stats objects (pas DOM walking — beaucoup plus propre pour MD)
- Footer avec **suggestions de prompts** pour l'utilisateur (résumé, communiqué, comparaison, slides...)
- Filename: `bilan-{eventName}-{date}.md`

**CSV par session** (`ExportsTab.vue` + `buildSessionAttendance.js`) : croise audience scans + live + replay pour produire 1 CSV par session (`Profession / Fonction / Spécialité / Mode d'exercice / RPPS / Présent physique / Vu en live / Vu en replay / Durées`, marqueurs `YES`/`NO`). En plus du CSV combiné, **3 exports mono-source** (présentiel / live / replay) via `SessionPresenceExport.vue`, filtrables par type de session.

**Scans de session / Scans de zone** (`ExportsTab.vue` + `buildScanExport.js`) : export **à plat** (1 ligne = 1 scan) de tous les scans d'entrée de salle (audience) resp. d'accès aux zones, **enrichis** des infos délégué (identité, profession, RPPS, pays…) + type de badge. L'export *scans de session* porte **Début/Fin session** (sessions GraphQL UTC→Paris). Colonne `Rapproché` O/N. **Inclut les scans ré-associés** (cf. **Ré-association QR**) puisqu'ils lisent `scansApi.stats.value.{audience,zone}.scans` (post-récupération).

**Parcours par personne** (`ExportsTab.vue` + `buildDelegateJourney.js`) : à partir d'un email, 1 CSV avec toutes les sessions interagies (salle/live/replay) **et les zones scannées**. Indicateurs dissociés « Présence en salle » / « Présence en zone » ; colonne « Nature ».

**Export industrie** (`ExportsTab.vue` + `src/utils/exportXlsx.js`) : accordéon listant les **organisations** (organisateur de session, cf. `sessionOrganizerById`), filtrable par nom. Produit **1 fichier XLSX par organisation** (export d'une seule ou de toutes d'un coup, comme « Tout exporter » des autres exports), avec **3 onglets — Live / Replay / On site** — listant les personnes ayant consulté les sessions de cette organisation via chaque canal. Réutilise `buildRowsForSession` + `filterAttendanceBySource` sur les sessions de l'organisation, sérialisés avec **exactement les colonnes des exports mono-source** correspondants (`LIVE_/REPLAY_/PHYSICAL_ATTENDANCE_HEADERS` + leurs `rowToCsv`). `downloadWorkbook(filename, sheets)` (SheetJS `xlsx`, **import dynamique**) construit le classeur multi-onglets. Compteurs affichés = volumes bruts (vues/scans), pas personnes uniques.

**Cohérence enrichissement** : tous les exports de l'onglet s'appuient sur les scans déjà **récupérés/enrichis** par `computeScanStats` (jointure clé = `delegateId`, posé même sur les scans `'-'` rattrapés). Un scan que Flink avait laissé orphelin remonte donc dans la présence par session, le parcours et les exports à plat.

> **UI Exports** : accordéon (`openCategory`, une section ouverte à la fois ; en-tête titre + desc + chevron). Une variante « lanceur de cartes groupées par famille » a été tentée puis **abandonnée** (préférence pour l'accordéon). `SessionPresenceExport` a une prop `headerless` (vestige, inutilisée en accordéon).

**Analyse textuelle** (`generateAnalysis.js`) : bullet points par section, taux de présence, no-show, mix des présents, comparatif Δ pts, diversité géographique, mobile app, délai médian inscription→check-in. Réutilisée par l'export MD.

**CSV par chart** (`CsvButton.vue` + `exportCsv.js`) : per-chart CSV export button. Semicolon-separated (`;`), FR locale, BOM UTF-8, escape `"` et `;`.

All export buttons show spinner + disabled state during generation.

## Diagnostics UI

`<DiagnosticsBanner>` monté globalement dans `App.vue` affiche des toasts fixed top-right alimentés via `pushDiagnostic` du composable `useDiagnostics`. Cas couverts :

1. **Couverture Keycloak basse côté délégués** (`viewerJoin.buildDelegateLookup`) — quand moins de 50% des délégués ont un `emailAddresses.source.id` (type ACCOUNT) renseigné, la jointure live/replay va manquer beaucoup de monde et les KPI "sans présence physique" deviennent silencieusement faux. Toast persistant (pas d'auto-dismiss) demandant à l'admin de prévenir l'équipe technique.
2. **Échec `fetchEventSessions`** (`useLive` + `useReplay`) — si l'enrichissement GraphQL plante, les titres/types/durées de session manquent. Toast distinct pour Live et Replay.

Faible match côté ES (`getRemoteOnlyDelegateIds`) → console.warn uniquement (admin n'y peut rien, c'est un problème pipeline Flink).

Fingerprint partagé entre `console.warn` et `pushDiagnostic` évite la duplication quand un computed se recalcule sur le même dataset.

## Conventions

- Language: **UI bilingue FR/EN via vue-i18n** (cf. section **i18n**). FR = langue source/fallback. Commentaires en français, identifiants de code en anglais. **Tout nouveau libellé affiché passe par `t("…")`**, jamais de texte en dur dans les templates/datasets.
- No linter or formatter configured — follow existing style
- No component library — all styling via scoped/global CSS with shared classes (`.kpi-card`, `.chart-card`, `.data-table`)
- GraphQL queries are inline strings in `api/graphql.js`, not `.graphql` files
- No state management library — composables with `ref`/`readonly` only
- Status comparisons are case-insensitive (`.toLowerCase()`)
- **Composables stateful** (auto-refresh) sont **liftés** au niveau `StatisticsView` et propagés en prop aux tabs. Évite cache module-level, timers fantômes en HMR, fetchs dupliqués.
- **Pas de v-if au root d'un composant** — Vue 3 a un bug de patch quand le seul root template alterne entre comment vide et vrai élément. Mettre le v-if côté parent (`<Foo v-if="..." />`).

## Internationalisation (i18n)

UI **bilingue FR/EN** via **vue-i18n** (Composition API, `legacy: false`). Bouton FR/EN en haut à droite du header (`LanguageToggle.vue`), langue persistée en `localStorage` (`stats-lang`) et reflétée sur `<html lang>`. **FR = langue source + `fallbackLocale`** : une clé EN manquante retombe sur le libellé FR.

| Fichier | Rôle |
|---------|------|
| `src/i18n/index.js` | `createI18n` + `setLocale(locale)` (persist + `<html lang>`). Langue initiale = localStorage sinon FR. |
| `src/i18n/locales/fr.js` / `en.js` | Messages, **un namespace de 1er niveau par zone** (`nav`, `filters`, `overview`, `demographics`, `registrations`, `temporal`, `badges`, `data`, `scans`, `viewers`, `viewersCompare`, `comparison`, `exports`, `maps`, `diagnostics`, `categories`, `analysis`, `md`, …). |
| `src/i18n/labels.js` | Traduit les **catégories dérivées** produites canoniques-FR par `computeStats`/`countries.js` (genres, continents, jours de semaine, « Tous les jours », « Non renseigné ») **à l'affichage** — `computeStats` reste locale-agnostic. Helpers : `genderLabel`, `continentLabel`, `notSpecified`, `isNotSpecified`, `allDaysLabel`, `weekdayNames`. |
| `src/components/LanguageToggle.vue` | Bouton segmenté FR\|EN. |

**Conventions i18n :**
- Composants : `const { t } = useI18n()`, libellés via `t("ns.key")`. Jamais de texte en dur (templates, `label:` de datasets, en-têtes CSV, titres de charts).
- **Options Chart.js avec titres d'axes traduits** → les passer en `computed(() => ({...}))` pour qu'ils se rafraîchissent au switch de langue (les `tooltip.callbacks` sont lazy, donc OK même en `const`).
- **Hors composant** (utils/composables : `generateAnalysis.js`, `useExportMarkdown.js`, `viewerJoin.js`, `useLive/useReplay`) : importer `{ i18n }` et utiliser `i18n.global.t`. L'export MD/analyse suit la langue active à la génération.
- **Filtres cross-clic** : quand un libellé de catégorie est traduit à l'affichage, le prédicat de filtre compare sur la **valeur localisée** (ou garde la valeur brute comme tag + compare le brut) pour rester correct en EN — cf. `DemographicsTab` (continents/genre), `BadgesTab` (device), `TemporalTab` (jours).
- **Variable d'itération `t`** : un `v-for="t in …"` ou `.map(t => …)` shadow la fonction i18n — renommer (`rt`, `bt`, `st`, `row`…).
- **Tooltips d'aide (`*Hint`)** : chaque carte explicable porte un `<InfoTooltip :text="t('ns.xxxHint')" />` dans son `<h3>`. Convention de nommage : la clé d'aide = clé du titre suffixée `Hint` (ex. `temporal.charts.cumulCurve` → `cumulCurveHint`). Pour DataTab, bloc dédié `data.columnsHint.{rpps,membershipType,externalContactId,externalId}` rendu dans le `<th>` (avec `@click.stop` pour ne pas déclencher le tri). Textes orientés **métier** (dénominateurs, jointures, sens des champs backend). HTML léger autorisé (`<code>`, `<strong>`) — la bulle l'affiche tel quel.
- Pluriels : forme vue-i18n `"x | y"` + `t(key, count, { … })`.
- Format date/nombre : `toLocaleString(locale.value === "en" ? "en-GB" : "fr-FR", …)`.

**Non traduit (assumé) :** valeurs **data** issues du backend (types/catégories d'inscription, statuts, `sessionType`) ; **noms de pays** (`COUNTRY_NAMES`, ~250, affichés dans DataTab) ; **en-têtes de colonnes des CSV par session/parcours** (`ATTENDANCE_HEADERS`/`JOURNEY_HEADERS` + marqueurs **`YES`/`NO`** + colonne « Nature » Session/Zone) ; `DayOfTab.vue` (code mort non référencé).

## Limitations

- Auto-refresh reloads all data (no delta/incremental)
- Sequential pagination can be slow for large events (>5000 delegates)
- Cross-filtering recomputes affected stats sections on each click — laziness limite le coût, mais pas de mémoïsation cross-clic
- Badge delivery counters depend on backend `badges.deliveredAt` field availability
- Filter cross-clic state is per-tab and resets on tab switch (les 2 filtres globaux — type de badge + plage de dates — sont en revanche persistants cross-tab)
- **Filtre date Live** : quand actif, repose sur `sessionEnd` car l'index ES live n'expose pas de timestamp de visionnage fiable ; si une session n'a ni `sessionEnd`/`sessionStart` ni timestamp, elle est exclue. C'est pourquoi le filtre date est inactif par défaut (sinon Live tomberait à 0).
- Cartes choroplèthes (BadgesTab `RegionalMaps`) : badge-filtrées mais PAS date-filtrées (liste brute de délégués). Les KPI/charts calculés via `fs` le sont.

## Axes d'evolution (si passage en production)

- **Migrer vers `@platform/common-ui`** — remplacer le CSS custom par les composants du design system CYIM
- **`@platform/localized-ui`** — pour le support bilingue FR/EN si necessaire
- **`@platform/string-format-ui`** — pour standardiser le formatage des nombres/dates
- **Pagination parallele** — lancer les pages en parallele une fois le totalCount connu
- **Utiliser les `metrics` backend** — la query `fetchMetrics` existe deja mais n'est pas utilisee
- **SSE/WebSocket** — pour le refresh incremental au lieu de tout recharger
- **Splitter les gros tabs** — ComparisonTab (~1100 lignes) et BadgesTab (~950 lignes) gagneraient à être découpés en sous-composants (déjà extrait : `RegionalMaps`, `KpiCompareGrid`)

---

## Onglet "Scans QR" — accès Elasticsearch direct

Onglet ajouté pour remplacer le microservice `congress/microservices/xlsx-stats` sur le périmètre scans onsite (audience par session, checkin entrée congrès, scan de zones). Le mode d'accès aux données rompt avec le pattern habituel du PoC : **lecture directe d'Elasticsearch depuis le navigateur**, sans passer par Apollo Gateway.

### Architecture (spécifique à cet onglet)

| Layer | Fichier | Role |
|-------|---------|------|
| API | `src/api/elasticsearch.js` | Client ES REST direct (`POST /{index}/_search` + pagination `search_after`, batches de 2000). 3 exports : `fetchRoomAudience`, `fetchCongressCheckin`, `fetchZoneAccess` |
| Composable | `src/composables/useRoomScans.js` | Charge les 3 index en parallèle. **Lifté au niveau `StatisticsView`** depuis Day 1.3 — `ScansTab` et `ExportsTab` reçoivent `scansApi` en prop. Cleanup `onUnmounted(clearInterval)`. |
| Compute | `src/utils/computeScanStats.js` | Pure function `computeAllScanStats({ audience, checkin, zone }, {dateRange?, badgeTypes?, qrLookup?})` : normalise les 3 schemas, filtre par date/badge, **récupère/enrichit** via `qrLookup` (cf. **Ré-association QR**), agrège les KPI dont `audienceUniqueDelegateSessions` et `topSessions[].uniqueDelegates`. Conserve `scan.raw` (`_source` ES). |
| Composant | `src/components/tabs/ScansTab.vue` | Reçoit `scansApi` (+ `compareScansApi`, **`delegates`**, `eventName`, `compareEventName`). Grille `<KpiCompareGrid>` A∣Δ∣B si `?compareWith=`. **Cartes géo monde+Europe** des délégués scannés. Type de session (1/3) + **Sessions par audience (2/3, toutes, scroll, hauteur alignée)** côte à côte. Détail des scans **extrait dans `ScanDetailTable`** (colonnes Type·Horodatage·QR·delegateId·**badgeId**·fullName·email·badgeType·sessionId·sessionTitle·sessionStart·roomName·Zone·Direction, filtre QR, cellules enrichies surlignées vert, bouton « Détails » → `ScanDetailModal`). |
| Proxy | `vite.config.js` `/api/es` | Forward dev vers `VITE_ES_URL` (defaut `http://192.168.201.176:9200`). Pas équivalent prod. |

### Sources ES consommées

3 index alimentés par UN seul job Flink (`congress/flink/jobs/sql-scripts/jobs/stats_room_scans.sql`) qui consomme UN topic Kafka (`cyim.webhooks` produit par l'app mobile de scan) :

| Index | Sémantique |
|-------|-----------|
| `stats_user__onsite-audience-per-session-per-user` | Scan entrée de salle (audience par session). **Attention** : tirets et non underscores. |
| `stats_user__onsite_congress_checkin_per_user` | Checkin entrée site |
| `stats_user__onsite_zone_checkin_per_user` | Accès zones (stands, lounges) |

Requête : `{ query: { term: { "congress_id.keyword": eventId } }, sort: [{ _id: "desc" }], size: 2000 }` + `search_after` pour les batches suivants.

### Ré-association QR (coquille `delegate_id = '-'`)

Côté Flink (`stats_room_scans.sql`), le QR scanné (`webhook.body.user_id`) est matché au délégué via le resolver GraphQL `event(id).registrationByBadgeQRCode(qrCode)` (`JOIN ... ON badge.$registrationByBadgeQRCode.qrCode = t.qrcode`). Quand ce match échoue, **checkin et zone** (LEFT JOIN) écrivent `delegate_id = '-'` ; l'**audience** (INNER JOIN) **droppe** carrément la ligne (absente de l'index — irrécupérable).

**Cause racine** (resolver `registration-badges/server/schemas/index.ts`) : le resolver fait `decodeURI(qrCode)` puis parse en query-string ; si un param `d` (delegateId) est présent il matche `{ delegateId, eventId }`, sinon il matche le champ **littéral** `{ eventId, qrCode }`. Les badges réellement **générés/finalisés** (champs `retrievalCode` + `storage` en base) matchent ; les badges non générés / stale / créés après le scan (juste un `qrCode`, pas de `retrievalCode`) retombent en `'-'`. C'est exactement le clivage observé en base entre badges enrichis et non enrichis dans l'index.

**Confirmé en prod** (comparaison de 2 snapshots GraphQL du même délégué) : le badge existe dans `delegate.badges[]` mais `registration.badge` est **résolu de façon intermittente** (null puis objet) → l'enrichissement Flink, lookup ponctuel, manque le délégué par timing. Ce n'est donc PAS un mismatch de valeur : la donnée est bonne, on peut la rattacher côté client sur le `qrCode` stable du badge déjà chargé.

On **ré-associe + enrichit côté navigateur**, **sans appel réseau** (l'app n'appelle volontairement PAS `registrationByBadgeQRCode`) :
- `buildQrDelegateLookup(delegates)` (population **complète**) construit `Map<clé → délégué>` indexée **par QR** (`qrCode.value` + `decodedValue`, **normalisation multi-clés** `qrKeys` : souple trim+lowercase + stricte alphanumérique-only — tolère espaces/préfixe `"ER "`/casse) **ET par `delegateId`**. Construit dans `StatisticsView`, passé à `useRoomScans` via `getQrLookup` → `computeAllScanStats({ qrLookup })`.
- `recoverDelegateIds()` rattache **avant filtrage** les scans `'-'`/null dont `raw_qr_code` matche (essai du plus spécifique au plus tolérant), pose `scan.recovered = true`.
- `enrichFromLookup()` complète **tous** les scans à `delegateId` réel : remplit `fullName`/`email`/`badgeType`/`badgeId` quand l'ES les laisse vides. ⚠️ Les lignes non matchées écrivent le placeholder littéral **`'-'`** (pas vide) pour `user_email`/`user_fullName`/etc. → `isBlankField` traite `''`/`'-'`/`'—'` comme vide (sinon `email` ne s'enrichissait jamais). `fullName` enrichi au format **`givenName familyName (delegateId)`**. Flags par champ `*Enriched`.
- Les scans récupérés/enrichis comptent normalement partout (délégués uniques/jour, engagement, top sessions, cartes géo, **exports**, export MD/JSON).
- Transparence UI (ScansTab) : note « X ré-associés · Y restants non associés » sous le détail, **cellules enrichies surlignées vert** (`cell-enriched` : delegateId/badgeId/fullName/email/badgeType), **filtre par QR code**, bouton **« Détails »** (modal ES brut + délégué/badge). Compteurs `global.recoveredScans` / `global.unmatchedScans`.
- **Limite** : audience (salle) en INNER JOIN → ses non-matchés sont **absents** de l'index (irrécupérables) ; seuls checkin/zone (LEFT JOIN) ont le `'-'`. Et si le scanner émet un QR réellement différent de `value`/`decodedValue`, reste en `unmatched`.

### Choix d'implémentation NON optimaux

Ces choix sont assumés pour un PoC (livraison rapide, périmètre chirurgical), mais doivent être repris avant la prod :

1. **ES exposé via proxy applicatif sans auth ni whitelist**
   - **Problème** : `/api/es/{index}/_search` forwarde tel quel vers ES. Aucune authentification, aucun whitelist d'index, aucun rate limiting.
   - **Prod** : créer un resolver GraphQL fédéré `scanStatistics(eventId, filters)` dans un **nouveau micro-service `stats`** — **décision arrêtée : aucune greffe sur un microservice existant** (ni `registration-badges`, ni `xlsx-stats`) ; leurs patterns sont repris, pas leur code. Auth Cerbos. Supprimer le proxy `/api/es`.

2. **Tout chargé en RAM côté navigateur**
   - **Problème** : sur un gros congrès (>100k scans), la mémoire et les `computed` deviennent lourds.
   - **Prod** : agrégations ES (`size: 0` + `terms`, `date_histogram`, `cardinality`) côté serveur. Le download exhaustif reste un clic explicite.

3. ~~**Composant autonome qui fetch à l'ouverture**~~ ✅ **Résolu** : `useRoomScans` lifté au niveau `StatisticsView` (Day 1.3). ScansTab et ExportsTab partagent une seule instance, data dispo immédiatement pour l'export MD.

4. **Pas de cross-filtering** (`useFilteredStats` non utilisé)
   - Les charts ne sont pas cliquables. Tableau a juste un filtre simple par `kind`.

5. **Heuristique timestamp ms vs secondes**
   - `computeScanStats.dayHourFromTimestamp` détecte ms vs s avec `< 10^12`. Fragile si Flink change la forme.
   - **Prod** : standardiser le mapping ES en `date` typée côté Flink.

6. **Détecteur `direction` heuristique**
   - `normalizeDirection` mappe `in*` / `entr*` / `out*` / `sort*` vers `in` / `out`.
   - **Prod** : enum strict `IN | OUT | UNKNOWN` figé côté Flink + type ES `keyword`.

7. **Nom d'index hardcodé et incohérent** (tirets vs underscores). Prod : alias versionné.

8. **Limite tableau 200 lignes en dur**. Prod : virtualization (`vue-virtual-scroller`).

9. **Pagination ES séquentielle**. Prod : aggs (cf. #2) ou `_pit` + `slice`.

10. **Pas d'incremental refresh**. Prod : ES PIT + `timestamp > last_seen`, ou SSE depuis backend qui écoute `cyim.webhooks`.

11. **Champs délégués manquants vs xlsx-stats** (profession, workingPlace, speciality, gdpr, externalId, phone, city). Prod : jointure browser entre `scans` et `delegates` (déjà chargés par `useStatistics`). ⚠️ **Partiellement amorcé** : la **ré-association QR** (cf. section dédiée) fait déjà une jointure browser `scans ↔ delegates` sur le QR pour les scans `'-'` (récupère id/nom/email/badge_type). Reste à étendre aux autres champs (profession, spécialité, gdpr…) pour TOUS les scans.

12. **Pas de gestion RGPD**. xlsx-stats anonymise (`***`) les délégués sans flag GDPR. Prod : utiliser la jointure du point 11 + `delegate.gdpr`.

13. **Pas de fallback CORS / endpoint prod**. Prod : remplacer par resolver GraphQL.

### Chemin de migration recommandé

1. Créer le **micro-service `stats`** (nouveau, pas de greffe) portant un resolver GraphQL `scanStatistics(eventId, filters)` qui retourne aggs + échantillon de scans bruts. Auth Cerbos.
2. Supprimer `src/api/elasticsearch.js` et le proxy `/api/es`, brancher `useRoomScans` sur `useGQLQueryStore().query()`.
3. Implémenter cross-filtering + jointure avec `delegates` pour enrichissement + masquage RGPD.
4. Migrer la liste tableau vers une virtualization + pagination ES serveur.
5. Migrer les nommages d'index ES vers des alias cohérents.

---

## Onglets Live / Replay — composants génériques

Depuis Day 2, les 4 anciens fichiers `LiveTab.vue` + `ReplayTab.vue` + `LiveComparisonTab.vue` + `ReplayComparisonTab.vue` (~1940 lignes au total) sont remplacés par 2 composants génériques paramétrés par `kind: 'live' | 'replay'` :

- **`src/components/tabs/ViewersTab.vue`** — single-event view (KPI, top sessions, origine, engagement, table détail). Variations par kind via `LABELS[kind]` (libellés, nom index ES, couleur byDay) + `v-if="kind === 'live'"` pour les blocs Live-only (30-min slot chart, sessionType pie cliquable, colonnes Type/Début session dans le détail). Replay-only : colonne Origine en pill.
- **`src/components/tabs/ViewersComparisonTab.vue`** — vue comparaison A vs B (KPI compare grid via `<KpiCompareGrid>`, origin stacked, daily J0/J1/J2).

Les composables `useLive` et `useReplay` sont liftés au niveau `StatisticsView` et propagés en prop (`viewerApi`, `compareViewerApi`).

### Jointure ES live/replay ↔ délégués registration

`viewerJoin.js` fait la jointure via une **seule clé canonique** : `contact.emailAddresses[].source.id` quand `source.type === "ACCOUNT"` (= identifiant Keycloak du compte associé à l'email). Identifié comme source de vérité fiable après inspection Mongo côté service contacts.

- Lookup `Map<keycloakId, { checkedIn, delegate }>` construite à partir des délégués
- Pour chaque hit ES (`user_id` = Keycloak), 3 catégories : `checkedIn` / `noCheckin` / `unknown` (no match)
- Le KPI "Sans présence physique" compte uniquement les matched sans `hasValidCheckin(d)` (exclut les unknown — viewers anonymes ou ID format imprévu)
- **Warnings auto** si couverture Keycloak < 50% (côté délégués) ou taux de match < 50% (côté ES). UI banner pour le 1er cas, console pour le 2nd.

### KPIs et charts spécifiques

**Live (kind='live')** :
- KPIs : Délégués uniques (live), Sans présence physique, Vues totales, Durée moyenne / vue
- Vues par origine (camembert + légende)
- Délégués uniques par jour : bucké sur `sessionEnd`
- **Délégués uniques par jour et par chaîne** (barres groupées) : label de chaîne = `channel_name` de l'index ES (fallback `Chaîne N`)
- Délégués uniques par tranche de 30 min (sessionEnd)
- **« Vues par session_type » (1/3, cliquable) + « Sessions par délégués uniques » (2/3, toutes, scroll, hauteur alignée)** côte à côte (`.charts-row.cols-1-2`) ; le clic sur un type filtre le tableau détail ET la liste des sessions
- Engagement : tranches "1 / 2-5 / 6-10 / 10+"
- Tableau détail avec sessionType, sessionStart

**Replay (kind='replay')** :
- KPIs identiques ; « Vues totales par origine » affiché dans l'indicateur KPI (doughnut + légende % et absolu) — comme Live
- Délégués uniques par jour : bucké sur `timestamp` du visionnage ; **courbe « Nouveaux délégués »** (1ʳᵉ consultation du jour, `newUniqueByDay`) + courbe cumulée
- **Cumul des délégués distincts ayant consulté du replay** (déplacé depuis Overview), au-dessus du top sessions
- **« Vues par session_type » (1/3, cliquable) + « Sessions par délégués uniques » (2/3, toutes, scroll, hauteur alignée)** côte à côte (`.charts-row.cols-1-2`) ; les **« Sessions par vues »** (`topSessionsByViews`) passent **en pleine largeur** sous le couple (scroll plafonné)
- Engagement (sessions/délégué) remonté à droite de « Délégués uniques par jour »
- **Funnel « présents physiques ayant consulté du replay »** (`physicalReplay.js`) : par jour (délégués uniques + vues, double axe) + cumulé. Comparatif : 2 courbes cumulées A vs B alignées J0
- Tableau détail avec colonne Origine en pill

**OverviewTab** — en plus des KPI/décomposition :
- **Filtre « Modalité de participation »** (PHYSIQUE/LIVE/REPLAY) **remonté en barre de page** (`.page-mode-filter`) : pilote la décomposition participants, les cartes géo ET l'engagement.
- **Cartes géographiques monde + Europe** (`ChoroplethMap` scope `world`/`europe`) des participants **filtrés par modalité** — placées sous les courbes onboarding/mobile.
- **« Vue d'ensemble par type de session » (1/3) + « Sessions par délégués uniques » (2/3, toutes, scroll, hauteur alignée)** côte à côte (`.charts-row.cols-1-2`).
- **« Participants par jour »** (histogramme **groupé**, à gauche de l'engagement) : 1 barre/modalité (Présence physique · Live · Replay) par jour, délégués distincts actifs ce jour-là. **Suit le filtre Modalité de participation** (série retirée si décochée). Pas de dédoublonnage inter-modalité. Libellés « Live »/« Replay » volontairement **sans « distanciel »** (≠ décompo Total participants).
- **Engagement — répartition des délégués par nombre de sessions UNIQUES** (union dédupliquée salle ∪ live ∪ replay ; tranches `1·2-5·6-10·11-15·16-20·21-25·26-30·30+`), 2 exports : Distribution + Détail par délégué.
- Charts de synthèse : Participants vs Inscrits (groupé par event), Participants par type de badge (empilé), Audience salle+live+replay (horizontal — « Salle » = `audienceUniqueDelegateSessions`).
- Le cumul des délégués replay a été **déplacé vers l'onglet Replay**.

### Choix d'implémentation NON optimaux

1. **Champs ES non standardisés** — timestamp/duration ont des noms variables (`timestamp`, `view_timestamp`, `viewing_time`, etc.). Le code essaie une dizaine de fallbacks. Prod : standardiser le mapping côté Flink.

2. ~~**Cache singleton avec setInterval éternel**~~ ✅ **Résolu** (Day 1.3) : `useLive`/`useReplay` liftés dans `StatisticsView`, cleanup `onUnmounted(clearInterval)`. Plus de cache module.

3. ~~**Enrichissement GraphQL "best effort"**~~ ✅ **Résolu** (#12) : `fetchEventSessions` qui échoue déclenche `pushDiagnostic` → toast UI top-right.

4. **Pas de jointure session live ↔ session VOD** — un même `session_id` peut apparaître dans les deux. KPIs calculés indépendamment. Prod : utile pour le funnel "regardé en live puis revu en replay".

---

## Export Markdown pour LLM

`useExportMarkdown` produit un dump complet conçu pour être donné en entrée à un LLM (Claude, ChatGPT, Gemini). Le DG voulait pouvoir générer automatiquement des bilans, comparaisons, emails clients, slides à partir des données du dashboard sans repasser par un humain qui lit le PDF.

**Pourquoi MD** : les LLM ont été entraînés sur des tonnes de markdown (READMEs, docs), ils en extraient la structure (titres, tableaux, listes) sans pré-traitement. Plus pratique que PDF (perte de structure) ou CSV (pas de sémantique).

**Structure** — le corps per-event est factorisé dans `renderEventBody()` (toutes les sections d'un event, même ordre), appelé pour l'event principal **et** pour l'annexe de comparaison. Ordre du document :
1. Métadonnées (event, ID, filtre badge actif)
2. Chiffres clés globaux (KPI table)
3. **Total participants (vue dédoublonnée)** — décomposition check-in physique + live-only + live&replay + replay-only = total dédoublonné sur `delegate.id`. KPI le plus important du bilan. Logique partagée avec OverviewTab via `utils/participation.js`
4. Démographie **exhaustive** (tous les pays — plus de plafond top 20 —, continents, **régions françaises**, genre, professions, qualifications, civilité, sociétés)
5. Inscriptions (statuts, **statut par type**, types et catégories avec décomposition physique/distanciel/no-show sur registered, jours d'accès, multi-inscriptions)
6. Temporel (insights, top jours, jour de semaine, hebdo par type, **hebdo par statut**)
7. Check-in flow (pic, par jour, top créneaux 15 min)
8. Badges (**check-in par type de badge**, **mix des types des présents confirmés**, devices, peak slot/minute, par jour, créneaux 15 min)
9. Onboarding + Mobile app
10. Live (KPI, top sessions, origines, engagement, par jour, **par jour et par chaîne**, 30min slots si dispo)
11. Replay (idem + **nouveaux délégués/jour**, **délégués cumulés/jour**, **vues par jour**)
12. Scans QR (volumétrie, top sessions/salles/zones, **délégués uniques par jour ventilés par source**, **scans de zone par jour**, **flux par heure**, sens entrée/sortie, par type de badge)
13. Comparaison côte-à-côte avec Δ si `?compareWith=` (tableau exécutif)
14. Analyse textuelle (réutilise `generateAnalysis.js`)
15. Footer avec **suggestions de prompts** pour l'utilisateur
16. **Annexe — données complètes de l'event comparé** : `renderEventBody()` rejoué pour l'event B (toutes les sections, sauf scans QR non chargés côté compare). Avant : event B n'avait que 5 KPI.

Filenames : `bilan-{eventName}-{date}.md` **+ `donnees-{eventName}-{date}.json`** (téléchargés ensemble). Le **dump JSON** contient 100 % des données source : `meta`, `event.delegates` (bruts), `event.stats` (sections matérialisées via `materializeStats`), `event.live`/`replay`/`scans` (items ES inclus), et `compare` si `?compareWith=`. Replacer JSON de sécurité (Set→Array, Map→Object). Lecture **directe** des stats objects (pas DOM walking).

Bouton "Export Markdown" couleur accent CYIM dans la sidebar : déclenche le `.md` **et** le `.json`.

**Limites assumées** :
- L'event comparé **charge désormais ses scans QR** (`compareScansApi` instancié quand `?compareWith=`) → l'annexe B inclut la section Scans (sauf si réellement aucun scan).
- Top sessions audience scans exposent `uniqueDelegates` par ligne (depuis l'enrichissement `topSessions`) ; top salles/zones restent `{ label, count }`.
