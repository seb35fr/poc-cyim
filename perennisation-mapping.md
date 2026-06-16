# Pérennisation `statistics-reg` — mapping PoC → stack `@platform/*`, effort & avantages

> **Objet** : le PoC dashboard statistiques recueille la satisfaction de ses premiers
> utilisateurs et doit devenir une solution pérenne. Ce document mappe chaque brique du
> PoC vers la librairie `@platform/*` équivalente (ou identifie l'absence d'équivalent),
> chiffre l'effort d'industrialisation et en explicite les avantages.
>
> **Statut** : note de cadrage. Les charges sont des **ordres de grandeur** (fourchettes),
> pas un devis. À affiner en atelier technique avec l'équipe front.
>
> **Date** : 2026-06-16 · **Auteur** : S. Méaudre (assisté Claude Code)

---

## 1. Point de départ : le PoC en chiffres

- **~22 770 lignes** réparties sur **76 fichiers** (`src/`).
- Stack **volontairement hors-norme** vs le monorepo `@platform` :

| Dimension | PoC actuel | Stack maison `@platform` (skills front) |
|---|---|---|
| Langage | **JavaScript** | TypeScript ~5.7 strict |
| Framework UI | **Aucun** (CSS custom + variables) | Quasar 2.18 + `@platform/common-ui` |
| État | **Composables `ref`/`readonly`** | Pinia 2.3 (+ stores) |
| Données | `fetch` direct + **ES en direct navigateur** | `@platform/graphql-core` (GqlClient) |
| Auth | **Bearer token en `.env`** | Keycloak + `config-module` + `authorization` (Cerbos) |
| Tests | **Aucun** | Vitest 4 + `@vue/test-utils` |
| Thème | Tokens CSS dans `App.vue` | `@platform/theme-core` + `theme-ui` |
| i18n | vue-i18n (déjà conforme) | vue-i18n + `registerI18n` des libs |

Le PoC est donc un **prototype assumé** : rapidité de livraison contre conformité. La
pérennisation = réaligner sur le stack maison **sans perdre l'IP métier**.

---

## 2. Les 3 natures de code (le tri qui structure tout)

| Nature | Lignes (approx.) | Devenir |
|---|---|---|
| **A. Plomberie jetable** — remplaçable par une lib `@platform/*` testée | ~5 500 | À **supprimer**, remplacer par la lib |
| **B. IP métier** — calculs/jointures/exports propres au dashboard | ~6 500 | À **porter** (TS + tests) — c'est la valeur |
| **C. Présentation** — écrans/onglets/charts | ~10 700 | À **réécrire** sur Quasar/common-ui (charts conservés) |

> La leçon centrale : **~24 % du PoC est de la plomberie qu'on ne devrait pas maintenir**,
> ~29 % est l'IP à protéger, le reste est l'UI à reconstruire.

---

## 3. Mapping détaillé fichier → lib `@platform/*`

### A. Plomberie jetable → lib existante (gain net : moins de code à maintenir)

