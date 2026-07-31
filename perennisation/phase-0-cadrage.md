# Phase 0 — Cadrage & accès

> **Porte de validation : G2** (décisions structurantes — humain tranche).
> **Livrable de cette phase** : ce document. Il fige le périmètre de `stats-core`, l'API
> publique cible, les couplages à casser, le plan de tests de non-régression, et le brouillon
> de spec du resolver backend. Rien n'est codé en Phase 0.

---

## 1. Objectif

Avant d'écrire une ligne, décider et documenter :
1. **Le périmètre exact** de la future lib `stats-core` (quels fichiers, quelle API publique).
2. **Les couplages à casser** pour qu'elle soit *sans Vue, sans réseau, sans DOM*.
3. **Le plan de tests** qui garantit la non-régression vs le PoC (porte G1 de la Phase 1).
4. **Le spec du resolver** `scanStatistics` (prérequis de la Phase 2).

## 2. Décisions à acter par l'humain (G2)

| Décision | Reco | Acté ? |
|---|---|---|
| Reconstruire vs migrer | **Reconstruire** (cf. mapping §6) | ☐ |
| Nom du paquet | `@platform/stats-core` (convention `{domaine}-core`) | ☐ |
| Accès registry npm privé `@platform/*` | À ouvrir | ☐ |
| Accès repo modèle `communication-admin` | À ouvrir | ☐ |
| Accès policies Cerbos (pour Phase 2) | À ouvrir | ☐ |
| Langage | TypeScript ~5.7 strict (stack maison) | ☐ |
| Build | Rollup (pattern `{domaine}-core`, pas de Vue) | ☐ |

---

## 3. Périmètre de `stats-core`

### 3.1 Constat structurant

Les fichiers IP candidats **ne dépendent que les uns des autres** — **aucune dépendance npm
runtime** (pas de Chart.js, d3, topojson : ceux-ci vivent dans les charts = couche UI).
`stats-core` serait donc une lib **JS/TS pure**, ce qui la rend triviale à tester et à publier.

### 3.2 Graphe de dépendances interne (extrait du code)

```
parisTime.js  ◄── dateRange.js
     ▲              ▲
     │              │
countries.js   computeStats.js / computeScanStats.js / computeLiveStats.js / computeReplayStats.js
frenchRegions  participation.js / physicalReplay.js / burndown.js
typeColors ◄── checkinByType.js (delegateBadgeType, buildCheckinByType)
     ▲              ▲
viewerJoin.js ─────┤
     ▲              │
     └── buildSessionAttendance.js ◄── buildScanExport.js
         buildDelegateJourney.js
         buildCheckedInDelegates.js
generateAnalysis.js (← formatters)
```

### 3.3 Modules retenus dans `stats-core` (3 couches)

**Couche A — Fondations (feuilles, pures)**

| Module | Exports | Note |
|---|---|---|
| `parisTime` | `toEpochMs`, `parisDateParts`, `parisDay`, `wallClock`, `sessionDateShort`, `parisDateTime` | Heuristique Flink ms/s, CET/CEST |
| `dateRange` | `makeInRange` | Prédicat de filtre date |
| `countries` | `COUNTRY_NAMES`, `COUNTRY_CONTINENTS`, `NUMERIC_TO_ALPHA2`, `countryCodeToFlag` | |
| `frenchRegions` | `REGION_NAMES`, `zipToRegion` | |
| `viewerJoin` ⚠️ | `getKeycloakId(s)`, `hasValidCheckin`, `getRpps`, `buildDelegateLookup`, `getRemoteOnlyDelegateIds`, `getMatchedViewerDelegateIds`, `getCheckedInDelegateIds` | **Couplages à casser** (§4) |
| `checkinByType` (split) | `delegateBadgeType`, `buildCheckinByType` | Plugin/options Chart.js → restent en UI |

**Couche B — Calcul (cœur)**

