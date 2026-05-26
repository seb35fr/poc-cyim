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

Vue 3 + Vite 6 + Vue Router + Chart.js 4 (vue-chartjs) + chartjs-chart-geo (world/FR maps) + d3-geo (Lambert projection FR, fallback mercator) + chartjs-plugin-datalabels + jspdf + pptxgenjs + html2canvas. No UI framework (custom CSS with CSS variables defined in `App.vue`).

**Vite alias** : `@/` → `/src/` (configuré dans `vite.config.js`). Tous les nouveaux imports utilisent `@/utils/...` au lieu de `../../utils/...`. Les imports legacy `../../` restent valides — pas de migration forcée.

Sources de données :
- **Apollo Gateway** (GraphQL) : délégués + config event + sessions (`event(id).children(eventType: SESSION)`)
- **Elasticsearch direct** (proxy `/api/es` en dev) : scans onsite (audience, checkin, zone), live views, VOD replay views

## Architecture

**Data flow:** `api/graphql.js` fetches all delegates via cursor-paginated `searchDelegates` (500/page) + event config via `getEvent` → `utils/computeStats.js` computes statistics lazily (getter par section) → composable `useStatistics` exposes reactive state + auto-refresh every 10 min → tab components render charts with cross-filtering via `useFilteredStats`. Live/Replay/Scans/BadgeFilter sont **liftés** au niveau `StatisticsView` et propagés en prop aux tabs.

**Key layers:**

