# 03 — Modèle de calcul

Toute la couche de calcul vit dans `src/utils/` et **n'importe pas Vue**. Ce sont des
fonctions pures : mêmes entrées → mêmes sorties, aucun état, aucun effet de bord (à deux
exceptions près, cf. [01 — Architecture §1.2](01-architecture.md#12-les-cinq-couches)).

C'est la partie du PoC qui porte la valeur métier, et **aucune ligne n'est couverte par un
test.**

---

## 3.1 `computeStats.js` — statistiques d'inscription

### Signature et évaluation paresseuse

```js
computeAllStats(delegates, mobileAppId = null, dateRange = null)
```

La fonction ne calcule **rien** à l'appel. Elle retourne un objet dont les **huit sections
sont des accesseurs (`get`)** mémoïsés par fermeture :

```js
get global()       { if (!_global) _global = computeGlobal(delegates, mobileAppId, inRange); return _global; }
get demographics() { … }   get registrations() { … }   get temporal() { … }
get checkinFlow()  { … }   get badges() { … }          get onboarding() { … }   get mobileApp() { … }
```

**Pourquoi** : avant ce découpage, `computeAllStats` était une fonction monolithique de
~450 lignes qui calculait les huit sections en un passage. Chaque clic de filtre croisé
recalculait *tout*, y compris les blocs que l'onglet courant n'affiche pas (l'onglet
Démographie recalculait le temporel et les badges pour rien). Un onglet consomme typiquement
**2 à 3 sections sur 8** : le gain est direct sur les événements de plus de 5 000 délégués.

**Limite** : la mémoïsation est **par instance**. Un nouveau filtre croisé produit un nouvel
objet stats, donc un recalcul complet des sections consultées. Il n'y a pas de mémoïsation
inter-clics.

### Contenu des huit sections

| Section | Fonction | Contenu principal |
|---|---|---|
| `global` | `computeGlobal(delegates, mobileAppId, inRange)` | totaux, `registeredCount`, `pendingCount`, `checkedInCount`, badges délivrés, taux |
| `demographics` | `computeDemographics(delegates)` | pays, `uniqueCountries`, continents, genre, professions, qualifications, civilités, sociétés |
| `registrations` | `computeRegistrations(delegates)` | statuts, statut par type, types, catégories, jours d'accès, multi-inscriptions |
| `temporal` | `computeTemporal(delegates)` | courbes d'inscription par jour, cumul, jour de semaine, hebdomadaire par type et par statut |
| `checkinFlow` | `computeCheckinFlow(delegates, inRange)` | flux de check-in par jour, créneaux de 15 min, pic |
| `badges` | `computeBadges(delegates)` | badges délivrés par jour/créneau, appareil de délivrance, check-in par type |
| `onboarding` | `computeOnboarding(delegates)` | premières connexions à l'espace personnel |
| `mobileApp` | `computeMobileApp(delegates, mobileAppId)` | usage de l'application mobile |

Les sections sont **strictement indépendantes** — aucune ne lit le résultat d'une autre. Là où
un scalaire est nécessaire dans deux sections (`totalBadgesDelivered` par exemple), il est
recalculé localement : une boucle O(n) supplémentaire est négligeable face au coût d'un bloc
entier, et cela garantit qu'aucun accesseur ne déclenche en cascade le calcul d'un autre.

### Portée du paramètre `dateRange`

`dateRange` est converti une fois en prédicat par `makeInRange()` (`utils/dateRange.js`) puis
injecté dans **deux sections seulement** : `computeGlobal` (pour `checkedInCount`) et
`computeCheckinFlow`.

Les sections `registrations` (`createdAt`), `badges` (`deliveredAt`), `onboarding`,
`demographics` et `temporal` **ignorent le filtre date**. C'est un choix délibéré, détaillé
dans [04 — État & filtres §4.3](04-etat-filtres.md#43-filtre-plage-de-dates).

### Convention de valeur manquante

`groupBy()` remplace une clé nulle par la chaîne littérale **`"Non renseigne"`** (sans accent,
telle qu'écrite dans le code). Les catégories dérivées sont produites en **français canonique**
(`"Hommes"`, `"Femmes"`, `"Autre"`, `"Tous les jours"`), puis traduites **à l'affichage** par
`i18n/labels.js`. La couche calcul reste ainsi indépendante de la locale — mais cela impose
aux filtres croisés de comparer sur la valeur *localisée* ou de conserver la valeur brute
comme étiquette (cf. [05 — Interface](05-interface.md)).

---

## 3.2 `computeScanStats.js` — scans sur site

`computeAllScanStats({ audience, checkin, zone }, { dateRange, badgeTypes, qrLookup })`
exécute un pipeline en **quatre étapes, dans cet ordre précis** :

```
1. NORMALISATION      normalizeAudience / normalizeCheckin / normalizeZone
                      → schéma unifié, _source ES conservé dans scan.raw
2. RÉ-ASSOCIATION QR  recoverDelegateIds(scans, qrLookup)     ← AVANT le filtrage
3. ENRICHISSEMENT     enrichFromLookup(scans, qrLookup)
4. FILTRAGE           par timestamp (dateRange) puis par badgeType
```

**L'ordre n'est pas négociable.** La ré-association doit précéder le filtrage : un scan dont
le type de badge est récupéré à l'étape 2 doit pouvoir être retenu par le filtre badge de
l'étape 4. Inverser les deux ferait disparaître les scans récupérés dès qu'un filtre badge est
actif.

Le `_source` Elasticsearch brut est conservé sur chaque scan (`scan.raw`) pour alimenter la
modale d'inspection `ScanDetailModal`.

### Sortie

```
{
  global:   { totalAudienceScans, totalCheckinScans, totalZoneScans, totalScans,
              uniqueAudienceDelegates, uniqueCheckinDelegates, uniqueZoneDelegates,
              uniqueDelegatesAll, audienceUniqueDelegateSessions,
              distinctSessions, distinctRooms, distinctZones,
              recoveredScans: { audience, checkin, zone, total },
              unmatchedScans: { checkin, zone, total } },
  audience: { scans, topSessions, topRooms, byHour, byDirection, byBadgeType,
              sessionsPerDelegate, sessionTypes },
  checkin:  { scans, byHour, byDirection, byBadgeType },
  zone:     { scans, topZones, byHour, byDirection },
  combined: { byHour, uniqueDelegatesByDay, uniqueDelegatesByDayByBadgeType,
              uniqueDelegatesByDayAudience / …Checkin / …Zone },
  all:      [...tous les scans]
}
```

### Deux heuristiques fragiles

| Heuristique | Implémentation | Fragilité |
|---|---|---|
| **Millisecondes vs secondes** | `toEpochMs(ts)` (`parisTime.js`) — bascule sur le seuil `< 10¹²` | casse si Flink change la forme de l'horodatage. Devrait être un type `date` côté mapping ES |
| **Sens de passage** | `normalizeDirection()` — `in`/`entr*` → `in`, `out`/`sort*` → `out`, sinon `unknown` | mapping par sous-chaîne, sensible à tout nouveau libellé. Devrait être un `enum IN\|OUT\|UNKNOWN` côté Flink |

### Écarter le faux délégué `'-'`

`isRealDelegateId(id)` retourne `false` pour `null` **et pour la chaîne `'-'`**. Sans ce garde,
tous les scans non résolus par Flink fusionneraient en **un seul faux délégué unique** —
gonflant artificiellement les délégués distincts. Ce garde est appliqué dans tous les
comptages de délégués uniques.

---

## 3.3 Jointures

### `viewerJoin.js` — Elasticsearch ↔ délégué

Le `user_id` des index live et replay est un **identifiant Keycloak**, pas un `delegate.id`.
La jointure côté navigateur reconstitue le lien via **deux sources**, exactement comme la
requête `contactByAccountId` du service `contacts` :

| # | Chemin | Condition |
|---|---|---|
| 1 | `contact.emailAddresses[].source.id` | `source.type === "ACCOUNT"` |
| 2 | `contact.externalIds[].value` | `type === "/kc"` |

La source 2 est indispensable : elle capte les délégués dont le compte Keycloak **n'est pas
matérialisé** dans `emailAddresses`. Sans elle, la couverture de jointure chute et des
inscrits légitimes apparaissent comme « non reconnus ».

Un contact peut avoir **plusieurs** adresses e-mail, chacune liée à un compte Keycloak
distinct : `getKeycloakIds(delegate)` collecte **tous** les identifiants et le délégué est
indexé sous chacun d'eux. En cas de collision (deux délégués partageant un compte — anomalie
de données), c'est le **premier écrit qui gagne**.

`buildDelegateLookup(delegates)` produit une `Map<keycloakId, { checkedIn, delegate }>`. Chaque
hit Elasticsearch tombe alors dans l'une de trois catégories :

| Catégorie | Sens | Traitement dans les KPI |
|---|---|---|
| `checkedIn` | rapproché **et** physiquement présent | compté dans la présence physique |
| `noCheckin` | rapproché, **sans** check-in valide | alimente « sans présence physique » |
| `unknown` | aucun rapprochement | **exclu** des KPI (spectateur anonyme ou identifiant inattendu) |

**Diagnostics** — deux seuils à 50 %, avec des destinations volontairement différentes :

| Symptôme | Détection | Destination | Pourquoi |
|---|---|---|---|
| couverture Keycloak < 50 % **côté délégués** | `buildDelegateLookup` | **bandeau UI** (`pushDiagnostic`) + console | actionnable : l'administrateur peut alerter l'équipe technique |
| taux de rapprochement < 50 % **côté hits ES** | `getRemoteOnlyDelegateIds` | **console uniquement** | symptôme d'un changement du pipeline Flink, l'administrateur n'y peut rien |

Les avertissements sont dédupliqués par empreinte (`_warnedFingerprints`, au niveau du module)
pour ne pas être répétés à chaque recalcul d'un `computed` sur le même jeu de données. Aucun
avertissement n'est émis sous 50 enregistrements (`MIN_DATASET_SIZE`), pour éviter le bruit sur
l'état initial vide.

`viewerJoin.js` est aussi le **domicile canonique** de trois assistants réutilisés partout —
ils y ont été dédupliqués depuis quatre fichiers :

- `hasValidCheckin(d)` — `checkedInDate` doit être **parsable par `Date.parse`**. Une chaîne
  vide ou fantaisiste est traitée comme *non présent* ; la simple véracité de la valeur ne
  suffit pas.
- `getRpps(d)` — RPPS lu dans `contact.externalIds` (`type` = `RPPS`, insensible à la casse).
- `getKeycloakId(d)` / `getKeycloakIds(d)`.

### Scans ↔ délégué

Les trois index de scans portent directement le **`delegate.id` MongoDB** : aucune traduction
n'est nécessaire. La jointure sert uniquement à **enrichir** (nom, e-mail, type de badge) et à
**récupérer** les lignes orphelines — cf. §3.4.

---

## 3.4 Ré-association QR

### Le problème

Côté Flink (`stats_room_scans.sql`), le QR scanné est résolu en délégué via le resolver
`event(id).registrationByBadgeQRCode(qrCode)`. Ce resolver
(`registration-badges/server/schemas/index.ts`) applique `decodeURI(qrCode)`, parse le résultat
en chaîne de requête, puis :

- si un paramètre `d` (delegateId) est présent → rapprochement sur `{ delegateId, eventId }` ;
- sinon → rapprochement sur le champ **littéral** `{ eventId, qrCode }`.

Les badges réellement **générés et finalisés** (avec `retrievalCode` et `storage` en base) sont
rapprochés. Les badges non générés, périmés, ou créés *après* le scan (n'ayant qu'un `qrCode`)
retombent en échec.

**Confirmé en production** par comparaison de deux instantanés GraphQL du même délégué : le
badge existe bien dans `delegate.badges[]`, mais `registration.badge` est résolu **de façon
intermittente** (`null` puis objet). Ce n'est donc **pas** une divergence de valeur — la donnée
est correcte, c'est le *timing* de la recherche ponctuelle de Flink qui échoue. La conséquence
diffère selon le type de jointure SQL :

| Index | Jointure | Conséquence |
|---|---|---|
| `checkin`, `zone` | `LEFT JOIN` | `delegate_id = '-'` → **récupérable** |
| `audience` | `INNER JOIN` | ligne **absente de l'index** → **irrécupérable** |

### La solution — sans aucun appel réseau

Puisque le badge et son QR sont **déjà chargés** dans la population de délégués, le
rattachement se refait côté navigateur.

**`buildQrDelegateLookup(delegates)`** construit une `Map` indexée de deux façons :

- **par QR** — pour chaque badge, `qrCode.value` *et* `qrCode.decodedValue`, chacun sous
  plusieurs clés normalisées ;
- **par `delegate.id`** — pour enrichir les scans déjà rapprochés.

La normalisation (`qrKeys`) génère **deux clés candidates**, de la plus spécifique à la plus
tolérante :

| Clé | Transformation | Tolère |
|---|---|---|
| souple | `trim()` + minuscules | espaces en bordure, casse |
| stricte | minuscules + suppression de tout caractère non alphanumérique | espaces internes, préfixe ponctué (`"ER "`), casse |

La charge utile en base32 reste discriminante, donc aucune collision en pratique. **Les mêmes
clés sont utilisées des deux côtés** (indexation des badges *et* recherche du scan), ce qui
garantit la cohérence.

Le lookup est construit dans `StatisticsView` sur la population **complète** — délibérément
**pas** filtrée par type de badge : la récupération d'un scan ne doit pas dépendre de l'état
d'un filtre d'affichage.

**Deux passes** ensuite :

| Passe | Cible | Action |
|---|---|---|
| `recoverDelegateIds()` | scans à `delegateId` = `'-'` ou `null` | rapproche via `raw_qr_code`, pose `scan.recovered = true` |
| `enrichFromLookup()` | scans à `delegateId` réel | complète `fullName`, `email`, `badgeType`, `badgeId` **si l'ES les laisse vides** |

**Le piège du placeholder `'-'`** : les lignes non rapprochées par Flink écrivent le caractère
littéral `'-'` (et non une chaîne vide) dans `user_email`, `user_fullName`, etc. — conséquence
du `CASE WHEN … ELSE '-'` du SQL. `isBlankField(v)` traite donc `''`, `'-'` et `'—'` comme
vides. Sans cela, l'enrichissement de l'e-mail ne se déclenchait **jamais**.

L'enrichissement est **non destructif** : une vraie valeur Elasticsearch n'est jamais écrasée.
Chaque champ enrichi porte un drapeau (`fullNameEnriched`, `emailEnriched`,
`badgeTypeEnriched`, `badgeIdEnriched`) qui alimente le surlignage vert des cellules dans
l'onglet Scans QR. Le `fullName` reconstitué prend la forme
**`givenName familyName (delegateId)`** — la même que celle écrite par Flink pour les lignes
rapprochées, par souci de cohérence des tableaux et des exports.

### Portée et transparence

Les scans récupérés comptent **normalement partout** : délégués uniques par jour, engagement,
top sessions, cartes géographiques, tous les exports, export Markdown et dump JSON. Les
compteurs `global.recoveredScans` et `global.unmatchedScans` sont affichés dans l'onglet Scans
QR (« X ré-associés · Y restants non associés »), avec un filtre par QR et une modale
d'inspection ligne par ligne.

**Limites résiduelles** : l'audience en salle reste irrécupérable (`INNER JOIN`), et si le
scanner émet un QR réellement différent de `value` et `decodedValue`, le scan reste orphelin.

---

## 3.5 `participation.js` — le KPI « Total participants »

`computeParticipation(delegates, liveItems, replayItems, { datasetLabel, dateRange })` produit
la **photo dédoublonnée** de qui a réellement participé. La règle : un délégué compte **une
seule fois**, et la présence physique **absorbe** toute consommation à distance.

```
total = checkedIn + liveOnly + both + replayOnly
```

La présence physique est ensuite décomposée en **quatre sous-groupes disjoints** dont la somme
vaut exactement `checkedIn` :

| Sous-groupe | Définition |
|---|---|
| `checkedInOnly` | présent, aucune consommation à distance |
| `checkedInLive` | présent + live **seul** (pas de replay) |
| `checkedInReplay` | présent + replay **seul** (pas de live) |
| `checkedInLiveReplay` | présent + live **et** replay |

Les participants à distance (jamais présents physiquement) se répartissent en `liveOnly`,
`both` et `replayOnly`.

La fonction retourne les `Set<delegate.id>` de chaque composante **et** un objet `counts`.
Quand `dateRange` est fourni, le check-in physique est filtré sur `checkedInDate` ; les items
live et replay sont, eux, **déjà filtrés en amont** par leurs `compute*` respectifs.

C'est la **source unique** de l'onglet Vue d'ensemble et de la section « Total participants »
de l'export Markdown — aucune duplication de cette logique ailleurs.

---

## 3.6 `computeLiveStats.js` / `computeReplayStats.js`

Même forme : `compute*Stats(hits, sessionMap, dateRange)` normalise les hits Elasticsearch,
les enrichit via la `sessionMap` GraphQL (titre, type, début, fin, durée), filtre par date,
puis agrège.

**La différence essentielle est la date de référence** :

| | Champ de filtrage et de regroupement | Sens |
|---|---|---|
| **Live** | `sessionEnd` (repli `sessionStart`, puis `timestamp`) | **date de diffusion** |
| **Replay** | `timestamp` | **date de visionnage**, potentiellement très éloignée de la session |

Pour le replay, il n'y a **délibérément aucun repli sur `session_start`** : cela reviendrait à
regrouper par date de session au lieu de date de consultation, ce qui viderait l'indicateur de
son sens.

Le repli du live sur `sessionEnd` s'explique par l'absence d'horodatage de visionnage fiable
dans l'index live. C'est aussi pourquoi le filtre date global est **inactif par défaut** : sans
cela, une session sans `sessionEnd`, `sessionStart` ni `timestamp` serait exclue et le live
tomberait à zéro.

Le libellé de chaîne de diffusion vient de `channel_name` (exposé par l'index), avec un repli
`Chaîne N` trié par volume décroissant.

---

## 3.7 Assistants de domaine

| Fichier | Rôle |
|---|---|
| `parisTime.js` | `parisDateParts(iso)` (UTC → Paris, CET/CEST géré) · `parisDay` · `parisDateTime` · **`toEpochMs(ts)`** (source unique de l'heuristique ms/secondes) · **`wallClock(ts)`** (heure murale sans conversion, pour les `TIMESTAMP` naïfs sans `Z` de SI-views) · `sessionDateShort(start)` (préfixe « JJ/MM ») |
| `dateRange.js` | `makeInRange(dateRange)` → prédicat `(date) => bool` partagé par les inscriptions et les sources ES |
| `countries.js` | code pays → continent, drapeau (~250 pays) |
| `frenchRegions.js` | deux premiers caractères du code postal → région INSEE + libellé |
| `typeColors.js` | palette déterministe par type d'inscription (hachage du libellé, 12 couleurs) |
| `heatColor.js` | échelle de chaleur partagée des cartes (gris → vert → orange → rouge) |
| `burndown.js` | courbes de décroissance des restants à check-in (pas de 15 ou 30 min) |
| `checkinByType.js` | barre empilée check-in/restants par type de badge |
| `physicalReplay.js` | entonnoir « présent physiquement **puis** revu en replay » (séries journalière et cumulée) |
| `buildCheckedInDelegates.js` | liste des présents confirmés pour l'export |
| `formatters.js` | `fmt(n)`, `pct(a, b)`, `shortName(name, maxLen)`, `formatDurationHMS(sec)` — **auparavant redéfinis 15 fois** dans les onglets |
| `debug.js` | `debug.log` / `debug.table`, neutralisés en production via `import.meta.env.DEV` |

**Toutes ces mises en forme temporelles passent par l'heure de Paris.** Tout regroupement par
jour ou par heure (check-in, `deliveredAt`, live, replay, scans) utilise `parisDateParts`, ce
qui évite les décalages UTC sur les événements de fin de journée et gère automatiquement le
passage à l'heure d'été.
