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

**Data flow:** `api/graphql.js` fetches all delegates via cursor-paginated `searchDelegates` (500/page) → `utils/computeStats.js` computes all statistics client-side → composable `useStatistics` exposes reactive state → tab components render charts.

**Key layers:**

| Layer | Files | Role |
|-------|-------|------|
| API | `src/api/graphql.js` | Raw GraphQL fetch with Bearer auth, cursor pagination, event config |
| Computation | `src/utils/computeStats.js` | Pure function `computeAllStats(delegates)` → grouped stats object |
| Composables | `src/composables/useStatistics.js` | Loads data + exposes `stats`, `loading`, `error`, `reload` |
| | `src/composables/useExportPdf.js` | PDF export via html2pdf.js |
| View | `src/views/StatisticsView.vue` | Main layout with tab navigation |
| Tabs | `src/components/tabs/*.vue` | 6 tabs: Overview, Demographics, Registrations, Temporal, Badges, DayOf |
| Charts | `src/components/charts/*.vue` | Reusable chart wrappers: Doughnut, HBar, Line, StackedBar, ChoroplethMap |
| Utils | `src/utils/countries.js` | Country code → continent/flag mapping |

**Stats object structure** (returned by `computeAllStats`): `{ global, demographics, registrations, temporal, checkinFlow, badges }` — each tab consumes a subset via the `:stats` prop.

**Routing:** Single route `/:eventId` → `StatisticsView.vue`. Root `/` redirects to `/no-event`.

**Chart.js setup:** Global registration in `main.js` (ArcElement, BarElement, LineElement, etc. + ChartDataLabels plugin with `display: false` by default). Font: Inter.

## Conventions

- Language: French UI labels, French comments, English code identifiers
- No linter or formatter configured — follow existing style
- No component library — all styling via scoped/global CSS with shared classes (`.kpi-card`, `.chart-card`, `.data-table`)
- GraphQL queries are inline strings in `api/graphql.js`, not `.graphql` files
- No state management library — composables with `ref`/`readonly` only

## Limitations

- No real-time updates — data loaded once on mount, manual refresh button
- Sequential pagination can be slow for large events
- Badge delivery counters depend on backend `badges.deliveredAt` field availability
- Data sourced exclusively from the Registration microservice
