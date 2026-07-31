# 05 — Interface

## 5.1 Structure de la page

`views/StatisticsView.vue` (1 080 lignes) est le seul écran de l'application. Il porte quatre
zones :

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOPBAR   logo + nom de l'event + « N inscrits »   [FR|EN] [🛢 données] │
├────────────┬───────────────────────────────────────────────────────────┤
│  SIDEBAR   │  TOOLBAR DE FILTRES GLOBAUX (plage de dates · badges)     │
│  nav       ├───────────────────────────────────────────────────────────┤
│  hiérar-   │                                                           │
│  chique    │  CONTENU DE L'ONGLET ACTIF                                │
│            │  (cartes .kpi-card / .chart-card, grilles .charts-row)     │
│  ─────     │                                                           │
│  Export MD │                                                           │
│  Rafraîchir│                                                           │
│  ⟳ auto    │                                                           │
└────────────┴───────────────────────────────────────────────────────────┘
```

Le bouton **« base de données »** (icône cylindre, à droite du sélecteur de langue) ouvre la
modale `DataSourcesInfo` — « Données utilisées — détail technique » — qui liste les modèles
GraphQL interrogés et les cinq index Elasticsearch. Elle **importe la constante `INDEX`** de
`api/elasticsearch.js` pour rester automatiquement synchronisée avec le code.

`document.title` est mis à jour selon l'événement affiché (et l'événement comparé le cas
échéant).

## 5.2 Navigation hiérarchique

```
Vue d'ensemble                    (feuille)
Démographie                       (feuille)
Registration                      (GROUPE — en-tête non cliquable)
   ├── Inscriptions
   ├── Dynamique
   ├── Badges & Check-in
   ├── Données
   └── Comparatif                 (conditionnel : ?compareWith=)
Live                              (feuille, OU groupe Single/Comparatif si ?compareWith=)
Replay                            (idem)
Scans QR                          (feuille)
Exports                           (feuille)
```

Le nœud « Registration » est un simple regroupement visuel : son en-tête replie/déplie les
enfants mais ne navigue pas. Les sous-onglets comparatifs n'existent qu'en présence de
`?compareWith=`.

## 5.3 Les onglets

| Onglet | Fichier | Lignes | Contenu |
|---|---|---|---|
| Vue d'ensemble | `OverviewTab.vue` | 1 725 | KPI, décomposition « Total participants », filtre **modalité** en barre de page, participants par jour (histogramme groupé), cartes monde + Europe, engagement (sessions uniques par délégué), type de session + sessions |
| Démographie | `DemographicsTab.vue` | 247 | pays, continents, genre, professions, qualifications, sociétés |
| Inscriptions | `RegistrationsTab.vue` | 228 | types, catégories, jours d'accès, décomposition physique/distanciel/absent |
| Dynamique | `TemporalTab.vue` | 269 | courbes d'inscription, cumul, jour de semaine, hebdomadaire |
| Badges & Check-in | `BadgesTab.vue` | 1 114 | progression, flux horaire, appareils, cartes monde + France |
| Données | `DataTab.vue` | 562 | table brute triable des délégués |
| Live / Replay | `ViewersTab.vue` | 1 422 | **génériques**, paramétrés par `kind: 'live' \| 'replay'` |
| Comparatifs Live/Replay | `ViewersComparisonTab.vue` | 572 | **génériques**, A vs B |
| Scans QR | `ScansTab.vue` | 706 | volumétrie salle/entrée/zone, cartes géo, flux horaire, détail des scans |
| Comparatif | `ComparisonTab.vue` | 1 157 | grille A ∣ Δ ∣ B, mix des présents, deltas |
| Exports | `ExportsTab.vue` | 1 407 | interface de génération (cf. [06 — Exports](06-exports.md)) |
| *(inutilisé)* | `DayOfTab.vue` | 239 | **code mort, non référencé** |

### La généricisation Live/Replay

Quatre fichiers historiques (`LiveTab`, `ReplayTab`, `LiveComparisonTab`,
`ReplayComparisonTab`, ~1 940 lignes au total) ont été remplacés par **deux** composants
paramétrés par `kind`. Les variations passent par :

- un dictionnaire `LABELS[kind]` (libellés, nom de l'index ES, couleur de la série journalière) ;
- des `v-if="kind === 'live'"` pour les blocs propres au live : créneaux de 30 minutes,
  camembert cliquable par type de session, colonnes « Type » et « Début session » dans le détail ;
- côté replay uniquement : la colonne « Origine » en pastille, la courbe « nouveaux délégués »,
  le cumul des délégués distincts et l'entonnoir « présents physiques ayant revu en replay ».

Les deux gros onglets restants — `OverviewTab` (1 725 l.) et `ExportsTab` (1 407 l.) — sont les
candidats les plus évidents à un découpage.

## 5.4 Graphiques

| Composant | Particularité |
|---|---|
| `DoughnutChart.vue` | anneau + légende avec pourcentage et valeur absolue |
| `HBarChart.vue` | espacement garanti par `categoryPercentage` / `barPercentage` + `maxBarThickness` ; `layout.padding.right` pour ne pas rogner l'étiquette en bout de barre |
| `LineChart.vue` | courbes simples et cumulées |
| `StackedBarChart.vue` | `@select`, `activeLabel`, `showTotal` |
| `ChoroplethMap.vue` | **`scope: world \| europe`**, `outline` de cadrage Europe, `showLegend` (échelle dégradée) |
| `FrenchRegionMap.vue` | régions INSEE, projection Lambert avec repli Mercator |
| `RegionalMaps.vue` | composite monde + France + DOM (`showScaleLegend`) |
| `KpiCompareGrid.vue` | grille KPI 3 colonnes A ∣ Δ ∣ B, partagée par `ComparisonTab` et `ViewersComparisonTab` |

**Contournement du défaut global des datalabels** : `main.js` désactive
`datalabels.display` pour toute l'application. Trois graphiques ont besoin d'un total en bout
de barre (appareils de BadgesTab, progression par type, totaux de `StackedBarChart`) et
l'obtiennent via des **plugins Chart.js locaux** qui dessinent directement sur le canevas.

## 5.5 Conventions de mise en page

Définies dans `StatisticsView.vue` :

| Classe | Grille |
|---|---|
| `.charts-row` | 2 colonnes `1fr 1fr` |
| `.charts-row.cols-3` | 3 colonnes `1fr 1fr 1fr` |
| `.charts-row.cols-1-2` | `1fr 2fr` avec `align-items: stretch` |

`.cols-1-2` sert au couple récurrent **« type de session » (⅓) + « sessions » (⅔)** présent
dans Scans QR, Live, Replay et Vue d'ensemble.

### Listes de sessions à hauteur alignée

Le mécanisme mérite d'être expliqué, car il est contre-intuitif :

```
.session-list-card          flex colonne
  └── .session-scroll-host  flex: 1 ; min-height: 220px
        └── .session-scroll  position: absolute ; inset: 0 ; overflow: auto
