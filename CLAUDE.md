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

Vue 3 + Vite 6 + Vue Router + Chart.js 4 (vue-chartjs) + chartjs-chart-geo (world map) + html2pdf.js (client-side PDF export). No UI framework (custom CSS with CSS variables defined in `App.vue`).

## Architecture

**Data flow:** `api/graphql.js` fetches all delegates via cursor-paginated `searchDelegates` (500/page) + event config via `getEvent` → `utils/computeStats.js` computes all statistics client-side → composable `useStatistics` exposes reactive state + auto-refresh every 10 min → tab components render charts with cross-filtering via `useFilteredStats`.

**Key layers:**

| Layer | Files | Role |
|-------|-------|------|
| API | `src/api/graphql.js` | Raw GraphQL fetch with Bearer auth, cursor pagination, event config + mobileApplicationId via `getEvent` |
| Computation | `src/utils/computeStats.js` | Pure function `computeAllStats(delegates, mobileAppId)` → grouped stats object |
| Composables | `src/composables/useStatistics.js` | Loads data, auto-refresh 10min, exposes `stats`, `delegates`, `mobileAppId`, `loading`, `refreshing`, `reload` |
| | `src/composables/useFilteredStats.js` | Cross-filtering: filters delegates + recomputes stats per tab |
| | `src/composables/useExportPdf.js` | PDF export via html2pdf.js (all tabs in one PDF) |
| View | `src/views/StatisticsView.vue` | Main layout with tab navigation, refresh countdown, export button |
| Tabs | `src/components/tabs/*.vue` | 5 tabs: Overview, Demographics, Registrations, Temporal, Badges & Check-in |
| Charts | `src/components/charts/*.vue` | Reusable chart wrappers: Doughnut, HBar, Line, StackedBar, ChoroplethMap |
| Filter | `src/components/FilterBanner.vue` | Reusable filter banner showing active filters with clear buttons |
| Utils | `src/utils/countries.js` | Country code → continent/flag mapping |

**Stats object structure** (returned by `computeAllStats`): `{ global, demographics, registrations, temporal, onboarding, checkinFlow, badges }` — each tab consumes a subset.

**Cross-filtering:** Each tab uses `useFilteredStats(getDelegates, getMobileAppId)` independently. Clicking a chart segment filters delegates and recomputes all stats within that tab. Charts accept `activeLabel` prop to dim non-selected segments. Filter state resets when switching tabs (v-if destroys/recreates components).

**Routing:** Single route `/:eventId` → `StatisticsView.vue`. Root `/` redirects to `/no-event`.

**Chart.js setup:** Global registration in `main.js` (ArcElement, BarElement, LineElement, etc. + ChartDataLabels plugin with `display: false` by default). Font: Poppins. Charts emit `@select` events on click for cross-filtering.

**Design system:** CYIM design tokens applied (Poppins, `#1E4E66` primary, `#30DD92` accent, `#6F45FF` purple, `#414141` text). CSS variables centralized in `App.vue :root`. No component library — custom CSS only.

## GraphQL Queries

Two entry points are used:
- `event(id)` — for `searchDelegates` (pagination) and `config.branding`
- `getEvent(id)` — for `config.mobileApplicationId` (registration service config)

Delegate fields include `contact { ... on Person { apps { id lastUsed version name platform } } }` for mobile app usage tracking.

## Business Rules (POC)

- **Pending count:** `d.status` case-insensitive match on `"pending"`
- **Registered delegates:** Status `"registered"` (case-insensitive) — these are the ones expected to pick up a badge
- **Restants sans badge:** Delegates with status `registered` AND no `checkedInDate`
- **Onboarding %:** Based on `registered` count (only registered delegates can access onboarding)
- **Mobile app usage:** Delegates whose `contact.apps` contains an entry matching `mobileApplicationId` from config, with `lastUsed` < 3 months. KPI hidden if no `mobileApplicationId` configured.
- **Badges & Check-in tab:** Totals (badges delivered %, check-in %) are relative to `registered` count, not total delegates

## Auto-refresh

- Data refreshes automatically every 10 minutes
- Countdown timer displayed under the refresh button, updates every 10 seconds
- Manual refresh shows a confirmation dialog
- During refresh, a progress bar appears above the tabs (not replacing content)

## Export PDF

- Exports all 5 tabs in a single A4 landscape PDF with page breaks between tabs
- Temporarily renders all tabs simultaneously during export
- Filename: `stats-{eventName}-{date}.pdf`
- Button shows spinner + "Export en cours…" during generation

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
