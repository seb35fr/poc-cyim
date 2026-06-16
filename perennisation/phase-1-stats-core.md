# Phase 1 — Extraction `stats-core` (proof-of-value)

> **Porte de validation : G1** (exactitude des stats — sorties identiques au PoC).
> **Risque : très faible** (rien en prod n'est touché). **Parallélisable** avec la Phase 2.

---

## 1. Objectif

Sortir l'IP métier (~6 500 lignes) de la coquille PoC vers une lib **`@platform/stats-core`**
TypeScript, **sans Vue / réseau / DOM**, couverte par des tests de non-régression. C'est le
**proof-of-value** : si les sorties matchent le PoC à l'identique, la délégabilité de tout le
chantier à Claude est prouvée.

## 2. Prérequis (Phase 0)

- Périmètre §3 et couplages §4 du [cadrage](phase-0-cadrage.md) validés.
- ≥ 1 dump `donnees-*.json` réel capturé (fixtures).
- Accès registry npm privé (publication) — ou démarrage en local puis publication ultérieure.

## 3. Tâches (Claude)

1. **Scaffolder la lib** `{stats}-core` via la skill `tech_front_core_init` (Rollup, Vitest,
   eslint/prettier `@platform/front-configs`, layout `src/`).
2. **Porter par couche** (cf. cadrage §3.3), des feuilles vers le sommet :
   - A. Fondations : `parisTime`, `dateRange`, `countries`, `frenchRegions`, `viewerJoin`, `checkinByType`(split).
   - B. Calcul : `computeStats`, `computeScanStats`, `computeLiveStats`, `computeReplayStats`, `participation`, `physicalReplay`, `burndown`, `buildCheckedInDelegates`.
   - C. Exports : `buildSessionAttendance`, `buildScanExport`, `buildDelegateJourney`, `generateAnalysis`.
3. **Casser les 4 couplages** (cadrage §4) : i18n → injection `translate` / retour de données ;
   diagnostics → `warnings[]` ; debug → logger injecté ; plugin Chart.js → exclu.
4. **Typer** : introduire `Delegate`, `ScanHit`, `LiveHit`, `ReplayHit`, `SessionMap`,
   `DateRange`, `StatsResult`, etc.
5. **Tests golden-master** (cadrage §6) + cas limites.

## 4. Livrables

- Paquet `@platform/stats-core` buildable, typé, publiable.
- Suite Vitest verte, fixtures réelles incluses.
- `README` de la lib (API publique, exemples).

## 5. Critère de sortie (porte G1)

> Sur les fixtures réelles, **toutes** les fonctions portées produisent des sorties
> **strictement identiques** au PoC. Tant qu'une divergence subsiste, la phase n'est pas
> terminée. C'est le juge de paix.

## 6. Validation humaine

- Relire l'API publique et les types (cohérence métier).
- Lancer la suite de tests, confirmer la parité sur un event connu.
- Valider que les 4 couplages cassés n'ont pas altéré la logique.

## 7. Charge indicative

**8 – 12 j·h** (lot 2 du mapping §4), fortement compressée par Claude (port mécanique).