| Layer | Files | Role |
|-------|-------|------|
| API | `src/api/graphql.js` | Apollo Gateway : `searchDelegates`, `getEvent` (config + mobileAppId), `fetchEventSessions`. Wrapper `gqlFetch` log opName + elapsed + timeout detection. |
| | `src/api/elasticsearch.js` | ES direct (proxy `/api/es`) : `fetchRoomAudience`, `fetchCongressCheckin`, `fetchZoneAccess`, `fetchLiveViews`, `fetchReplayViews` |
| Computation | `src/utils/computeStats.js` | **Lazy** `computeAllStats(delegates, mobileAppId)` : retourne un objet à getters, chaque section (`global`, `demographics`, `registrations`, `temporal`, `checkinFlow`, `badges`, `onboarding`, `mobileApp`) calculée uniquement à premier accès et mémoïsée. API publique identique au monolithique précédent. |
| | `src/utils/computeScanStats.js` | Agrège les 3 index ES de scans onsite |
| | `src/utils/computeLiveStats.js` | Normalise hits live + enrichit via `sessionMap` (GraphQL) pour récupérer sessionTitle/type/start/end/duration que ES n'expose pas |
| | `src/utils/computeReplayStats.js` | Idem pour VOD replay |
| Composables | `src/composables/useStatistics.js` | Délégués + config, auto-refresh 10 min. `debug.log` (DEV-only) des délégués checkedIn sans badge délivré |
| | `src/composables/useFilteredStats.js` | Cross-filtering : filtre delegates + recompute stats. Expose `filteredDelegates` (en plus de `filteredStats`) |
| | `src/composables/useRoomScans.js` | Scans onsite (audience + checkin + zone) en parallèle, auto-refresh 10 min. **Instancié au niveau StatisticsView** depuis Day 1.3 (cleanup `onUnmounted(clearInterval)`). |
| | `src/composables/useLive.js` | Live views ES + sessions GraphQL en `Promise.all`. **Instancié au niveau StatisticsView**, propagé en prop. Cleanup `onUnmounted`. Plus de cache singleton. |
| | `src/composables/useReplay.js` | Idem pour VOD replay. Même pattern. |
| | `src/composables/useBadgeTypeFilter.js` | Filtre badge type **global** (lifté au niveau StatisticsView). Expose `selected` (Set), `allBadgeTypes`, `filteredDelegates`, `filteredCompareDelegates`, `toggle`, `clear`. La sélection persiste cross-tab. |
| | `src/composables/useDiagnostics.js` | Bus de diagnostics UI (`pushDiagnostic`, `dismissDiagnostic`). Affiche des toasts top-right pour les anomalies data actionnables par l'admin. |
| | `src/composables/useExportPdf.js` | PDF jsPDF, layout maison (KPI compare 3 colonnes A∣Δ∣B, cartes map via html2canvas) |
| | `src/composables/useExportPptx.js` | PPTX pptxgenjs (chart natifs quand possible, sinon image HD) |
| | `src/composables/useExportMarkdown.js` | **Export MD destiné au LLM** (Claude/ChatGPT). Dump complet de toutes les données du dashboard (stats + live + replay + scans + comparaison) avec analyse textuelle. Lecture directe des stats objects, pas de DOM walking. |
| View | `src/views/StatisticsView.vue` | Sidebar hiérarchique. Propriétaire de `liveApi`, `replayApi`, `scansApi`, `badgeFilter` (lifted). Boutons d'export PDF/PPTX/MD. |
| Tabs | `src/components/tabs/*.vue` | OverviewTab, DemographicsTab, RegistrationsTab, TemporalTab, BadgesTab, DataTab, ComparisonTab, ScansTab, **ViewersTab** (kind='live'\|'replay'), **ViewersComparisonTab** (générique), ExportsTab |
| Charts | `src/components/charts/*.vue` | DoughnutChart, HBarChart, LineChart, StackedBarChart (avec `@select` + `activeLabel` + `showTotal`), ChoroplethMap, FrenchRegionMap. **Composants composites** : `RegionalMaps.vue` (monde + FR + DOM), `KpiCompareGrid.vue` (grille KPI 3-col A∣Δ∣B partagée ComparisonTab + ViewersComparisonTab) |
| Filter UI | `src/components/FilterBanner.vue` | Filtres cross-clic actifs avec boutons d'effacement |
| | `src/components/BadgeTypeFilter.vue` | Pills multi-select badge type. Composant UI seul, l'état vient de `useBadgeTypeFilter`. |
| Diagnostics UI | `src/components/DiagnosticsBanner.vue` | Toasts fixed top-right alimentés par `useDiagnostics`. Monté globalement dans `App.vue`. |
| CSV | `src/components/CsvButton.vue` | Per-chart CSV download, `src/utils/exportCsv.js` |
| Utils | `src/utils/formatters.js` | `fmt(n)`, `pct(a, b)`, `shortName(name, maxLen)`, `formatDurationHMS(sec)` — partagés (avant : 15 redéfinitions dans les tabs) |
| | `src/utils/debug.js` | Wrapper `debug.log` / `debug.table` no-op en PROD via `import.meta.env.DEV` |
| | `src/constants.js` | `AUTO_REFRESH_MS`, `COUNTDOWN_TICK_MS`, `DELEGATES_PAGE_SIZE`, `SLOW_QUERY_THRESHOLD_MS`, `ES_BATCH_SIZE` |
| | `src/utils/viewerJoin.js` | Jointure ES `user_id` (Keycloak ACCOUNT) ↔ délégué Mongo. `buildDelegateLookup`, `getRemoteOnlyDelegateIds`, `getCheckedInDelegateIds`, `hasValidCheckin`, `getKeycloakId`. **Warnings auto** (console + UI banner pour la couverture délégués) si jointure suspecte. |
| | `src/utils/countries.js` | Country code ↔ continent/flag |
| | `src/utils/frenchRegions.js` | Mapping département (2 chars du zipCode) → région INSEE + libellés |
| | `src/utils/parisTime.js` | `parisDateParts(iso)` (UTC→Paris CET/CEST), `parisDay(iso)`, `parisDateTime(iso)` (format CSV "YYYY-MM-DD HH:mm:ss") |
| | `src/utils/typeColors.js` | Palette déterministe par type d'inscription (hash sur libellé), 12 couleurs |
| | `src/utils/heatColor.js` | Échelle de chaleur partagée (gris→vert→orange→rouge) pour les cartes |
| | `src/utils/burndown.js` | Courbes de décroissance (restants à check-in) absolue/relative, paramétrable par step (15 min / 30 min) |
| | `src/utils/checkinByType.js` | Bar horizontale stacked check-in/restants par type de badge (partagé BadgesTab + ComparisonTab) |
| | `src/utils/buildSessionAttendance.js` | Croise scans audience + live + replay pour une session — utilisé par ExportsTab pour générer CSV par session |
| | `src/utils/exportSpec.js` | DOM walker : extrait KPI cards + chart cards d'un onglet pour export PDF/PPTX |
| | `src/utils/renderChartHD.js` | Re-render Chart.js sur canvas offscreen 1600×900 pour export |
| | `src/utils/generateAnalysis.js` | Analyse textuelle (présence, no-show, mix, comparatif Δ pts, etc.) — utilisée dans PDF/PPTX/MD |

**Stats object structure** (returned by `computeAllStats`) — getters lazy : `{ global, demographics, registrations, temporal, checkinFlow, badges, onboarding, mobileApp }`. Chaque tab consomme un sous-ensemble (typiquement 2-3 sections), ce qui évite de recalculer les sections inutiles à chaque cross-filter.