| Module | Exports | Entrées principales |
|---|---|---|
| `computeStats` | `computeAllStats(delegates, mobileAppId?, dateRange?)` | délégués GraphQL |
| `computeScanStats` | `computeAllScanStats({audience,checkin,zone}, opts)`, `buildQrDelegateLookup`, `qrKeys` | scans ES + lookup QR |
| `computeLiveStats` | `computeLiveStats(hits, sessionMap?, dateRange?)` | hits live ES |
| `computeReplayStats` | `computeReplayStats(hits, sessionMap?, dateRange?)` | hits replay ES |
| `participation` | `computeParticipation(delegates, liveItems, replayItems, opts)` | mix dédoublonné |
| `physicalReplay` | `buildPhysicalReplayByDay`, `buildPhysicalReplayCumulative` | |
| `burndown` | `buildBurndownAbsolute`, `buildBurndownRelative`, `formatOffsetLabel` | |
| `buildCheckedInDelegates` | `buildCheckedInDelegates`, `CHECKED_IN_HEADERS`, `checkedInRowToCsv` | |

**Couche C — Constructeurs d'exports (données, pas de téléchargement)**

| Module | Exports | Note |
|---|---|---|
| `buildSessionAttendance` | `buildSessionAttendance`, `delegateCoreFields`, `filterAttendanceBySource`, `*_ATTENDANCE_HEADERS` + `*RowToCsv` | Sérialiseurs = chaînes pures |
| `buildScanExport` | `buildZoneScanRows`, `buildSessionScanRows`, `*_SCAN_HEADERS`, `*RowToCsv` | |
| `buildDelegateJourney` | `resolveByEmail`, `buildDelegateJourney`, `JOURNEY_HEADERS`, `journeyRowToCsv` | |
| `generateAnalysis` ⚠️ | `generateAnalysis(stats, registeredCount, eventName, opts)` | **Couplage i18n** (§4) |

### 3.4 Ce qui RESTE hors `stats-core` (couche UI / app)

| Fichier | Pourquoi exclu |
|---|---|
| `exportCsv.js` (`downloadCsv`) | Télécharge via le DOM → util navigateur, pas core |
| `checkinByType` plugin/options Chart.js | Rendu graphique → UI |
| `heatColor`, `typeColors`, `formatters` | Présentation (couleurs, format locale) — *peuvent* aller dans un `stats-ui` ou mapper `@platform/string-format`. À trancher (G2) |
| `useExportMarkdown.js` | Composable Vue + téléchargement → orchestration UI (appellera `stats-core`) |
| `useDiagnostics.js`, `debug.js` | Infra UI Vue |
| charts/, tabs/, views/, composables d'auto-refresh | Présentation |

---

## 4. Couplages à casser (design `stats-core`)

`stats-core` doit être **sans Vue, sans réseau, sans i18n, sans DOM**. 4 couplages identifiés
dans le code actuel, avec la stratégie de découplage :

| # | Couplage actuel | Fichier(s) | Stratégie |
|---|---|---|---|
| 1 | `i18n.global.t(...)` (texte FR/EN) | `generateAnalysis`, `viewerJoin` | **Injection de dépendance** : le core reçoit un `translate` (fn) en option, OU retourne des **données + clés** neutres et le rendu texte FR/EN reste côté UI. Reco : core renvoie des structures, UI traduit. |
| 2 | `pushDiagnostic(...)` (toasts) | `viewerJoin` | Le core **retourne `warnings[]`** comme donnée ; l'UI décide d'afficher des toasts. |
| 3 | `debug.log/table` | `viewerJoin` | Injecter un `logger` (défaut no-op) ou supprimer. |
| 4 | Plugin/options Chart.js | `checkinByType` | **Split** : `delegateBadgeType` + `buildCheckinByType` → core ; `checkinByTypeTotalsPlugin` + `checkinByTypeOptions` → UI. |

> Ces 4 découplages sont la **seule vraie réécriture** de la Phase 1 ; le reste est du port
> mécanique JS → TS.

---

## 5. API publique cible (esquisse `index.ts`)

