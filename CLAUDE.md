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

## Stack

Vue 3 + Vite 6 + Vue Router + Chart.js 4 (vue-chartjs) + chartjs-chart-geo (world/FR maps) + d3-geo (Lambert projection FR, fallback mercator) + chartjs-plugin-datalabels + jspdf + pptxgenjs + html2canvas. No UI framework (custom CSS with CSS variables defined in `App.vue`).

Sources de données :
- **Apollo Gateway** (GraphQL) : délégués + config event + sessions (`event(id).children(eventType: SESSION)`)
- **Elasticsearch direct** (proxy `/api/es` en dev) : scans onsite (audience, checkin, zone), live views, VOD replay views

## Architecture

**Data flow:** `api/graphql.js` fetches all delegates via cursor-paginated `searchDelegates` (500/page) + event config via `getEvent` → `utils/computeStats.js` computes all statistics client-side → composable `useStatistics` exposes reactive state + auto-refresh every 10 min → tab components render charts with cross-filtering via `useFilteredStats`.

**Key layers:**

| Layer | Files | Role |
|-------|-------|------|
| API | `src/api/graphql.js` | Apollo Gateway : `searchDelegates`, `getEvent` (config + mobileAppId), `fetchEventSessions` (sessions via `event(id).children(eventType: SESSION)`) |
| | `src/api/elasticsearch.js` | ES direct (proxy `/api/es`) : `fetchRoomAudience`, `fetchCongressCheckin`, `fetchZoneAccess`, `fetchLiveViews`, `fetchReplayViews` |
| Computation | `src/utils/computeStats.js` | Pure function `computeAllStats(delegates, mobileAppId)` → `{ global, demographics, registrations, temporal, onboarding, checkinFlow, badges }` |
| | `src/utils/computeScanStats.js` | Agrège les 3 index ES de scans onsite |
| | `src/utils/computeLiveStats.js` | Normalise hits live + enrichit via `sessionMap` (GraphQL) pour récupérer sessionTitle/type/start/end/duration que ES n'expose pas |
| | `src/utils/computeReplayStats.js` | Idem pour VOD replay |
| Composables | `src/composables/useStatistics.js` | Délégués + config, auto-refresh 10 min. Console.log debug des délégués avec checkedInDate sans badge `deliveredAt` |
| | `src/composables/useFilteredStats.js` | Cross-filtering : filtre delegates + recompute stats. Expose `filteredDelegates` (en plus de `filteredStats`) |
| | `src/composables/useRoomScans.js` | Scans onsite (audience + checkin + zone) en parallèle, auto-refresh 10 min |
| | `src/composables/useLive.js` | Live views ES + sessions GraphQL en `Promise.all`. **Cache singleton par eventId** : 1 seule instance partagée entre tabs (Overview + LiveTab) |
| | `src/composables/useReplay.js` | Idem pour VOD replay. **Cache singleton par eventId** |
| | `src/composables/useExportPdf.js` | PDF jsPDF, layout maison (KPI compare 3 colonnes A∣Δ∣B, cartes map via html2canvas) |
| | `src/composables/useExportPptx.js` | PPTX pptxgenjs (chart natifs quand possible, sinon image HD) |
| View | `src/views/StatisticsView.vue` | Sidebar hiérarchique avec groupes (parents non cliquables + enfants indentés) |
| Tabs | `src/components/tabs/*.vue` | OverviewTab, DemographicsTab, **RegistrationsTab + TemporalTab + BadgesTab + DataTab + ComparisonTab** (groupés sous "Registration"), ScansTab, LiveTab, ReplayTab |
| Charts | `src/components/charts/*.vue` | DoughnutChart, HBarChart (per-bar palette via `colors`), LineChart, StackedBarChart, ChoroplethMap (monde), **FrenchRegionMap** (métropole + DOM mini-cartes) |
| Filter | `src/components/FilterBanner.vue` | Filtres cross-clic actifs avec boutons d'effacement |
| CSV | `src/components/CsvButton.vue` | Per-chart CSV download, `src/utils/exportCsv.js` |
| Utils | `src/utils/countries.js` | Country code ↔ continent/flag |
| | `src/utils/frenchRegions.js` | Mapping département (2 chars du zipCode) → région INSEE + libellés |
| | `src/utils/parisTime.js` | `parisDateParts(iso)` : conversion UTC→Paris (gère CET/CEST) via `Intl.DateTimeFormat` |
| | `src/utils/typeColors.js` | Palette déterministe par type d'inscription (hash sur libellé), 12 couleurs |
| | `src/utils/heatColor.js` | Échelle de chaleur partagée (gris→vert→orange→rouge) pour les cartes |
| | `src/utils/burndown.js` | Courbes de décroissance (restants à check-in) absolue/relative, paramétrable par step (15 min / 30 min) |
| | `src/utils/checkinByType.js` | Bar horizontale stacked check-in/restants par type de badge (partagé BadgesTab + ComparisonTab) |
| | `src/utils/exportSpec.js` | DOM walker : extrait KPI cards + chart cards d'un onglet pour export PDF/PPTX |
| | `src/utils/renderChartHD.js` | Re-render Chart.js sur canvas offscreen 1600×900 pour export |
| | `src/utils/generateAnalysis.js` | Analyse textuelle (présence, no-show, mix, comparatif Δ pts, etc.) — utilisée dans PDF/PPTX |