**Navigation hiérarchique (sidebar) :**
- Vue d'ensemble (leaf)
- Démographie (leaf)
- **Registration** (groupe non cliquable) → Inscriptions · Dynamique · Badges & Check-in · Données · Comparatif (conditionnel `?compareWith=…`)
- Live (leaf, ou groupe Single/Comparatif si `?compareWith=…`)
- Replay (idem)
- Scans QR (leaf)
- Exports (leaf — interface de génération CSV par session)

Le node "Registration" et "Exports" n'apparaissent pas dans les exports PDF/PPTX (cf. `exportTabs` qui aplatit les leaves et exclut "exports").

**Cross-filtering:** Each tab uses `useFilteredStats(getDelegates, getMobileAppId)` independently. Clicking a chart segment filters delegates and recomputes all stats within that tab. Charts accept `activeLabel` prop to dim non-selected segments. Filter state resets when switching tabs (v-if destroys/recreates components).

**Filtre badge type global** (Overview + BadgesTab + ComparisonTab) : `useBadgeTypeFilter` instancié dans `StatisticsView`, propagé en prop. La sélection **persiste cross-tab** (avant Day 3 : chaque tab avait sa propre instance, état perdu au switch). Logique de match : `delegateBadgeType(d)` = type attendu (1er badge en base ou 1ère registration). Le composant `<BadgeTypeFilter>` ne gère que l'UI ; l'état vit dans le composable.

**Routing:** Single route `/:eventId` → `StatisticsView.vue`. Root `/` redirects to `/no-event`. Query param `?compareWith=<otherEventId>` active l'onglet Comparatif et précharge un 2ᵉ event.

**Heure de Paris** : `parisDateParts(iso)` est utilisée partout où on bucke par jour/heure (check-in, deliveredAt, live, replay). Évite les décalages UTC sur les events tardifs et gère CET/CEST automatiquement.

**Chart.js setup:** Global registration in `main.js` (ArcElement, BarElement, LineElement, etc. + ChartDataLabels plugin with `display: false` by default). Font: Poppins. Charts emit `@select` events on click for cross-filtering. Certains charts (BadgesTab device, Progression par type, StackedBarChart totals) utilisent des **plugins Chart.js custom** pour dessiner les totaux en bout de barre — contournement du `display: false` global de datalabels.

**Design system:** CYIM design tokens (Poppins, `#1E4E66` primary, `#30DD92` accent, `#6F45FF` purple, `#414141` text). CSS variables centralized in `App.vue :root`. Palette par type d'inscription propagée à Overview/Registrations/Comparison/Badges. Échelle de chaleur propagée aux cartes.

## GraphQL Queries

Entry points utilisés :
- `event(id).searchDelegates(...)` — pagination cursor des délégués (`createdAt` asc, 500/page)
- `event(id).config.branding` — nom + logo de l'event
- `event(id).children(eventType: [SESSION], first: 500, pageToken)` — sessions du congrès (enrichit Live/Replay)
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

**PDF** (`useExportPdf.js`) :
- Tous les onglets en A4 landscape avec sauts de page
- Layout maison jsPDF : cover, page de titre par onglet, KPI grid, KPI compare grid 3 colonnes A∣Δ∣B, charts 4-up, analyse textuelle multi-pages
- Maps choropleth : fallback **html2canvas** sur le chart-card entier (chartjs-chart-geo ne supporte pas le HD re-render à cause du GeoJSON fetch async)
- Filename: `stats-{eventName}-{date}.pdf`

**PPTX** (`useExportPptx.js`) : slides natives Chart.js quand possible, sinon image HD. Filename: `stats-{eventName}-{date}.pptx`

**MD** (`useExportMarkdown.js`) — destiné aux LLM (Claude/ChatGPT/Gemini) :
- Dump **complet** : métadonnées, chiffres clés globaux, démographie (pays/continents/genre/professions/qualifications/sociétés), inscriptions (statuts/types/catégories avec décomposition physique/distanciel/no-show), temporel, check-in flow, badges, onboarding, mobile, live, replay, scans QR, comparaison, analyse textuelle
- Lecture **directe** des stats objects (pas DOM walking — beaucoup plus propre pour MD)
- Footer avec **suggestions de prompts** pour l'utilisateur (résumé, communiqué, comparaison, slides...)
- Filename: `bilan-{eventName}-{date}.md`

**CSV par session** (`ExportsTab.vue` + `buildSessionAttendance.js`) : croise audience scans + live + replay pour produire 1 CSV par session avec colonnes `Profession / Fonction / Spécialité / Mode d'exercice / RPPS / Présent physique / Vu en live / Vu en replay / Durées`.

