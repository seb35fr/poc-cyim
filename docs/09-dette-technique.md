# 09 — Dette technique

Inventaire des écarts entre l'état actuel et un logiciel exploitable en production. Chaque
entrée porte une **sévérité** et le **lot du plan de migration** qui la traite
([plan-migration.html](../perennisation/plan-migration.html)).

| Sévérité | Sens |
|---|---|
| 🔴 **Bloquant** | interdit la mise en production en l'état |
| 🟠 **Majeur** | crée un risque d'erreur, de non-conformité ou de coût de maintenance élevé |
| 🟡 **Mineur** | à corriger, sans urgence |

---

## 9.1 Sécurité & conformité

### 🔴 D1 — Elasticsearch exposé au navigateur, sans authentification

`/api/es/{index}/_search` transfère la requête telle quelle. **Aucune authentification, aucune
liste blanche d'index, aucune limitation de débit.** Le cluster lui-même n'a pas
d'authentification (`new Client({ node: process.env.ES_API })` dans
`xlsx-stats/datasources/els.js`).

Conséquence : toute personne atteignant le proxy peut interroger **n'importe quel index** du
cluster, y compris hors périmètre congrès.

*Traité par : **L1** (accès ES côté serveur) + **L3** (API d'agrégation).*

### 🔴 D2 — Token Bearer dans le bundle JavaScript

`VITE_AUTH_TOKEN` est injecté à la compilation, donc **lisible dans le fichier `.js` livré**.
C'est un token de session utilisateur réelle, avec ses droits complets. Il expire sans
mécanisme de rafraîchissement.

Il n'y a **ni Keycloak, ni garde de route, ni vérification de permission** : quiconque a l'URL
et un token voit toutes les données de l'événement.

*Traité par : **L2** (Keycloak + Cerbos).*

### 🔴 D3 — Aucun masquage RGPD

Le champ `delegate.gdpr` est **récupéré mais jamais utilisé** pour anonymiser. Le microservice
`xlsx-stats`, dont ce PoC reprend le périmètre, remplaçait par `***` les délégués sans
consentement. Le dashboard affiche nom, e-mail et RPPS de tout le monde, et les exporte.

Aggravant : le **dump JSON** de l'export Markdown contient les **délégués bruts**, y compris les
données de contact, et se retrouve téléchargé sur des postes puis potentiellement transmis à un
service de LLM tiers.

*Traité par : **L3** (masquage côté serveur) + **L7** (recette RGPD).*

### 🟠 D4 — Aucun contrôle d'accès par événement

L'`eventId` de l'URL n'est jamais confronté aux droits du porteur du token. Un utilisateur
habilité sur un congrès peut lire les statistiques de n'importe quel autre en changeant l'URL.

*Traité par : **L2**.*

---

## 9.2 Architecture & données

### 🔴 D5 — Aucun équivalent production du proxy `/api/es`

Le proxy est un mécanisme du serveur de développement Vite. En production, il faudrait exposer
un `/api/es` côté nginx vers un cluster sans authentification — ce qui revient à publier D1.

*Traité par : **L1** + **L3** (le proxy disparaît).*

### 🟠 D6 — Tout chargé en mémoire navigateur

Aucune agrégation serveur : le navigateur télécharge l'intégralité des délégués, scans, vues
live et vues replay, puis calcule. Au-delà de ~100 000 scans, la mémoire et les `computed`
deviennent le facteur limitant.

*Traité par : **L3** (agrégations `size: 0` + `terms` / `date_histogram` / `cardinality`) + **L7** (perf).*

### 🟠 D7 — Agrégats backend existants non utilisés

`fetchMetrics` est écrit mais **jamais appelé**. Le backend expose déjà
`totalDelegatesCount`, `checkedInCount`, `statuses`, `categories`, `types`, `companies`,
`accessDays` — que le PoC recalcule intégralement côté client.

*Traité par : **L3**.*

### 🟠 D8 — Ré-association QR faite côté client

Le rattachement des scans orphelins est un **contournement client d'un défaut du pipeline
Flink** (cf. [03 §3.4](03-modele-calcul.md#34-ré-association-qr)). Il fonctionne, il est
documenté, mais :

- il ne bénéficie **pas** aux autres consommateurs des mêmes index (`xlsx-stats`, exports
  historiques) ;
- l'audience en salle reste **irrécupérable** (`INNER JOIN` côté Flink) ;
- le vrai correctif est en amont — rendre la résolution `registrationByBadgeQRCode` déterministe,
  ou rejouer l'enrichissement.

*Traité par : **L3** (centralisation côté serveur). Le correctif amont Flink reste un chantier distinct.*

### 🟠 D9 — Mapping Elasticsearch non stabilisé

Le code compense l'instabilité du mapping par des cascades de replis : **onze champs candidats**
pour l'horodatage live/replay, quatre pour la durée, quatre pour l'origine, six pour la fin de
session. Plus deux heuristiques fragiles :

| Heuristique | Risque |
|---|---|
| ms vs secondes (`toEpochMs`, seuil `< 10¹²`) | casse si Flink change la forme |
| `direction` par sous-chaîne (`in*`/`entr*`/`out*`/`sort*`) | tout nouveau libellé tombe en `unknown` |

Correctif de fond : champs `date` typés et `enum IN\|OUT\|UNKNOWN` côté Flink.

*Traité par : **L3** (normalisation côté serveur), correctif amont Flink hors périmètre.*

### 🟡 D10 — Noms d'index codés en dur et incohérents

`audience` utilise des **tirets**, `checkin` et `zone` des **underscores**. Aucun alias
versionné : un renommage côté cluster casse le dashboard silencieusement.

*Traité par : **L1** (alias versionné côté serveur).*

### 🟡 D11 — Pagination Elasticsearch séquentielle sans PIT

`search_after` sur `_id` décroissant, sans Point-in-Time ni `slice`. Une écriture concurrente
pendant le parcours peut théoriquement décaler le curseur.

*Traité par : **L3**.*

### 🟡 D12 — Aucun rafraîchissement incrémental

Le rafraîchissement recharge tout. Pistes : PIT + `timestamp > last_seen`, ou SSE depuis un
backend écoutant `cyim.webhooks`.

*Traité par : **L7**.*

### 🟡 D13 — Filtre des comptes internes incohérent

`fetchLiveViews` et `fetchReplayViews` excluent `*@cyim.com` ; **les trois index de scans non**.
Un scan par un compte interne compte dans la présence sur site.

*Traité par : **L3** (règle unique côté serveur).*

---

## 9.3 Qualité logicielle

### 🔴 D14 — Aucun test

**Zéro test** sur ~23 000 lignes, dont ~6 500 de calcul métier critique (`computeStats`,
`computeScanStats`, `viewerJoin`, `participation`, les constructeurs d'exports). Aucun filet de
non-régression : une modification d'un dénominateur passe inaperçue jusqu'à ce qu'un client
signale un chiffre faux.

C'est la dette la plus coûteuse à long terme, et la première à traiter — **avec un avantage
décisif** : le PoC actuel peut servir d'**oracle de non-régression** pour le portage
(mêmes entrées → mêmes sorties).

*Traité par : **L4** (`stats-core` en TypeScript + Vitest, parité PoC vérifiée).*

### 🟠 D15 — JavaScript sans types

Aucun TypeScript, alors que le standard CYIM est TS ~5.7 strict. Sur du code qui manipule des
structures Elasticsearch hétérogènes et des jointures multi-clés, l'absence de types est un
générateur d'erreurs silencieuses.

*Traité par : **L4** (calcul) + **L6** (interface).*

### 🟠 D16 — Aucun outil de qualité

Pas d'ESLint, pas de Prettier, pas de vérification de types, pas d'intégration continue, pas de
`Dockerfile`. Le style est maintenu « par imitation du code existant ».

*Traité par : **L5** (échafaudage `@platform/front-configs`).*

### 🟠 D17 — Plomberie maison réimplémentée

Environ **5 500 lignes** dupliquent des bibliothèques `@platform/*` testées :

| Fait à la main | Bibliothèque existante |
|---|---|
| `gqlFetch` + pagination curseur | `@platform/graphql-core` (`GqlClient`, `GqlConnection`) |
| jetons CSS dans `App.vue` | `@platform/theme-core` + `theme-ui` |
| `useDiagnostics` + `DiagnosticsBanner` | `@platform/common-ui` (`useSnackbar`) |
| `debug.js` (encapsulation de `console`) | `@platform/vue-logger` (`useLogger`) |
| `BadgeTypeFilter`, `FilterBanner`, filtres date | `@platform/filter-core` + `filter-ui` |
| `InfoTooltip`, modales, boutons, tableaux | `@platform/common-ui`, Quasar `q-table` |

*Traité par : **L6**.*

### 🟡 D18 — Composants surdimensionnés

`OverviewTab` (1 725 l.), `ExportsTab` (1 407 l.), `ViewersTab` (1 422 l.),
`ComparisonTab` (1 157 l.), `BadgesTab` (1 114 l.), `StatisticsView` (1 080 l.).

*Traité par : **L6** (découpage à la réécriture).*

### 🟡 D19 — Code mort

`DayOfTab.vue` (239 l.) non référencé ; `fetchMetrics` (24 l.) jamais appelé ; prop `headerless`
de `SessionPresenceExport` vestigiale.

*Traité par : **L4/L6** (non porté).*

### 🟡 D20 — Deux définitions de la validité du check-in

`computeGlobal` teste la véracité de `checkedInDate` ; `hasValidCheckin` exige `Date.parse`
fini. Sur données dégradées, le KPI de la Vue d'ensemble peut dépasser la composante physique de
« Total participants ». Voir [07 §7.2](07-dictionnaire-indicateurs.md#divergence-connue-sur-la-validité-du-check-in).

*Traité par : **L4** (unification + cas de test explicite).*

### 🟡 D21 — Regroupements journaliers en UTC pour onboarding et mobile

`computeOnboarding` et `computeMobileApp` utilisent `toISOString()`, donc **UTC**, alors que tout
le reste bucke en heure de Paris. Décalage possible d'un jour sur les activités tardives.

*Traité par : **L4**.*

### 🟡 D22 — Pas de virtualisation des tableaux

Le détail des scans est limité à **200 lignes en dur**.

*Traité par : **L6** (`q-table` ou virtualisation).*

---

## 9.4 Vue synthétique

| # | Dette | Sévérité | Lot |
|---|---|---|---|
| D1 | Elasticsearch exposé sans authentification | 🔴 | L1 · L3 |
| D2 | Token Bearer dans le bundle | 🔴 | L2 |
| D3 | Aucun masquage RGPD | 🔴 | L3 · L7 |
| D5 | Pas d'équivalent production du proxy `/api/es` | 🔴 | L1 · L3 |
| D14 | Aucun test sur ~6 500 l. de calcul critique | 🔴 | L4 |
| D4 | Aucun contrôle d'accès par événement | 🟠 | L2 |
| D6 | Tout en mémoire navigateur | 🟠 | L3 · L7 |
| D7 | Agrégats backend non utilisés | 🟠 | L3 |
| D8 | Ré-association QR côté client | 🟠 | L3 |
| D9 | Mapping Elasticsearch non stabilisé | 🟠 | L3 |
| D13 | Filtre des comptes internes incohérent | 🟠 | L3 |
| D15 | JavaScript sans types | 🟠 | L4 · L6 |
| D16 | Aucun outil de qualité ni CI | 🟠 | L5 |
| D17 | ~5 500 l. de plomberie maison | 🟠 | L6 |
| D10 | Noms d'index codés en dur | 🟡 | L1 |
| D11 | Pagination ES sans PIT | 🟡 | L3 |
| D12 | Pas de rafraîchissement incrémental | 🟡 | L7 |
| D18 | Composants surdimensionnés | 🟡 | L6 |
| D19 | Code mort | 🟡 | L4 · L6 |
| D20 | Deux définitions du check-in valide | 🟡 | L4 |
| D21 | Regroupements UTC résiduels | 🟡 | L4 |
| D22 | Pas de virtualisation des tableaux | 🟡 | L6 |

**Cinq dettes bloquantes**, dont quatre relèvent du **backend et de l'authentification** — ce qui
justifie de traiter ce périmètre en premier.

---

## 9.5 Ce qui n'est PAS de la dette

À ne pas « corriger » par méprise :

| Élément | Pourquoi c'est un choix, pas un défaut |
|---|---|
| **Filtre date inactif par défaut** | garde-fou contre un horodatage ES absent qui viderait le Live. À conserver tant que D9 n'est pas réglé |
| **Portée restreinte du filtre date** | filtrer les inscriptions par plage d'activité produirait des chiffres trompeurs |
| **Priorité du champ ES `session_type`** sur le `type` GraphQL | déjà inversé par erreur deux fois. Le `type` du nœud événement est le discriminant générique (« SESSION »), inexploitable |
| **`audienceUniqueDelegateSessions` ≠ délégués uniques** | mesure volontaire de l'audience des conférences |
| **Pas de dédoublonnage inter-modalité** dans « Participants par jour » | l'indicateur répond « combien par canal », pas « combien de personnes » |
| **Sections de statistiques paresseuses** | optimisation délibérée, pas une complexité gratuite |
| **`0` scan au portique d'entrée** | cas réel constaté : flux dormant côté pipeline, pas un défaut du dashboard |
| **Marqueurs CSV `YES`/`NO` non traduits** | stabilité des fichiers consommés par des outils tiers |
| **Composables liftés dans `StatisticsView`** | corrige les appels dupliqués et les minuteries fantômes — patron à conserver |