**Stats object structure** (returned by `computeAllStats`): `{ global, demographics, registrations, temporal, onboarding, checkinFlow, badges }` — each tab consumes a subset.

**Navigation hiérarchique (sidebar) :**
- Vue d'ensemble (leaf)
- Démographie (leaf)
- **Registration** (groupe non cliquable) → Inscriptions · Dynamique · Badges & Check-in · Données · Comparatif (conditionnel `?compareWith=…`)
- Scans salles & Zones (leaf)
- Live (leaf)
- Replay (leaf)

Le node "Registration" n'est pas un onglet exporté en tant que page — `exportTabs` aplatit récursivement les leaves.

**Cross-filtering:** Each tab uses `useFilteredStats(getDelegates, getMobileAppId)` independently. Clicking a chart segment filters delegates and recomputes all stats within that tab. Charts accept `activeLabel` prop to dim non-selected segments. Filter state resets when switching tabs (v-if destroys/recreates components).

**Filtre global page (BadgesTab + ComparisonTab)** : pills multi-select par type de badge au-dessus des KPIs. Filtre appliqué **en amont** de `useFilteredStats`, donc tous les KPIs/charts/exports en dérivent. Logique de match : `delegateBadgeType(d)` = type attendu du délégué (1er badge en base OU 1ère registration), ce qui inclut les délégués pas encore checkés.

**Routing:** Single route `/:eventId` → `StatisticsView.vue`. Root `/` redirects to `/no-event`. Query param `?compareWith=<otherEventId>` active l'onglet Comparatif et précharge un 2ᵉ event.

**Heure de Paris** : `parisDateParts(iso)` est utilisée partout où on bucke par jour/heure (check-in, deliveredAt, live, replay). Évite les décalages UTC sur les events tardifs et gère CET/CEST automatiquement.

**Chart.js setup:** Global registration in `main.js` (ArcElement, BarElement, LineElement, etc. + ChartDataLabels plugin with `display: false` by default). Font: Poppins. Charts emit `@select` events on click for cross-filtering. Certains charts (BadgesTab device, Progression par type) utilisent des **plugins Chart.js custom** locaux (`deviceRowTotalsPlugin`, `checkinByTypeTotalsPlugin`) pour dessiner les totaux en bout de barre — contournement du `display: false` global de datalabels.

**Design system:** CYIM design tokens applied (Poppins, `#1E4E66` primary, `#30DD92` accent, `#6F45FF` purple, `#414141` text). CSS variables centralized in `App.vue :root`. **Palette par type d'inscription** (`getTypeColor`) propagée à Overview/Registrations/Comparison/Badges → un même type a la même couleur partout. **Échelle de chaleur** (`heatColor`) propagée aux cartes monde et France pour montrer le volume.

## GraphQL Queries