| Fichier PoC | Lib `@platform/*` cible | Note |
|---|---|---|
| `api/graphql.js` (346) — wrapper `gqlFetch`, pagination cursor maison | **`graphql-core`** (`GqlClient`, `GqlConnection`, `GqlPageInfo`) | On garde les **requêtes** (métier), on jette le wrapper + la pagination réécrite à la main |
| `api/elasticsearch.js` (99) — ES REST direct navigateur | **`graphql-core`** + **resolver backend** (cf. §5) | Disparaît côté front ; devient un appel GraphQL fédéré authentifié |
| `utils/debug.js` (≈) — wrapper `console.*` | **`vue-logger`** (`useLogger`) | Logging centralisé Kibana, traçage d'actions |
| `App.vue` tokens CSS (`:root`) | **`theme-core`** + **`theme-ui`** + `common-ui` `initQuasar(palette)` | Palette CYIM gérée par le design system, plus de tokens copiés |
| `LanguageToggle.vue` | `common-ui` + vue-i18n `registerI18n` | Pattern standard |
| `InfoTooltip.vue` (106) | Quasar `q-tooltip` / `common-ui` `Alert` | |
| `FilterBanner.vue`, `BadgeTypeFilter.vue` (294), filtres date/badge | **`filter-core`** + **`filter-ui`** (FilterBuilder, `FilterDate`, `FilterRange`) | Modèles de filtres typés + UI testée ; remplace `useBadgeTypeFilter`/`useDateRangeFilter` |
| `DataSourcesInfo.vue`, `ScanDetailModal.vue` (130) | `common-ui` `Modal` | |
| `CsvButton.vue` (65) | `common-ui` `Button` (spinner/disabled inclus) | La **logique CSV** (`exportCsv.js`) reste |
| `DiagnosticsBanner.vue` (126) + `useDiagnostics.js` (57) | `common-ui` `useSnackbar` | Toasts standardisés |
| `ScanDetailTable.vue` (302), `DataTab.vue` (562) tableaux | `common-ui` lists / Quasar `q-table` | Tri/pagination/filtre fournis |

### B. IP métier → à PORTER (TS + tests) — **aucun équivalent `@platform`**

