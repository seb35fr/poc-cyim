# 06 — Exports

L'export est une fonction produit majeure, pas un accessoire : la demande initiale était de
permettre à la direction de produire des bilans, comparaisons, e-mails clients et supports de
présentation **sans qu'un humain relise un PDF**.

Tous les exports sont **générés dans le navigateur**, sans appel serveur.

## 6.1 Les sept familles

| Famille | Déclencheur | Format | Fichiers produits |
|---|---|---|---|
| **Bilan Markdown + dump JSON** | bouton de la barre latérale | `.md` + `.json` | 2 fichiers, téléchargés **ensemble** |
| **CSV par graphique** | bouton `CsvButton` sur chaque carte | `.csv` | 1 par graphique |
| **Présence par session** | onglet Exports | `.csv` | 1 par session — combiné **+ 3 variantes mono-source** |
| **Scans de session / de zone** | onglet Exports | `.csv` | export à plat, 1 ligne = 1 scan |
| **Parcours par personne** | onglet Exports (saisie d'un e-mail) | `.csv` | 1 par personne |
| **Délégués check-in** | onglet Exports | `.csv` | liste des présents confirmés |
| **Export industrie** | onglet Exports (accordéon par organisation) | `.xlsx` | 1 fichier par organisation, 3 onglets |

> **Retiré du périmètre** : les exports **PDF** (`useExportPdf.js`) et **PPTX**
> (`useExportPptx.js`) ont été supprimés, ainsi que leurs utilitaires (`exportSpec.js` qui
> parcourait le DOM, `renderChartHD.js`) et les dépendances `jspdf`, `pptxgenjs`,
> `html2canvas`.

Tous les boutons d'export affichent un indicateur d'activité et sont désactivés pendant la
génération.

---

## 6.2 Bilan Markdown — `useExportMarkdown.js` (1 027 lignes)

### Pourquoi du Markdown

Le fichier est destiné à être **donné en entrée à un modèle de langage** (Claude, ChatGPT,
Gemini). Les LLM ont été massivement entraînés sur du Markdown (README, documentations) et en
extraient la structure — titres, tableaux, listes — sans pré-traitement. Un PDF perd la
structure ; un CSV perd la sémantique.

### Structure du document

Le corps par événement est factorisé dans **`renderEventBody()`**, rejoué à l'identique pour
l'événement principal **et** pour l'annexe de comparaison.

| # | Section |
|---|---|
| 1 | Métadonnées (événement, identifiant, filtre badge actif) |
| 2 | Chiffres clés globaux |
| 3 | **Total participants (vue dédoublonnée)** — le KPI central du bilan |
| 4 | Démographie **exhaustive** — tous les pays (aucun plafond), continents, régions françaises, genre, professions, qualifications, civilités, sociétés |
| 5 | Inscriptions — statuts, statut par type, types et catégories avec décomposition physique/distanciel/absent, jours d'accès, multi-inscriptions |
| 6 | Temporel — analyses, jours de pointe, jour de semaine, hebdomadaire par type et par statut |
| 7 | Flux de check-in — pic, par jour, créneaux de 15 minutes |
| 8 | Badges — check-in par type, mix des types des présents confirmés, appareils, pic, par jour, créneaux |
| 9 | Onboarding + application mobile |
| 10 | Live — KPI, top sessions, origines, engagement, par jour, par jour et par chaîne, créneaux de 30 min |
| 11 | Replay — idem + nouveaux délégués par jour, cumul, vues par jour |
| 12 | Scans QR — volumétrie, top sessions/salles/zones, délégués uniques par jour ventilés par source, scans de zone par jour, flux horaire, sens de passage, par type de badge |
| 13 | Comparaison côte à côte avec Δ si `?compareWith=` |
| 14 | Analyse textuelle (`generateAnalysis.js`) |
| 15 | Pied de page avec **suggestions de prompts** (résumé, communiqué, comparaison, transparents…) |
| 16 | **Annexe — données complètes de l'événement comparé** (`renderEventBody()` rejoué) |

Point important : l'export lit **directement les objets de statistiques**. Il ne parcourt pas
le DOM — c'était l'approche des anciens exports PDF/PPTX, et sa suppression a considérablement
simplifié le code.

### Le dump JSON associé

`buildDataDump()` produit un second fichier contenant **100 % des données source** :

```
{ meta,
  event:   { delegates (bruts), stats (sections matérialisées), live, replay, scans },
  compare: { … si ?compareWith= } }
```

Un `jsonReplacer` de sécurité convertit les `Set` en tableaux et les `Map` en objets. Les
sections de statistiques sont **matérialisées** (les accesseurs paresseux sont forcés) avant
sérialisation.

**Noms de fichiers** : `bilan-{eventName}-{date}.md` et `donnees-{eventName}-{date}.json`.

---

## 6.3 CSV par graphique

`CsvButton.vue` (65 lignes) + `utils/exportCsv.js` (26 lignes). Convention **locale française** :

| Paramètre | Valeur |
|---|---|
| séparateur | `;` |
| fin de ligne | `\r\n` |
| encodage | UTF-8 avec **BOM** (`﻿`) — indispensable pour qu'Excel reconnaisse les accents |
| échappement | valeur entourée de `"` si elle contient `;`, `"` ou un saut de ligne ; les `"` internes sont doublés |

`CsvButton` accepte une prop `primary` pour mettre en avant l'export recommandé d'une carte.

---

## 6.4 Présence par session — `buildSessionAttendance.js` (481 lignes)

Croise les scans d'audience, les vues live et les vues replay pour produire **une ligne par
personne et par session**.

Colonnes : identité, `Profession`, `Fonction`, `Spécialité`, `Mode d'exercice`, `RPPS`,
`Présent physique`, `Vu en live`, `Vu en replay`, durées. Les indicateurs booléens utilisent les
marqueurs littéraux **`YES` / `NO`**.

Quatre sérialiseurs coexistent :

| Sérialiseur | En-têtes | Note |
|---|---|---|
| combiné | `ATTENDANCE_HEADERS` | les trois canaux sur la même ligne |
| présentiel | `PHYSICAL_ATTENDANCE_HEADERS` | via `filterAttendanceBySource(rows, 'physical')` |
| live | `LIVE_ATTENDANCE_HEADERS` | `…'live'` |
| replay | `REPLAY_ATTENDANCE_HEADERS` | `…'replay'` |

Les trois exports mono-source portent une colonne **« Session organisateur »** (avant le titre),
alimentée par `session.organizer`. Un cinquième jeu (`REPLAY_VIEW_HEADERS` +
`buildReplayViewRows`) descend à la granularité de la vue VOD.

`SessionPresenceExport.vue` (300 lignes) est le bloc d'interface réutilisable : recherche,
filtre par type de session, **filtre par organisation**, colonne « Organisateur ».

`delegateCoreFields(d)` et `getRpps(d)` y sont exportés et réutilisés par `buildScanExport.js` —
une seule définition des champs d'identité pour tous les exports.

---

## 6.5 Scans à plat — `buildScanExport.js` (210 lignes)

Une ligne = un scan, enrichie des informations du délégué (identité, profession, RPPS, pays…)
et du type de badge. Deux constructeurs :

| Fonction | Périmètre | Colonnes spécifiques |
|---|---|---|
| `buildZoneScanRows` | scans de zone | libellé de zone résolu via `zoneNames` |
| `buildSessionScanRows` | scans de salle (audience) | **Début / Fin session** (sessions GraphQL UTC → Paris, repli `wallClock` sur `session_start` brut) + **« Session organisateur »** (= `scan.industryName` ES, repli sur `organizers` GraphQL via `sessionOrganizerById`) |

Les deux portent une colonne **`Rapproché` O/N**.

**Cohérence de l'enrichissement** : ces exports lisent
`scansApi.stats.value.{audience,zone}.scans`, c'est-à-dire les scans **après** ré-association et
enrichissement. Un scan que Flink avait laissé orphelin remonte donc bien dans les exports —
comme dans la présence par session et le parcours individuel.

---

## 6.6 Parcours par personne — `buildDelegateJourney.js` (344 lignes)

À partir d'une adresse e-mail (`resolveByEmail`), produit un CSV listant **toutes les sessions
interagies** (salle, live, replay) **et toutes les zones scannées** (stands, lounges).

La présence physique est **dissociée** entre salle et zone : deux indicateurs distincts
(« Présence en salle », « Présence en zone ») plus une colonne **« Nature »** valant `Session`
ou `Zone`. Marqueurs `YES` / `NO`.

---

## 6.7 Export industrie — `exportXlsx.js` (36 lignes)

Le seul export au format XLSX. L'onglet Exports présente un accordéon listant les
**organisations** (organisateurs de session, via `sessionOrganizerById`), filtrable par nom.

Pour chaque organisation, un fichier avec **trois onglets — Live / Replay / On site** — listant
les personnes ayant consulté ses sessions par chaque canal. L'export peut être lancé pour une
organisation ou pour toutes d'un coup.

Les colonnes sont **exactement** celles des exports mono-source correspondants : réutilisation
de `buildRowsForSession` + `filterAttendanceBySource`, sérialisés avec
`LIVE_/REPLAY_/PHYSICAL_ATTENDANCE_HEADERS` et leurs `rowToCsv`. Aucune divergence possible
entre le CSV et le XLSX.

`downloadWorkbook(filename, sheets)` s'occupe des contraintes Excel :

- **SheetJS chargé en import dynamique** (~290 ko) — le *chunk* n'est téléchargé qu'au premier
  export XLSX ;
- noms d'onglets tronqués à 31 caractères, caractères `[ ] : * ? / \` remplacés ;
- **unicité garantie** des noms d'onglets par suffixe numérique (Excel refuse les doublons).

> **Attention à l'interprétation** : les compteurs affichés dans l'accordéon sont des
> **volumes bruts** (vues, scans) et non des personnes uniques.

---

## 6.8 Analyse textuelle — `generateAnalysis.js` (310 lignes)

Produit des points d'analyse rédigés, section par section : taux de présence, taux d'absence,
mix des présents, comparatif en points de pourcentage, diversité géographique, usage de
l'application mobile, délai médian entre inscription et check-in.

Utilisée par l'export Markdown. Comme elle passe par `i18n.global.t`, **elle suit la langue
active au moment de la génération**.

---

## 6.9 Ergonomie de l'onglet Exports

L'onglet fonctionne en **accordéon** : `openCategory` maintient une seule section ouverte à la
fois, chaque en-tête portant un titre, une description et un chevron.

> Une variante « lanceur de cartes groupées par famille » a été implémentée puis
> **abandonnée**, l'accordéon étant préféré. Le vestige de cette tentative est la prop
> `headerless` de `SessionPresenceExport`, désormais inutilisée.