Entry points utilisés :
- `event(id).searchDelegates(...)` — pagination cursor des délégués (`createdAt` asc, 500/page)
- `event(id).config.branding` — nom + logo de l'event
- `event(id).children(eventType: [SESSION], first: 500, pageToken)` — **sessions du congrès** (utilisé par `fetchEventSessions` pour enrichir Live/Replay : title, type, start, end, duration). Pagination via `nextPageToken`.
- `getEvent(id).config.mobileApplicationId` — service registration

Delegate fields : `givenName/familyName/email/status/gender/company/occupation/jobTitle/qualification/title/createdAt/checkedInDate/gdpr/categories/contactId/externalContactId/externalId/firstOnboardingConnection/notes`, `primaryAddress { countryCode city zipCode country.code }`, `registrations { id type status categories accessDays }`, `badges { id type deliveredAt deliveredBy storage.publicUrl qrCode.value/decodedValue }`, et `contact { ... on Person { externalIds { value type } memberships.items.type apps { id lastUsed version name platform } } }`.

Le **zipCode** alimente la carte France (déduction du département → région INSEE via `frenchRegions.js`).

## Business Rules (POC)

- **Pending count:** `d.status` case-insensitive match on `"pending"`
- **Registered delegates:** Status `"registered"` (case-insensitive) — base population pour la plupart des KPIs (dénominateur des taux)
- **Restants sans badge:** Delegates with status `registered` AND no `checkedInDate`
- **Présence physique (`hasValidCheckin`)** : `checkedInDate` doit être une vraie date parsable par `Date.parse` (truthy seul ne suffit pas — un champ string vide ou bidon est traité comme non-checké)
- **Onboarding %:** Based on `registered` count (only registered delegates can access onboarding)
- **Mobile app usage:** Delegates whose `contact.apps` contains an entry matching `mobileApplicationId` from config, with `lastUsed` < 3 months. KPI hidden if no `mobileApplicationId` configured.
- **Badges & Check-in tab:** Totals (badges delivered %, check-in %) are relative to `registered` count, not total delegates
- **Mix des présents** (ComparisonTab + BadgesTab) : population `status = registered AND checkedInDate non null/valide`
- **Live/Replay "sans présence physique"** : jointure entre `user_id` ES et délégué (clés candidates : `d.id`, `d.contactId`, `d.externalContactId`, `d.externalId`, `d.contact.externalIds[].value`). Compte les délégués **matched** dont `checkedInDate` est invalide. Les viewers ES non liés sont catégorisés `unknown` et exclus du KPI.
- **Bucketage Live "par jour"** : `sessionEnd` (jour de diffusion live), fetché via GraphQL puis fallback ES
- **Bucketage Replay "par jour"** : `timestamp` du visionnage (date où le user a regardé la VOD, possiblement très éloignée de la session originale)

## Auto-refresh

- Data refreshes automatically every 10 minutes (registrations, scans, live, replay — même cadence)
- Countdown timer displayed under the refresh button, updates every 10 seconds
- Manual refresh shows a confirmation dialog
- During refresh, a progress bar appears above the tabs (not replacing content)

**Cache singleton pour `useLive` et `useReplay`** : module-level `Map<eventId, instance>` qui retourne la **même** instance réactive à chaque appel `useLive(eventId)` / `useReplay(eventId)`. Évite que naviguer entre Overview → Live → Replay → Overview ne déclenche 3 fetchs séparés. Le `setInterval` reste vivant au niveau module (pas de cleanup onUnmounted car partagé).

## Exports

**PDF** (`useExportPdf.js`) :
- Tous les onglets (sauf le node groupe "Registration") en A4 landscape avec sauts de page
- Layout maison jsPDF : cover, page de titre par onglet, KPI grid (1 colonne), **KPI compare grid 3 colonnes** `A | Δ | B` avec chip delta coloré (good/bad/neutral), charts 4-up, analyse textuelle multi-pages
- Maps choropleth (FR + monde) : fallback **html2canvas** sur le chart-card entier (HD chart re-render ne marche pas pour chartjs-chart-geo à cause du GeoJSON fetch async)
- Filename: `stats-{eventName}-{date}.pdf`

**PPTX** (`useExportPptx.js`) :
- Slides natives Chart.js quand possible (bar, line, doughnut), sinon image HD via `chartToHighDpiImage`
- Même KPI compare 3-col + analyse textuelle
- Couleurs CYIM + Poppins
- Filename: `stats-{eventName}-{date}.pptx`