```ts
// @platform/stats-core — point d'entrée
export { computeAllStats } from "./compute/stats";
export { computeAllScanStats, buildQrDelegateLookup, qrKeys } from "./compute/scans";
export { computeLiveStats } from "./compute/live";
export { computeReplayStats } from "./compute/replay";
export { computeParticipation } from "./compute/participation";
export { buildPhysicalReplayByDay, buildPhysicalReplayCumulative } from "./compute/physicalReplay";
export { buildBurndownAbsolute, buildBurndownRelative } from "./compute/burndown";

export { buildDelegateLookup, hasValidCheckin, getKeycloakId, getRpps,
         getRemoteOnlyDelegateIds, getCheckedInDelegateIds } from "./join/viewerJoin";
export { delegateBadgeType, buildCheckinByType } from "./join/checkinByType";

export { buildSessionAttendance, filterAttendanceBySource /* + headers/serializers */ } from "./export/sessionAttendance";
export { buildZoneScanRows, buildSessionScanRows /* + headers */ } from "./export/scanExport";
export { resolveByEmail, buildDelegateJourney /* + headers */ } from "./export/delegateJourney";
export { generateAnalysis } from "./export/analysis"; // reçoit un translate optionnel

export * as time from "./util/parisTime";
export * as geo from "./util/countries"; // + frenchRegions
```

> Types à introduire : `Delegate`, `ScanHit`, `LiveHit`, `ReplayHit`, `SessionMap`,
> `DateRange`, `StatsResult` (les 8 sections), `ScanStatsResult`, `ParticipationResult`.
> Dérivés des champs GraphQL/ES documentés dans le `CLAUDE.md` du PoC.

---

## 6. Plan de tests de non-régression (le filet G1)

**Idée maîtresse** : le PoC sait **déjà** exporter 100 % de ses données source ET de ses
stats matérialisées via le **dump JSON** (`donnees-*.json`, produit par `useExportMarkdown`).
On s'en sert comme **golden master**.

### Procédure

1. **Capturer des fixtures** : pour ≥ 2 events réels (idéalement 1 petit + 1 gros, ex. JFR),
   exporter le `donnees-*.json` → il contient `delegates` bruts + `stats` matérialisées +
   `live`/`replay`/`scans` items.
2. **Construire les cas** : `{ inputs: délégués/hits/sessionMap, expected: sorties stats }`
   extraits du dump.
3. **Golden-master Vitest** : `computeAllStats(inputs) deepEqual expected`, idem pour
   `computeAllScanStats`, `computeLiveStats`, `computeReplayStats`, `computeParticipation`,
   les lookups `viewerJoin`, et les lignes des constructeurs d'export.
4. **Cas limites explicites** : entrées vides ; `delegate_id = '-'` (ré-association QR →
   vérifier `recoveredScans`/`unmatchedScans`) ; timestamps manquants ; heuristique ms vs s ;
   bascule CET/CEST.

### Critère de réussite (porte G1)
> Sur les fixtures réelles, **chaque fonction portée produit des sorties strictement
> identiques** au PoC. Toute divergence est un bug de port à corriger avant d'avancer.

---

## 7. Brouillon spec resolver `scanStatistics` (prérequis Phase 2)

> Détaillé en Phase 2 — esquissé ici car c'est le chemin critique backend.

- **But** : remplacer la lecture ES directe navigateur (3 index, `api/elasticsearch.js`) par
  un appel GraphQL fédéré authentifié.
- **Signature** : `scanStatistics(eventId: ID!, filters: { dateRange, badgeTypes }): ScanStatistics`.
- **Retour** : agrégations serveur (`size:0` + `terms`/`date_histogram`/`cardinality`) +
  **échantillon de scans bruts** (pour la table détail + ré-association QR).
- **Auth** : directive Cerbos, action type `event:scan:stats:read` (à valider avec les policies).
- **Hôte** : **nouveau micro `stats`** — *décision arrêtée*. Aucune greffe sur un microservice existant (ni `registration-badges`, ni `xlsx-stats`).
- **Effet** : supprime le proxy `/api/es`, le token en clair, et le chargement RAM navigateur.

---

## 8. Critère de sortie de la Phase 0

- ☐ Décisions §2 actées par l'humain (G2).
- ☐ Accès registry privé + `communication-admin` + Cerbos ouverts.
- ☐ Périmètre `stats-core` (§3) et couplages (§4) validés.
- ☐ Au moins 1 dump `donnees-*.json` réel capturé pour servir de fixture (§6).

→ Une fois ces cases cochées, **Phase 1 (extraction) et Phase 2 (backend) démarrent en parallèle.**