> C'est le cœur de la valeur. Aujourd'hui ce code **n'a aucun test**. Le porter = le typer +
> le couvrir. Candidat naturel à une lib **`@platform/stats-core`** (réutilisable par d'autres fronts).

| Fichier PoC | Rôle | Pourquoi irremplaçable |
|---|---|---|
| `computeStats.js` (546) | Toutes les stats délégués (lazy getters par section) | Logique métier congrès |
| `computeScanStats.js` (554) | Agrégation 3 index scans + **ré-association QR** | IP spécifique (rattrapage des `delegate_id = '-'`) |
| `computeLiveStats.js` (257) / `computeReplayStats.js` (210) | Stats live / replay | |
| `viewerJoin.js` (250) | Jointure Keycloak ↔ délégué (clé `source.id` ACCOUNT) | Connaissance fine de la donnée — **réutilisable hors stats** |
| `participation.js` (116) | Décomposition dédoublonnée « total participants » | KPI phare du bilan |
| `physicalReplay.js`, `burndown.js`, `checkinByType.js`, `buildCheckedInDelegates.js` | Métriques dérivées | |
| `buildSessionAttendance.js` (362), `buildScanExport.js` (207), `buildDelegateJourney.js` (341) | Constructeurs d'exports | Règles métier (présence par session, parcours) |
| `generateAnalysis.js` (310), `useExportMarkdown.js` (1107) | Analyse textuelle + dump MD/JSON pour LLM | Différenciant produit |
| `parisTime.js`, `dateRange.js`, `frenchRegions.js`, `typeColors.js`, `heatColor.js` | Helpers domaine | Pas d'équivalent direct |

### C. Présentation → à RÉÉCRIRE sur Quasar/common-ui (charts conservés)

| Fichier PoC | Devenir |
|---|---|
| `views/StatisticsView.vue` (1072) | Réécrit : shell `common-ui` (`StandardHeader`, `NavigationDrawer`) + toolbar filtres via `filter-ui` |
| Onglets : `OverviewTab` (1725), `ViewersTab` (1422), `ExportsTab` (1329), `ComparisonTab` (1157), `BadgesTab` (1114), `ScansTab` (706), `ViewersComparisonTab` (572), `Demographics/Registrations/Temporal` | Réécrits TS + layout Quasar ; **la logique compute/chart est conservée** (appels à la lib stats-core) |
| **Charts** : `DoughnutChart`, `LineChart`, `HBarChart`, `StackedBarChart`, `ChoroplethMap`, `FrenchRegionMap`, `RegionalMaps`, `KpiCompareGrid` (~1 100 l.) | **CONSERVÉS quasi tels quels** — `common-ui` ne fournit pas de charts. Chart.js reste. |
| `i18n/` (locales fr/en ~2 700 l.) | **Conservés**, rebranchés via `registerI18n` |

---

## 4. Effort estimé (ordre de grandeur)

| Lot | Contenu | Charge (j·h) |
|---|---|---|
| **0. Backend prérequis** ⚠️ | Resolver GraphQL fédéré `scanStatistics(eventId, filters)` (registration-badges ou micro `stats`), aggs ES côté serveur, auth Cerbos, suppression du proxy `/api/es` | **5 – 15** |
| **1. Bootstrap app** | Scaffolding via `tech_front_app_init` (Vite/Quasar/Pinia/router/i18n, Keycloak+`config-module`, theming, CI/Docker/nginx) | **3 – 5** |
| **2. Port IP métier (B)** | ~3,5 k l. de calcul → TS + types + **Vitest** (lib `stats-core`) | **8 – 12** |
| **3. Remplacement plomberie (A)** | graphql-core, theme-core, snackbar, logger, filtres ; suppressions | **3 – 5** |
| **4. Réécriture UI (C)** | Onglets + vue sur Quasar/common-ui (charts réutilisés) | **15 – 25** |
| **5. Recette / RGPD / perf** | Masquage RGPD (jointure délégué + `gdpr`), agrégations serveur gros congrès, recette bilingue | **4 – 8** |
| | **TOTAL FRONT (1–5)** | **≈ 33 – 55 j·h** |
| | **+ Backend (0)** | **+ 5 – 15 j·h** |

> **Lecture** : ~**8 à 14 semaines** d'effort pour une refonte propre et pérenne, dont une
> part **backend** (le lot 0) souvent oubliée mais **bloquante** — voir §5.

---

## 5. Le point dur à ne pas sous-estimer : l'accès aux données

Le PoC lit **Elasticsearch directement depuis le navigateur** via un proxy `/api/es`
**sans auth, sans whitelist, sans rate-limit**, avec un **bearer token collé dans `.env`**.
C'est documenté comme choix PoC dans le `CLAUDE.md` — mais **inacceptable en prod** :

- pas d'authentification ni de contrôle d'accès (Cerbos) ;
- tout chargé en RAM navigateur (KO sur un congrès > 100 k scans) ;
- pas d'équivalent prod du proxy dev.

➡️ La pérennisation **impose** de créer un **resolver GraphQL fédéré** côté backend qui
renvoie des agrégations (et un échantillon de scans bruts), authentifié Cerbos. C'est le
**lot 0**, prérequis à toute la suite. Aucune skill front ne le couvre — c'est du backend
(`registration-badges` ou un nouveau micro `stats`).

---

## 6. Migrer vs reconstruire — recommandation

Le mapping montre que **~80 % du PoC est soit jetable (plomberie), soit de la présentation à
réécrire de toute façon** pour passer sur Quasar/common-ui. Seule l'**IP métier (~29 %)**
est à préserver telle quelle.

➡️ **Reconstruire** (nouvelle app `statistics-admin` via `tech_front_app_init` + lib
`stats-core` portée du PoC) est **préférable à migrer** le JS/CSS legacy in situ :

1. on **isole l'IP** dans une lib testée et réutilisable (`stats-core`), au lieu de la
   laisser enterrée dans des onglets de 1 700 lignes ;
2. on **repart sur le shell standard** (auth, theming, i18n, CI) plutôt que de rétro-adapter ;
3. le PoC actuel **continue de tourner** pour les utilisateurs pendant la reconstruction.

---

## 7. Avantages concrets de la pérennisation

| Avantage | Aujourd'hui (PoC) | Après industrialisation |
|---|---|---|
| **Sécurité** | ES exposé sans auth, token en clair | Resolver GraphQL + Cerbos, aucun accès direct ES |
| **RGPD** | Aucun masquage (xlsx-stats anonymisait) | Masquage via `delegate.gdpr` |
| **Fiabilité** | 0 test sur ~6,5 k l. de calcul critique | IP métier typée + couverte (Vitest) |
| **Scalabilité** | Tout en RAM navigateur, pagination séquentielle | Agrégations serveur, gros congrès tenables |
| **Maintenabilité** | ~5,5 k l. de plomberie maison à maintenir | Remplacée par libs `@platform` testées |
| **Cohérence** | UI custom hors design system | Design system CYIM (common-ui/theme) |
| **Réutilisabilité** | Jointures/calculs enfermés dans le PoC | `stats-core` (et `viewerJoin`) dispo pour d'autres fronts |
| **Exploitation** | Refresh = tout recharger | Resolver → incrémental possible (PIT/SSE) |

---

## 8. Plan de réalisation supervisé

> **Chaque phase est documentée dans un fichier dédié** sous [`perennisation/`](perennisation/README.md) :
> [Phase 0 — Cadrage](perennisation/phase-0-cadrage.md) ·
> [Phase 1 — `stats-core`](perennisation/phase-1-stats-core.md) ·
> [Phase 2 — Backend](perennisation/phase-2-backend-resolver.md) ·
> [Phase 3 — Scaffolding](perennisation/phase-3-scaffolding.md) ·
> [Phase 4 — UI](perennisation/phase-4-ui-rewrite.md) ·
> [Phase 5 — Durcissement](perennisation/phase-5-durcissement.md).

### 8.1 Principe : « Claude produit, l'humain valide »

La reconstruction est menée **en grande partie par Claude Code**, mais **jamais en
autonomie totale**. Claude écrit le volume de code mécanique (port, tests, scaffolding,
réécriture UI guidée par ce mapping) ; un humain tient les **portes de validation**. Le
facteur limitant n'est pas la production de code, c'est la **validation de l'exactitude**
et l'**intégration** (infra, accès, déploiement).

**Les 3 portes de validation (non délégables) :**

| Porte | Quoi | Qui |
|---|---|---|
| **G1 — Exactitude des stats** | À chaque port, les sorties doivent **matcher le PoC actuel** (mêmes entrées → mêmes sorties). Filet anti-régression non négociable. | PM / dev métier |
| **G2 — Décisions structurantes** | Accès aux libs `@platform/*` privées, arbitrages *migrer vs reconstruire*, choix UX. Claude propose, l'humain tranche. | PM + lead front |
| **G3 — Backend / infra / déploiement** | Resolver, Cerbos, registry privé, CI/CD, prod. Claude écrit, un humain avec les accès intègre et déploie. | Dev backend / ops |

### 8.2 Découpage en phases (chaque phase = livrable + critère de sortie supervisé)

> Ordre pensé pour **dérisquer tôt** : on prouve la délégabilité sur l'IP métier (Phase 1)
> avant tout engagement lourd, et le PoC **continue de tourner** pour les utilisateurs
> pendant toute la reconstruction.

#### Phase 0 — Cadrage & accès *(prérequis, supervision G2)*
- **Claude** : rédige le périmètre exact de `stats-core` (fichiers, API publique, deps), le
  spec fonctionnel du resolver `scanStatistics`, et le plan de tests de non-régression.
- **Humain** : tranche *reconstruire vs migrer* (reco : **reconstruire**) ; débloque les
  accès (registry npm privé `@platform/*`, repo `communication-admin` comme modèle, Cerbos).
- **Critère de sortie** : périmètre validé + accès ouverts.

#### Phase 1 — Extraction `stats-core` (PROOF-OF-VALUE) *(supervision G1)*
- **Claude** : porte l'IP métier (~6,5 k l., cf. §3.B) JS → **TypeScript**, structure en lib
  `{stats}-core` (pas de Vue), génère une **suite Vitest de non-régression** alimentée par
  des jeux de données réels capturés depuis le PoC.
- **Humain** : valide que **les sorties sont identiques au PoC** (G1). C'est LE test
  décisif : si ça passe, la délégabilité du chantier est prouvée.
- **Critère de sortie** : lib buildable, tests verts, parité PoC confirmée. **Coût quasi nul
  côté risque** (rien en prod n'est touché).
- *Charge : lot 2 du §4 (8–12 j·h), fortement compressée par Claude.*

#### Phase 2 — Backend `scanStatistics` *(chemin critique, supervision G3)*
- **Claude** : implémente le resolver GraphQL fédéré (aggs ES côté serveur, échantillon de
  scans bruts), auth Cerbos, en suivant les patterns `registration-badges`.
- **Humain** : review sécurité/Cerbos, intègre, déploie, teste contre données réelles.
- **Critère de sortie** : resolver authentifié en staging, parité avec les lectures ES
  directes du PoC. **Peut démarrer en parallèle de la Phase 1.**
- *Charge : lot 0 (5–15 j·h).*

#### Phase 3 — Scaffolding de l'app *(supervision G2)*
- **Claude** : génère le shell `statistics-admin` via la skill `tech_front_app_init`
  (Vite/Quasar/Pinia/router/i18n, Keycloak + `config-module`, theming `theme-core`, CI/Docker/nginx).
- **Humain** : valide la conformité au modèle `communication-admin`, branche les accès Keycloak.
- **Critère de sortie** : app vide buildable + déployable, qui s'authentifie.
- *Charge : lot 1 (3–5 j·h).*

#### Phase 4 — Réécriture UI sur `common-ui` *(itératif, supervision G1+G2)*
- **Claude** : réécrit **onglet par onglet** sur Quasar/`common-ui`, branché sur `stats-core`
  (Phase 1) et le resolver (Phase 2) ; **charts Chart.js conservés** (pas d'équivalent `@platform`) ;
  remplace la plomberie (`graphql-core`, `filter-ui`, `useSnackbar`, `vue-logger`) — cf. §3.A & §3.C.
- **Humain** : recette visuelle + **revalide les chiffres affichés** (G1) à chaque onglet livré.
- **Critère de sortie** : chaque onglet atteint la parité fonctionnelle avec le PoC avant de
  passer au suivant (livraison incrémentale, pas big-bang).
- *Charge : lots 3 + 4 (18–30 j·h).*

#### Phase 5 — Durcissement & bascule *(supervision G1+G3)*
- **Claude** : masquage **RGPD** (`delegate.gdpr`), agrégations serveur pour gros congrès,
  recette bilingue FR/EN.
- **Humain** : recette finale, RGPD signée, bascule des utilisateurs, décommissionnement du PoC.
- **Critère de sortie** : prod validée, PoC retiré.
- *Charge : lot 5 (4–8 j·h).*

### 8.3 Vue d'ensemble

| Phase | Livrable | Porte | Risque | Parallélisable |
|---|---|---|---|---|
| 0 — Cadrage & accès | Spec + accès | G2 | — | — |
| 1 — `stats-core` | Lib testée, parité PoC | **G1** | Très faible | — |
| 2 — Backend resolver | `scanStatistics` Cerbos | **G3** | Élevé | ‖ Phase 1 |
| 3 — Scaffolding | App shell auth | G2 | Faible | ‖ Phase 2 |
| 4 — UI `common-ui` | Onglets à parité | G1+G2 | Moyen | après 1+3 |
| 5 — Durcissement | RGPD, perf, bascule | G1+G3 | Moyen | après 4 |

### 8.4 Règle d'or de la supervision

> **Aucune phase n'avance tant que sa porte de validation n'est pas franchie.** La parité
> avec le PoC (G1) est le juge de paix : tant qu'un calcul ou un onglet ne reproduit pas à
> l'identique les sorties du PoC actuel sur données réelles, il n'est pas « fait ». C'est ce
> qui rend la délégation massive à Claude **sûre** : le PoC est l'oracle de non-régression.

### 8.5 Démarrage immédiat recommandé

**Phase 0 puis Phase 1** : cadrer `stats-core`, puis l'extraire sur une branche dédiée avec
sa suite de non-régression. C'est le proof-of-value à coût/risque quasi nul qui valide (ou
invalide) tout le reste du plan.
