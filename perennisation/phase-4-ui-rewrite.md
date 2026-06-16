# Phase 4 — Réécriture UI sur `common-ui`

> **Porte de validation : G1 + G2** (parité des chiffres affichés + recette UX).
> **Risque : moyen**. **Itératif onglet par onglet** (pas de big-bang). Démarre après Phases 1 + 3.

---

## 1. Objectif

Reconstruire l'interface du dashboard dans l'app `statistics-admin` (Phase 3), branchée sur
`stats-core` (Phase 1) et le resolver `scanStatistics` (Phase 2), en réutilisant les
composants `@platform/common-ui` pour tout le générique. Les **charts Chart.js sont
conservés** (aucun équivalent `@platform`).

## 2. Prérequis

- Phase 1 livrée (`stats-core` testé).
- Phase 3 livrée (shell app).
- Phase 2 idéalement livrée (sinon brancher temporairement sur les données existantes).

## 3. Tâches (Claude, itératif)

### 3.1 Plomberie (une fois)
- Données : `api/graphql.js` + pagination maison → `@platform/graphql-core` (`GqlClient`, `GqlConnection`).
- Filtres globaux (`useBadgeTypeFilter`, `useDateRangeFilter`, `FilterBanner`, `BadgeTypeFilter`) → `@platform/filter-core` + `filter-ui`.
- Diagnostics (`DiagnosticsBanner` + `useDiagnostics`) → `common-ui` `useSnackbar`.
- Boutons/modales/tooltips/tables (`CsvButton`, `ScanDetailModal`, `InfoTooltip`, `DataTab`, `ScanDetailTable`) → `common-ui` / Quasar `q-table`.
- Logging (`debug.js`) → `@platform/vue-logger`.
- Tokens CSS (`App.vue`) → `theme-core` / Quasar palette.

### 3.2 Onglets (un par un, à parité avant de passer au suivant)
`OverviewTab` · `DemographicsTab` · `RegistrationsTab` · `TemporalTab` · `BadgesTab` ·
`DataTab` · `ComparisonTab` · `ScansTab` · `ViewersTab` (live/replay) · `ViewersComparisonTab` ·
`ExportsTab` + la vue `StatisticsView` (shell + toolbar filtres).

Chaque onglet : layout Quasar/common-ui, **calcul délégué à `stats-core`**, charts réutilisés,
i18n via `registerI18n`.

### 3.3 Conservé tel quel
- Charts : `DoughnutChart`, `LineChart`, `HBarChart`, `StackedBarChart`, `ChoroplethMap`,
  `FrenchRegionMap`, `RegionalMaps`, `KpiCompareGrid` (~1 100 l.).
- Locales `i18n/` FR/EN (rebranchées).
- `useExportMarkdown` (orchestration export), appelant `stats-core`.

## 4. Critère de sortie (portes G1 + G2)

- Chaque onglet atteint la **parité fonctionnelle et chiffrée** avec le PoC (G1, revalidé à
  chaque livraison) avant de passer au suivant.
- Recette visuelle / UX validée (G2).

## 5. Charge indicative

**18 – 30 j·h** (lots 3 + 4 du mapping §4). Volumineux mais répétitif → forte accélération Claude.