**Extraction DOM** (`exportSpec.js`) : walker qui parcourt un onglet, identifie `.kpi-grid`, `.kpi-compare-grid`, `.chart-card`, `.charts-row`, `.table-container`, et produit une spec à exporter. Détecte les choropleth/legends custom et force la capture html2canvas. Cache le `.badge-type-filter` pendant la capture.

**Analyse textuelle** (`generateAnalysis.js`) : enrichie avec taux de présence, no-show, mix des présents (status registered + checkedIn), comparatif en points de pourcentage, diversité géographique, mobile app, délai médian inscription→check-in.

**CSV** (`CsvButton.vue` + `exportCsv.js`) :
- Per-chart CSV export button available on individual charts/tables
- Semicolon-separated (`;`), FR locale, with proper escaping

All export buttons show spinner + disabled state during generation.

## Conventions

- Language: French UI labels, French comments, English code identifiers
- No linter or formatter configured — follow existing style
- No component library — all styling via scoped/global CSS with shared classes (`.kpi-card`, `.chart-card`, `.data-table`)
- GraphQL queries are inline strings in `api/graphql.js`, not `.graphql` files
- No state management library — composables with `ref`/`readonly` only
- Status comparisons are case-insensitive (`.toLowerCase()`)

## Limitations

- Auto-refresh reloads all data (no delta/incremental)
- Sequential pagination can be slow for large events (>5000 delegates)
- Cross-filtering recomputes all stats on each click (OK for <50K delegates)
- Badge delivery counters depend on backend `badges.deliveredAt` field availability
- Data sourced exclusively from the Registration microservice
- Filter state is per-tab and resets on tab switch

## Axes d'evolution (si passage en production)

- **Migrer vers `@platform/common-ui`** — remplacer le CSS custom par les composants du design system CYIM
- **`@platform/localized-ui`** — pour le support bilingue FR/EN si necessaire
- **`@platform/string-format-ui`** — pour standardiser le formatage des nombres/dates
- **Pagination parallele** — lancer les pages en parallele une fois le totalCount connu
- **Utiliser les `metrics` backend** — la query `fetchMetrics` existe deja mais n'est pas utilisee
- **SSE/WebSocket** — pour le refresh incremental au lieu de tout recharger
- **Memoiser les filtres** — ne recalculer que les stats impactees

---

## Onglet "Scans salles & zones" (ajout 2026-05)

Onglet ajoute pour remplacer le microservice `congress/microservices/xlsx-stats` sur le perimetre scans onsite (audience par session, checkin entree congres, scan de zones). Le mode d'acces aux donnees rompt avec le pattern habituel du PoC : **lecture directe d'Elasticsearch depuis le navigateur**, sans passer par Apollo Gateway.

### Architecture (specifique a cet onglet)

| Layer | Fichier | Role |
|-------|---------|------|
| API | `src/api/elasticsearch.js` | Client ES REST direct (`POST /{index}/_search` + pagination `search_after`, batches de 2000). 3 exports : `fetchRoomAudience`, `fetchCongressCheckin`, `fetchZoneAccess` |
| Composable | `src/composables/useRoomScans.js` | Charge les 3 index en parallele via `Promise.all`, expose `{ loading, refreshing, error, progress, audience, checkin, zone, stats, reload }`, auto-refresh 10 min |
| Compute | `src/utils/computeScanStats.js` | Pure function `computeAllScanStats({ audience, checkin, zone })` qui normalise les 3 schemas en un objet unifie `{ kind, delegateId, fullName, ..., sessionId, zoneId, direction, timestamp }` et agrege les KPI |
| Composant | `src/components/tabs/ScansTab.vue` | Onglet autonome qui consomme `useRoomScans(eventId)` directement — **ne recoit AUCUNE prop** de `StatisticsView` |
| Proxy | `vite.config.js` `/api/es` | Forward dev vers `VITE_ES_URL` (defaut `http://192.168.201.176:9200`, IP interne cluster ES). Pas equivalent prod. |

### Sources ES consommees