```

L'élément en position absolue **ne gonfle pas** la rangée. C'est donc la **carte de gauche
(type de session) qui fixe la hauteur** de la rangée, et la liste de sessions défile à
l'intérieur. Pour un bloc non appairé sur toute la largeur, `.session-scroll-capped`
(hauteur maximale + défilement) fait l'affaire.

Conséquence produit : **il n'y a plus de plafond « top N »** — toutes les sessions sont
listées, triées par ordre décroissant. Toutes les rangées se replient en une colonne sur
mobile.

Les libellés de sessions sont préfixés de leur date au format `JJ/MM : ` via
`sessionDateShort(start)`, qui gère aussi bien un instant UTC (converti en heure de Paris)
qu'une heure murale naïve (lue telle quelle).

## 5.6 Infobulles d'aide

`InfoTooltip.vue` (106 lignes) est un petit bouton « i » rond avec une bulle en CSS pur
(ouverture au survol et au focus). La bulle est rendue en **`v-html`** : du HTML léger
(`<code>`, `<strong>`) est autorisé, et `aria-label` reçoit le texte brut.

**Convention de nommage** : la clé d'aide est la clé du titre suffixée `Hint`. Par exemple
`temporal.charts.cumulCurve` → `temporal.charts.cumulCurveHint`.

Les infobulles sont présentes sur Vue d'ensemble, Démographie, Inscriptions, Dynamique,
Badges, Scans, Live/Replay, les comparatifs, et sur les colonnes ambiguës de `DataTab` (bloc
dédié `data.columnsHint.{rpps,membershipType,externalContactId,externalId}`, rendu dans le
`<th>` avec `@click.stop` pour ne pas déclencher le tri). Elles sont **absentes de l'onglet
Exports**, où les descriptions sont déjà visibles.

Les textes sont rédigés **du point de vue métier** : dénominateur de chaque taux, nature de la
jointure, sens du champ backend.

## 5.7 Internationalisation

Bilingue **FR/EN** via **vue-i18n** en API Composition (`legacy: false`).

| Fichier | Rôle | Lignes |
|---|---|---|
| `i18n/index.js` | `createI18n` + `setLocale(locale)` (persistance + `<html lang>`) | 44 |
| `i18n/locales/fr.js` | messages français — **langue source et `fallbackLocale`** | 1 357 |
| `i18n/locales/en.js` | messages anglais | 1 343 |
| `i18n/labels.js` | traduit les **catégories dérivées** produites en français canonique par la couche calcul | 49 |
| `components/LanguageToggle.vue` | bouton segmenté FR ∣ EN | 51 |

La langue est persistée dans `localStorage` (clé `stats-lang`) et reflétée sur `<html lang>`.
Le français étant `fallbackLocale`, **une clé anglaise manquante retombe sur le libellé
français** — jamais sur la clé technique.

`labels.js` porte les traductions à l'affichage des valeurs canoniques françaises
(`genderLabel`, `continentLabel`, `notSpecified`, `isNotSpecified`, `allDaysLabel`,
`weekdayNames`), ce qui permet à `computeStats` de rester indépendant de la locale.

### Règles à respecter

| Règle | Raison |
|---|---|
| tout libellé affiché passe par `t("…")` — y compris les `label:` de jeux de données Chart.js et les en-têtes CSV | pas de texte en dur |
| les options Chart.js contenant des titres d'axes traduits doivent être en `computed(() => ({…}))` | sinon elles ne se rafraîchissent pas au changement de langue (les `tooltip.callbacks` sont évalués paresseusement, donc tolérants) |
| hors composant (`generateAnalysis.js`, `useExportMarkdown.js`, `viewerJoin.js`, `useLive`/`useReplay`) : importer `{ i18n }` et utiliser `i18n.global.t` | l'export Markdown suit la langue active au moment de la génération |
| **ne jamais nommer une variable d'itération `t`** (`v-for="t in …"`, `.map(t => …)`) | elle masque la fonction de traduction — utiliser `rt`, `bt`, `st`, `row` |
| pluriels : forme vue-i18n `"x \| y"` + `t(key, count, { … })` | |
| dates et nombres : `toLocaleString(locale.value === "en" ? "en-GB" : "fr-FR", …)` | |

### Non traduit — assumé

Les **valeurs de données** venant du backend (types et catégories d'inscription, statuts,
`sessionType`), les **noms de pays** (`COUNTRY_NAMES`, ~250 entrées), les **en-têtes de colonnes
des CSV** de présence par session et de parcours (`ATTENDANCE_HEADERS`, `JOURNEY_HEADERS`, les
marqueurs `YES`/`NO`, la colonne « Nature »), et `DayOfTab.vue` (code mort).

## 5.8 Système de design

Il n'y a **aucune bibliothèque de composants**. Toute la mise en forme repose sur du CSS
portée (`scoped`) et des classes partagées : `.kpi-card`, `.chart-card`, `.data-table`.

Les jetons de design CYIM sont centralisés dans `App.vue` (`:root`) :

| Variable | Valeur | Usage |
|---|---|---|
| `--primary` | `#1e4e66` | bleu CYIM |
| `--primary-light` | `#2a6a8a` | |
| `--accent` | `#30dd92` | vert d'accentuation (boutons d'action) |
| `--accent-hover` | `#28c580` | |
| `--purple` | `#6f45ff` | |
| `--brand` | `#c9c934` | |
| `--warning` / `--danger` | `#ffa600` / `#e53935` | |
| `--bg` / `--card` | `#f5f6fa` / `#ffffff` | |
| `--text` / `--text-secondary` / `--text-muted` | `#414141` / `#646464` / `#9ca3af` | |
| `--border` | `#e5e7eb` | |
| `--shadow`, `--radius` | ombre à 3 couches, `12px` | |

Police **Poppins**, appliquée aussi aux défauts Chart.js. La palette par type d'inscription
(`typeColors.js`) est propagée à Vue d'ensemble, Inscriptions, Comparatif et Badges ; l'échelle
de chaleur (`heatColor.js`) aux cartes.

C'est précisément cette couche que la version de production remplacera par
`@platform/theme-core` + `@platform/theme-ui` + `@platform/common-ui`.

## 5.9 Piège Vue connu

**Ne jamais mettre un `v-if` sur l'élément racine d'un composant.** Vue 3 a un défaut de mise à
jour quand l'unique racine du template alterne entre un commentaire vide et un vrai élément. Le
`v-if` doit être porté par le parent :

```vue
<!-- ✗ dans Foo.vue -->  <template><div v-if="ok">…</div></template>
<!-- ✓ chez le parent -->  <Foo v-if="ok" />
```
