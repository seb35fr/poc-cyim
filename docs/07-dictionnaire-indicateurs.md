# 07 — Dictionnaire des indicateurs

Définition exacte, dénominateur et pièges de chaque indicateur affiché. C'est le document à
ouvrir quand deux chiffres du dashboard semblent se contredire.

---

## 7.1 Populations de référence

| Population | Définition | Usage |
|---|---|---|
| **Tous les délégués** | `delegates.length` | volumétrie brute uniquement |
| **Inscrits (`registered`)** | `d.status.toLowerCase() === "registered"` | **dénominateur de la majorité des taux** |
| **En attente (`pending`)** | `d.status.toLowerCase() === "pending"` | suivi du tunnel d'inscription |
| **Présents physiques** | `registered` **et** `checkedInDate` valide | mix des présents, décomposition participants |
| **Restants sans badge** | `registered` **et** pas de `checkedInDate` | pilotage du desk d'accueil |

Toutes les comparaisons de statut sont **insensibles à la casse**.

> **Choix produit important** : le **check-in est l'indicateur de présence de référence**, pas
> le nombre de badges délivrés. Le marquage `deliveredAt` dépend d'un geste humain à l'accueil
> et est structurellement sous-évalué. Un écart entre « badges délivrés » et « check-in » n'est
> donc pas nécessairement un défaut de données.

---

## 7.2 Présence physique

| Indicateur | Formule | Dénominateur |
|---|---|---|
| `checkedInCount` | délégués avec `checkedInDate` (dans la plage si le filtre est actif) | — |
| `notCheckedInCount` | `total − checkedInCount` | — |
| Taux de check-in | `checkedInCount / registeredCount` | **inscrits**, pas le total |
| Taux de badges délivrés | badges avec `deliveredAt` / `registeredCount` | **inscrits** |

### Divergence connue sur la validité du check-in

Deux définitions coexistent dans le code :

| Emplacement | Test | Conséquence |
|---|---|---|
| `computeGlobal` (`global.checkedInCount`) | `if (d.checkedInDate && inRange(...))` — **véracité simple** | une chaîne non vide mais non analysable est comptée |
| `viewerJoin.hasValidCheckin` (participation, Live, Replay, entonnoirs) | `Number.isFinite(Date.parse(d.checkedInDate))` | une chaîne fantaisiste est **exclue** |

En pratique les deux coïncident (les dates viennent de MongoDB), mais sur un jeu de données
dégradé le KPI « check-in » de la Vue d'ensemble peut être **légèrement supérieur** à la
composante physique de « Total participants ». À unifier lors du portage vers `stats-core` —
c'est un cas de test de non-régression à écrire explicitement.

---

## 7.3 Total participants (dédoublonné)

L'indicateur central du bilan. Un délégué compte **une seule fois**, et la présence physique
**absorbe** toute consommation à distance.

```
total = checkedIn + liveOnly + both + replayOnly
```

| Composante | Définition |
|---|---|
| `checkedIn` | présence physique valide (`hasValidCheckin`) |
| `liveOnly` | rapproché en live, **sans** check-in, **sans** replay |
| `both` | rapproché en live **et** replay, **sans** check-in |
| `replayOnly` | rapproché en replay, **sans** check-in, **sans** live |

La composante physique est en outre décomposée en **quatre sous-groupes disjoints** dont la
somme vaut exactement `checkedIn` : `checkedInOnly`, `checkedInLive` (live seul),
`checkedInReplay` (replay seul), `checkedInLiveReplay` (les deux).

### Les trois grands modes affichés en Vue d'ensemble

| Mode affiché | Contenu |
|---|---|
| **Présence physique** | `checkedInOnly` + `checkedInLive` + `checkedInReplay` + `checkedInLiveReplay` |
| **Live distanciel** | `liveOnly` + `both` |
| **Replay distanciel** | `replayOnly` |

La barre est dessinée en trois zones colorées, de longueur proportionnelle au total de chaque
événement.

> **Piège** : les spectateurs Elasticsearch **non rapprochés** (`unknown`) sont **exclus** du
> total. Le « Total participants » est donc un **plancher fiable**, jamais un maximum. Si la
> couverture Keycloak est mauvaise, il est sous-estimé — d'où la notification de diagnostic
> à 50 %.

---

## 7.4 Décomposition par type et par catégorie (Vue d'ensemble)

Périmètre : **inscrits uniquement**, segmentés en trois classes exclusives :

```
physique  /  live-replay seul  /  aucune participation
```

La somme des trois vaut exactement le nombre d'inscrits pour ce type ou cette catégorie.

---

## 7.5 Scans sur site

| Indicateur | Définition | Piège |
|---|---|---|
| `totalAudienceScans` | scans d'entrée de salle | volume brut, pas de personnes |
| `totalCheckinScans` | scans au portique d'entrée du site | **0 est un cas réel** : le flux peut être dormant côté pipeline sans que ce soit un défaut du dashboard |
| `totalZoneScans` | accès aux zones (stands, lounges) | volume brut |
| `uniqueAudienceDelegates` | `delegate.id` distincts en salle | exclut `'-'` et `null` |
| `uniqueDelegatesAll` | distincts sur les trois sources confondues | |
| **`audienceUniqueDelegateSessions`** | **somme, sur toutes les sessions, des délégués distincts scannés en salle** | ⚠ **ce n'est pas** un nombre de délégués uniques |

### Comprendre `audienceUniqueDelegateSessions` (« vues en salle »)

C'est la mesure de l'**audience réelle des conférences**. Les multi-scans d'une même session
par la même personne sont dédoublonnés, mais un délégué présent à N sessions **compte N fois**.