3 index Elasticsearch alimentes par UN seul job Flink (`congress/flink/jobs/sql-scripts/jobs/stats_room_scans.sql`) qui consomme UN topic Kafka (`cyim.webhooks` produit par l'app mobile de scan) :

| Index | Semantique |
|-------|-----------|
| `stats_user__onsite-audience-per-session-per-user` | Scan entree de salle (audience par session). **Attention** : tirets et non underscores. |
| `stats_user__onsite_congress_checkin_per_user` | Checkin entree site |
| `stats_user__onsite_zone_checkin_per_user` | Acces zones (stands, lounges) |

Requete envoyee, identique pour les 3 : `{ query: { term: { "congress_id.keyword": eventId } }, sort: [{ _id: "desc" }], size: 2000 }` + `search_after` pour les batches suivants.

### Choix d'implementation NON optimaux

Ces choix sont assumes pour un PoC (livraison rapide, perimetre chirurgical), mais doivent etre repris avant la prod :

1. **ES expose via proxy applicatif sans auth ni whitelist**
   - **Probleme** : le browser tape sur `/api/es/{index}/_search` qui forwarde tel quel vers ES. Aucune authentification, aucun whitelist d'index, aucun rate limiting. Un utilisateur authentifie cote app pourrait requeter n'importe quel index ES du cluster, ou faire un `_search` lourd.
   - **Prod** : creer un resolver GraphQL federe `scanStatistics(eventId: ID!, filters: ScanFilters)` cote `registration-badges` (ou nouveau micro `stats`). Le resolver fait l'auth Cerbos (ex: `event:stats:read`), interroge ES en aggs serveur, retourne un objet structure. Supprimer le proxy `/api/es`.

2. **Tout charge en RAM cote navigateur**
   - **Probleme** : `audience.value`, `checkin.value`, `zone.value` sont des arrays de hits ES bruts. Sur un gros congres (>100k scans), la memoire et les `computed` deviennent lourds.
   - **Prod** : utiliser les agregations ES (`size: 0` + `terms`, `date_histogram`, `cardinality`) pour ne recuperer que les KPI calcules cote ES. Reserver le download exhaustif a un clic explicite "Export complet".

3. **Composant autonome qui fetch a l'ouverture — PDF export degrade**
   - **Probleme** : `ScansTab.vue` lance son `useRoomScans` au mount. Si l'utilisateur clique sur "PDF" avant d'avoir visite l'onglet une 1ere fois, le rendu PDF integre l'etat "loading" au lieu des donnees. Cf. `useExportPdf` qui rend tous les tabs simultanement avec un `waitForCharts` de 1500ms — insuffisant pour un round-trip ES.
   - **Prod** : lifter `useRoomScans` au niveau de `StatisticsView.vue`, exposer `scanStats` en plus de `stats` dans la composition root, passer `scanStats` en prop au `ScansTab` comme les autres tabs.

4. **Pas de cross-filtering (`useFilteredStats` non utilise)**
   - **Probleme** : aucun click-to-filter dans l'onglet, pas de `FilterBanner`. Le tableau a juste un filtre simple par `kind` (salle/entree/zone). Les charts ne sont pas cliquables (`@select` non emis).
   - **Prod** : adapter `useFilteredStats` pour fonctionner sur des scans (pas des delegates) : filtres par jour, par session, par zone, par badge type, par direction. Rendre les charts cliquables.

5. **Heuristique timestamp ms vs secondes**
   - **Probleme** : `computeScanStats.dayHourFromTimestamp` detecte ms vs s avec `< 10^12`. Fragile si Flink change la forme du timestamp.
   - **Prod** : standardiser le mapping ES en `date` typee cote Flink, ne plus avoir a deviner cote browser.

6. **Detecteur `direction` heuristique**
   - **Probleme** : `normalizeDirection` mappe `in*` / `entr*` / `out*` / `sort*` vers `in` / `out`. Fragile si la valeur du champ ES change.
   - **Prod** : enum strict `IN | OUT | UNKNOWN` fige cote Flink + type ES `keyword`.

7. **Nom d'index hardcode et incoherent**
   - **Probleme** : `INDEX.audience` utilise des tirets (`stats_user__onsite-audience-per-session-per-user`), les deux autres des underscores. Incoherence venant de Flink.
   - **Prod** : alias ES versionne (ex `scans-audience-current`) cote Flink + frontend, eviter le nommage casse-tete.

8. **Limite tableau 200 lignes en dur**
   - **Probleme** : seules les 200 premieres lignes sont rendues, le reste est uniquement accessible via export CSV.
   - **Prod** : virtualization (`vue-virtual-scroller` ou TanStack Virtual) ou pagination ES cote serveur.

9. **Pagination ES sequentielle**
   - **Probleme** : `search_after` est sequentiel, pas parallele. Sur 50k scans = 25 round-trips.
   - **Prod** : remplace par des aggs (cf. point 2). Si l'export brut reste necessaire, utiliser un `_pit` (point in time) + `slice` pour paralleliser.

10. **Pas d'incremental refresh**
    - **Probleme** : auto-refresh 10 min recharge TOUT (idem `useStatistics`).
    - **Prod** : ES PIT + recherche delta sur `timestamp > last_seen`, ou SSE depuis un backend qui ecoute le topic Kafka source `cyim.webhooks`.

11. **Champs delegues manquants vs xlsx-stats**
    - **Probleme** : les docs ES n'ont pas `profession`, `workingPlace`, `speciality`, `gdpr`, `externalId`, `phone`, `city`. `xlsx-stats` les joignait depuis Mongo Registration.
    - **Prod** : jointure cote browser entre `scans` et `delegates` (deja charges par `useStatistics`) via une `Map<delegateId, delegate>`, pour enrichir le tableau et permettre des filtres metier.

12. **Pas de gestion RGPD**
    - **Probleme** : `xlsx-stats` anonymise (`***`) les delegues sans flag GDPR (cf. `generateZoneExport` avec `anonymizeGpdr`). L'onglet Scans affiche fullName/email en clair.
    - **Prod** : reutiliser la jointure du point 11 pour lire `delegate.gdpr` et masquer les champs nominatifs si false.

13. **Pas de fallback CORS / endpoint prod**
    - **Probleme** : le code utilise `import.meta.env.DEV ? "/api/es" : import.meta.env.VITE_ES_URL`. En prod l'app supposerait que `VITE_ES_URL` pointe sur un endpoint accessible depuis le browser — soit ES expose, soit un proxy nginx. Aucun fallback n'est documente.
    - **Prod** : remplace par un resolver GraphQL (cf. point 1), `VITE_ES_URL` devient inutile.

### Chemin de migration recommande

Pour passer du PoC a la prod, ordre conseille :
1. Creer un resolver GraphQL `scanStatistics(eventId, filters)` cote `registration-badges` (ou nouveau micro `stats`) qui retourne les agregations + un echantillon de scans bruts pour le tableau. Auth Cerbos.
2. Supprimer `src/api/elasticsearch.js` et le proxy `/api/es`, brancher `useRoomScans` sur `useGQLQueryStore().query()`.
3. Lifter `useRoomScans` dans `useStatistics` (passage en prop comme les autres tabs) — corrige le PDF export.
4. Implementer cross-filtering + jointure avec `delegates` pour enrichissement + masquage RGPD.
5. Migrer la liste tableau vers une virtualization + pagination ES serveur (pour ne plus charger 100k lignes cote browser).
6. Migrer les nommages d'index ES vers des alias coherents (`scans-audience-current` au lieu de `stats_user__onsite-audience-per-session-per-user`).

---

## Onglets "Live" et "Replay" (ajout 2026-05)

Mêmes problématiques que Scans (ES direct depuis browser, pas d'auth applicative) mais avec un **enrichissement croisé GraphQL** pour combler les manques du pipeline ES.

### Architecture

| Layer | Fichier | Role |
|-------|---------|------|
| ES | `INDEX.live = "stats_user__live-view-duration-per-user-per-session"` | 1 doc par (user, session) — pas d'origine, pas de durée de session, parfois pas de timestamp fiable |
| ES | `INDEX.replay = "stats_user__vod-view-per-user-per-session-per-origin"` | 1 doc par (user, session, origin) — expose `origin` (web/mobile/embed) |
| GraphQL | `fetchEventSessions(eventId)` | `event(id).children(eventType: [SESSION])` retourne `{id, title, type, start, end, duration}` — palie les manques ES |
| Compose | `useLive` / `useReplay` | `Promise.all([fetchXViews, fetchEventSessions])` → `sessionMap` Map<sessionId, session> → enrichit chaque hit |
| Compute | `computeLiveStats(hits, sessionMap)` / `computeReplayStats(hits, sessionMap)` | Normalize avec fallbacks (sessionTitle/type/start/end viennent du GraphQL en priorité, ES en backup) |

Les deux KPIs sur Overview ("Délégués uniques en live" / "Délégués uniques en replay") consomment les mêmes `useLive` / `useReplay` que les onglets dédiés — grâce au cache singleton, 1 seul fetch même si OverviewTab + LiveTab sont rendus en parallèle (export PDF).

### Jointure ES live/replay ↔ délégués registration

Les indices ES exposent `user_id` (keycloak identity), pas le `delegate_id` registration. Pour relier :
- On indexe chaque délégué sous toutes ses clés candidates : `d.id`, `d.contactId`, `d.externalContactId`, `d.externalId`, `d.contact.externalIds[].value`
- Pour chaque hit ES, on cherche un match dans cette Map → 3 catégories : `checkedIn` / `noCheckin` / `unknown` (no match)
- Le KPI "Sans présence physique" compte uniquement les **matched** sans `hasValidCheckin(d)` (exclut donc les unknown — viewers anonymes ou ID format imprévu)

### KPIs et charts spécifiques

**LiveTab** :
- KPIs : Délégués uniques (live), **Sans présence physique** (jointure registration), Vues totales, Durée moyenne / vue
- Vues par origine (camembert + légende) si ES expose un champ origine
- Délégués uniques par jour : bucké sur `session_end` (= jour de diffusion)
- **Délégués uniques par tranche de 30 min** (session_end) — vue chronologique fine
- Top sessions par audience unique
- Engagement : tranches "1 / 2-5 / 6-10 / 10+" sessions consultées par délégué
- Vues par session_type (camembert) **cliquable → filtre le tableau détail**
- Tableau détail avec session_id, session_title, session_type
- Console.log debug : structure du 1er hit ES + liste des délégués `live sans check-in`

**ReplayTab** :
- KPIs : Délégués uniques (replay), **Sans présence physique**, Vues totales, Durée moyenne
- Vues totales par origine (camembert + légende)
- Délégués uniques par jour : bucké sur le **timestamp de la vue** (= jour de visionnage, peut être très éloigné de la session originale)
- Engagement : tranches identiques
- Top sessions VOD par audience unique
- Tableau détail avec session_id, session_title, origine
- Console.log debug similaire

### Choix d'implementation NON optimaux (en plus de ceux listés pour Scans)

1. **Champs ES non standardisés**
   - **Problème** : les champs timestamp/duration ont des noms variables suivant la version du pipeline xlsx-stats (`timestamp`, `view_timestamp`, `viewing_time`, `start_time`, `created_at`, …). Le code essaie une dizaine de fallbacks.
   - **Prod** : standardiser le mapping ES côté Flink (`view_timestamp` typed `date`, `view_duration` typed `long`).

2. **Cache singleton avec setInterval éternel**
   - **Problème** : le module-level `setInterval` n'est jamais clear. Sur une SPA dashboard ouverte 24/7, ça consomme. En dev, le HMR peut accumuler des timers si Vite hot-reloads.
   - **Prod** : remonter `useLive`/`useReplay` au niveau de `StatisticsView.vue` (comme `useStatistics`), avec `onUnmounted(clearInterval)`. Le cache module devient inutile.

3. **Enrichissement GraphQL "best effort"**
   - **Problème** : si `fetchEventSessions` échoue (event-microservice indispo, network), on continue silencieusement avec les données ES partielles. Le user voit potentiellement des sessions sans titre/type/end.
   - **Prod** : exposer un état d'erreur dédié + retry.

4. **Pas de jointure session live ↔ session VOD**
   - **Problème** : un même `session_id` peut apparaître dans live ET replay (le live a aussi été enregistré). Les KPIs Live/Replay sont calculés indépendamment.
   - **Prod** : utile pour analyser le funnel "regardé en live puis revu en replay" — pas implémenté ici.