**Extraction DOM** (`exportSpec.js`) : walker qui parcourt un onglet, identifie `.kpi-grid`, `.kpi-compare-grid`, `.chart-card`, `.charts-row`, `.table-container`. Détecte les choropleth et force la capture html2canvas. Cache le `.badge-type-filter` pendant la capture.

**Analyse textuelle** (`generateAnalysis.js`) : bullet points par section, taux de présence, no-show, mix des présents, comparatif Δ pts, diversité géographique, mobile app, délai médian inscription→check-in. Réutilisée par PDF, PPTX et MD.

**CSV par chart** (`CsvButton.vue` + `exportCsv.js`) : per-chart CSV export button. Semicolon-separated (`;`), FR locale, BOM UTF-8, escape `"` et `;`.

All export buttons show spinner + disabled state during generation.

## Diagnostics UI

`<DiagnosticsBanner>` monté globalement dans `App.vue` affiche des toasts fixed top-right alimentés via `pushDiagnostic` du composable `useDiagnostics`. Cas couverts :

1. **Couverture Keycloak basse côté délégués** (`viewerJoin.buildDelegateLookup`) — quand moins de 50% des délégués ont un `emailAddresses.source.id` (type ACCOUNT) renseigné, la jointure live/replay va manquer beaucoup de monde et les KPI "sans présence physique" deviennent silencieusement faux. Toast persistant (pas d'auto-dismiss) demandant à l'admin de prévenir l'équipe technique.
2. **Échec `fetchEventSessions`** (`useLive` + `useReplay`) — si l'enrichissement GraphQL plante, les titres/types/durées de session manquent. Toast distinct pour Live et Replay.

Faible match côté ES (`getRemoteOnlyDelegateIds`) → console.warn uniquement (admin n'y peut rien, c'est un problème pipeline Flink).

Fingerprint partagé entre `console.warn` et `pushDiagnostic` évite la duplication quand un computed se recalcule sur le même dataset.

## Conventions

- Language: French UI labels, French comments, English code identifiers
- No linter or formatter configured — follow existing style
- No component library — all styling via scoped/global CSS with shared classes (`.kpi-card`, `.chart-card`, `.data-table`)
- GraphQL queries are inline strings in `api/graphql.js`, not `.graphql` files
- No state management library — composables with `ref`/`readonly` only
- Status comparisons are case-insensitive (`.toLowerCase()`)
- **Composables stateful** (auto-refresh) sont **liftés** au niveau `StatisticsView` et propagés en prop aux tabs. Évite cache module-level, timers fantômes en HMR, fetchs dupliqués.
- **Pas de v-if au root d'un composant** — Vue 3 a un bug de patch quand le seul root template alterne entre comment vide et vrai élément. Mettre le v-if côté parent (`<Foo v-if="..." />`).

## Limitations

- Auto-refresh reloads all data (no delta/incremental)
- Sequential pagination can be slow for large events (>5000 delegates)
- Cross-filtering recomputes affected stats sections on each click — laziness limite le coût, mais pas de mémoïsation cross-clic
- Badge delivery counters depend on backend `badges.deliveredAt` field availability
- Filter cross-clic state is per-tab and resets on tab switch (badge type filter en revanche est global)

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
| Compute | `src/utils/computeScanStats.js` | Pure function `computeAllScanStats({ audience, checkin, zone })` qui normalise les 3 schemas en un objet unifié `{ kind, delegateId, fullName, ..., sessionId, zoneId, direction, timestamp }` et agrège les KPI |
| Composant | `src/components/tabs/ScansTab.vue` | Reçoit `scansApi` en prop |
| Proxy | `vite.config.js` `/api/es` | Forward dev vers `VITE_ES_URL` (defaut `http://192.168.201.176:9200`). Pas équivalent prod. |

### Sources ES consommées

3 index alimentés par UN seul job Flink (`congress/flink/jobs/sql-scripts/jobs/stats_room_scans.sql`) qui consomme UN topic Kafka (`cyim.webhooks` produit par l'app mobile de scan) :

| Index | Sémantique |
|-------|-----------|
| `stats_user__onsite-audience-per-session-per-user` | Scan entrée de salle (audience par session). **Attention** : tirets et non underscores. |
| `stats_user__onsite_congress_checkin_per_user` | Checkin entrée site |
| `stats_user__onsite_zone_checkin_per_user` | Accès zones (stands, lounges) |

Requête : `{ query: { term: { "congress_id.keyword": eventId } }, sort: [{ _id: "desc" }], size: 2000 }` + `search_after` pour les batches suivants.

### Choix d'implémentation NON optimaux

Ces choix sont assumés pour un PoC (livraison rapide, périmètre chirurgical), mais doivent être repris avant la prod :

1. **ES exposé via proxy applicatif sans auth ni whitelist**
   - **Problème** : `/api/es/{index}/_search` forwarde tel quel vers ES. Aucune authentification, aucun whitelist d'index, aucun rate limiting.
   - **Prod** : créer un resolver GraphQL fédéré `scanStatistics(eventId, filters)` côté `registration-badges` (ou nouveau micro `stats`). Auth Cerbos. Supprimer le proxy `/api/es`.

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

11. **Champs délégués manquants vs xlsx-stats** (profession, workingPlace, speciality, gdpr, externalId, phone, city). Prod : jointure browser entre `scans` et `delegates` (déjà chargés par `useStatistics`).

12. **Pas de gestion RGPD**. xlsx-stats anonymise (`***`) les délégués sans flag GDPR. Prod : utiliser la jointure du point 11 + `delegate.gdpr`.

13. **Pas de fallback CORS / endpoint prod**. Prod : remplacer par resolver GraphQL.

### Chemin de migration recommandé

1. Créer un resolver GraphQL `scanStatistics(eventId, filters)` côté `registration-badges` qui retourne aggs + échantillon de scans bruts. Auth Cerbos.
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
- Délégués uniques par tranche de 30 min (sessionEnd)
- Top sessions par audience unique
- Engagement : tranches "1 / 2-5 / 6-10 / 10+"
- Vues par session_type (camembert) **cliquable → filtre le tableau détail**
- Tableau détail avec sessionType, sessionStart

**Replay (kind='replay')** :
- KPIs identiques
- Pas de session_type chart (seul Live l'expose proprement)
- Délégués uniques par jour : bucké sur `timestamp` du visionnage
- Tableau détail avec colonne Origine en pill

### Choix d'implémentation NON optimaux

1. **Champs ES non standardisés** — timestamp/duration ont des noms variables (`timestamp`, `view_timestamp`, `viewing_time`, etc.). Le code essaie une dizaine de fallbacks. Prod : standardiser le mapping côté Flink.

2. ~~**Cache singleton avec setInterval éternel**~~ ✅ **Résolu** (Day 1.3) : `useLive`/`useReplay` liftés dans `StatisticsView`, cleanup `onUnmounted(clearInterval)`. Plus de cache module.

3. ~~**Enrichissement GraphQL "best effort"**~~ ✅ **Résolu** (#12) : `fetchEventSessions` qui échoue déclenche `pushDiagnostic` → toast UI top-right.

4. **Pas de jointure session live ↔ session VOD** — un même `session_id` peut apparaître dans les deux. KPIs calculés indépendamment. Prod : utile pour le funnel "regardé en live puis revu en replay".

---

## Export Markdown pour LLM

`useExportMarkdown` produit un dump complet conçu pour être donné en entrée à un LLM (Claude, ChatGPT, Gemini). Le DG voulait pouvoir générer automatiquement des bilans, comparaisons, emails clients, slides à partir des données du dashboard sans repasser par un humain qui lit le PDF.

**Pourquoi MD** : les LLM ont été entraînés sur des tonnes de markdown (READMEs, docs), ils en extraient la structure (titres, tableaux, listes) sans pré-traitement. Plus pratique que PDF (perte de structure) ou CSV (pas de sémantique).

**Contenu** — toutes les sections du dashboard :
1. Métadonnées (event, ID, filtre badge actif)
2. Chiffres clés globaux (KPI table)
3. Démographie complète (pays top 20, continents, genre, professions, qualifications, sociétés)
4. Inscriptions (statuts, types et catégories avec décomposition physique/distanciel/no-show sur registered, jours d'accès, multi-inscriptions)
5. Temporel (insights, top jours, jour de semaine, hebdo par type)
6. Check-in flow (pic, par jour, top créneaux 15 min)
7. Badges (devices, peak slot/minute, par jour)
8. Onboarding + Mobile app
9. Live (KPI, top sessions, origines, engagement, par jour, 30min slots si dispo)
10. Replay (idem)
11. Scans QR (audience, salles, zones)
12. Comparaison côte-à-côte avec Δ si `?compareWith=`
13. Analyse textuelle (réutilise `generateAnalysis.js`)
14. Footer avec **suggestions de prompts** pour l'utilisateur

Filename : `bilan-{eventName}-{date}.md`. Lecture **directe** des stats objects (pas DOM walking — plus propre, plus complet).

Bouton "MD" couleur accent CYIM dans la sidebar, à côté de PDF / PPTX.