```
Alice : sessions A, B, C   →  3
Bob   : session A (scanné 2×) →  1
                              ─────
« vues en salle »            =  4      délégués uniques en salle = 2
```

Confondre les deux est l'erreur d'interprétation la plus fréquente sur cet onglet.

### Sens de passage

`direction` est normalisé en `in` / `out` / `unknown` par correspondance de sous-chaîne
(`in*`, `entr*` → `in` ; `out*`, `sort*` → `out`). Tout libellé inattendu tombe en `unknown` et
reste comptabilisé dans les volumes.

### Ré-association

`recoveredScans` = scans dont le `delegate_id` valait `'-'` mais dont le QR a été rattaché côté
navigateur ; `unmatchedScans` = scans restant réellement orphelins (badge d'un autre événement,
badge de test, QR illisible). **Les scans récupérés comptent normalement dans tous les
indicateurs.** Voir [03 — Modèle de calcul §3.4](03-modele-calcul.md#34-ré-association-qr).

---

## 7.6 Live

| Indicateur | Définition |
|---|---|
| Délégués uniques (live) | `user_id` distincts rapprochés d'un délégué |
| **Sans présence physique** | délégués **rapprochés** dont `hasValidCheckin` est faux — les `unknown` sont **exclus** |
| Vues totales | nombre de documents Elasticsearch retenus |
| Durée moyenne par vue | somme des durées / nombre de vues |
| Délégués uniques par jour | regroupement sur **`sessionEnd`** = **date de diffusion** |
| Par jour et par chaîne | libellé issu de `channel_name`, repli `Chaîne N` trié par volume |
| Créneaux de 30 min | sur `sessionEnd` |
| Engagement | tranches `1 / 2-5 / 6-10 / 10+` sessions |

## 7.7 Replay

Indicateurs identiques, à une différence près et essentielle :

| | Regroupement |
|---|---|
| **Replay** | **`timestamp` du visionnage** — la date à laquelle la personne a regardé la VOD, potentiellement des semaines après la session |

S'y ajoutent :

- **Nouveaux délégués par jour** (`newUniqueByDay`) — première consultation seulement ;
- **Cumul des délégués distincts** ayant consulté du replay ;
- **Entonnoir « présents physiques ayant revu en replay »** (`physicalReplay.js`) — série
  journalière (délégués uniques + vues, double axe) et série cumulée. En mode comparaison, deux
  courbes cumulées A vs B alignées sur J0.

---

## 7.8 Engagement (Vue d'ensemble)

Répartition des délégués par nombre de **sessions UNIQUES**, en prenant l'**union dédoublonnée
salle ∪ live ∪ replay**. Une session du programme suivie par plusieurs canaux (présent en salle
puis revue en replay) compte **une seule fois**.

Tranches : `1 · 2-5 · 6-10 · 11-15 · 16-20 · 21-25 · 26-30 · 30+`. Deux exports associés :
distribution et détail par délégué.

> À distinguer de l'engagement affiché dans les onglets Live et Replay, qui compte les sessions
> **de ce canal uniquement** (tranches `1 / 2-5 / 6-10 / 10+`).

## 7.9 Participants par jour (Vue d'ensemble)

Histogramme **groupé** : une barre par modalité (Présence physique · Live · Replay) et par jour,
comptant les délégués **distincts actifs ce jour-là**. Suit le filtre « Modalité de
participation » (une série décochée disparaît).

> **Pas de dédoublonnage inter-modalité** : une personne présente sur site et regardant du live
> le même jour apparaît dans les deux barres. C'est délibéré — l'indicateur répond à « combien
> de monde par canal chaque jour ? », pas à « combien de personnes ». Les libellés sont
> volontairement « Live » et « Replay » **sans** le mot « distanciel », pour ne pas être confondus
> avec les modes de la décomposition « Total participants ».

---

## 7.10 Onboarding & application mobile

| Indicateur | Définition | Dénominateur |
|---|---|---|
| Onboarding | délégués avec `firstOnboardingConnection` | **inscrits** — seuls eux ont accès à l'espace personnel |
| Application mobile | délégués dont `contact.apps` contient une entrée d'identifiant `mobileApplicationId` avec `lastUsed` de **moins de 3 mois** | inscrits |

L'usage mobile est **dédoublonné par `contactId`** (un contact avec plusieurs inscriptions ne
compte qu'une fois). Le KPI est **masqué** si aucun `mobileApplicationId` n'est configuré sur
l'événement.

> Les regroupements journaliers d'onboarding et de mobile utilisent `toISOString()`, donc
> **UTC** — contrairement au reste du dashboard qui bucke en **heure de Paris**. Écart mineur
> (décalage possible d'un jour aux heures tardives), à harmoniser lors du portage.

---

## 7.11 Type de badge d'un délégué

`delegateBadgeType(d)` = **premier badge en base**, à défaut **première inscription**. C'est
cette valeur que le filtre global « type de badge » utilise pour retenir ou écarter un délégué.

Côté scans, le filtre s'applique au champ Elasticsearch `badge_type` (index audience) ou
`registration_type` (index checkin et zone) — après la ré-association QR, qui peut avoir
**récupéré** ce type.

---

## 7.12 Récapitulatif des dénominateurs

| Taux affiché | Dénominateur |
|---|---|
| Taux de check-in | inscrits |
| Taux de badges délivrés | inscrits |
| Taux d'onboarding | inscrits |
| Usage mobile | inscrits |
| Part d'un type / d'une catégorie | inscrits pour cette dimension |
| « Sans présence physique » (Live/Replay) | délégués **rapprochés** de ce canal (jamais tous les inscrits) |
| Part d'un mode de participation | `total` dédoublonné (pas les inscrits) |
