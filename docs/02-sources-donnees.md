# 02 — Sources de données

L'application n'a pas de base. Elle lit **deux systèmes** et **rien d'autre**.

| Source | Transport | Authentification | Ce qu'elle fournit |
|---|---|---|---|
| Apollo Gateway (GraphQL) | `POST` JSON | `Authorization: Bearer <VITE_AUTH_TOKEN>` | délégués, inscriptions, badges, contacts, sessions du programme, noms de zones, branding |
| Elasticsearch | `POST /{index}/_search` | **aucune** | scans sur site, vues live, vues replay |

---

## 2.1 GraphQL — `src/api/graphql.js`

### Endpoint et instrumentation

```js
const GRAPHQL_URL = import.meta.env.DEV ? "/api/graphql" : import.meta.env.VITE_GRAPHQL_URL;
const AUTH_TOKEN  = import.meta.env.VITE_AUTH_TOKEN;
```

En développement, les appels passent par le **proxy Vite** `/api/graphql` (réécrit vers
l'origine de `VITE_GRAPHQL_URL`) ; en production, l'URL est appelée directement — ce qui
suppose que le gateway autorise l'origine du dashboard en CORS.

Toutes les requêtes traversent le *wrapper* **`gqlFetch(query, variables)`**, qui n'est pas un
client GraphQL mais un `fetch` instrumenté. Il apporte quatre choses :

1. **Nom d'opération extrait** de la requête (`query GetSessions(...)` → `GetSessions`) pour
   identifier la requête fautive dans les logs sans dumper le corps.
2. **Mesure du temps écoulé** sur chaque appel, journalisée en cas d'erreur.
3. **Détection de délai dépassé** — HTTP `504`/`408`/`524`, message serveur contenant
   `timeout|timed out|deadline`, ou codes d'extension `GRAPHQL_TIMEOUT`, `REQUEST_TIMEOUT`,
   `GATEWAY_TIMEOUT`. Un `TypeError: Failed to fetch` survenu après 10 s est étiqueté
   « probable timeout ».
4. **Avertissement sur requête lente** au-delà de `SLOW_QUERY_THRESHOLD_MS` (5 000 ms).

Ce dispositif existe parce que la pagination des délégués sur les gros congrès **mourait
silencieusement** : sans nom d'opération ni durée, une page perdue était indétectable.

### Les cinq opérations

| Fonction | Opération | Pagination | Usage |
|---|---|---|---|
| `fetchAllDelegates(eventId, onProgress)` | `event(id).searchDelegates` | curseur `pageToken`, **500/page**, tri `createdAt asc` | population complète — la requête la plus lourde |
| `fetchEventConfig(eventId)` | `event(id).config.branding` **+** `getEvent(id).config.mobileApplicationId` | — | nom, logo, identifiant de l'app mobile |
| `fetchEventSessions(eventId, onProgress)` | `event(id).children(eventType: [SESSION], first: 500)` | curseur `pageToken` | enrichit Live/Replay (titre, type, début, fin, durée, organisateurs) |
| `fetchLocationNames(ids)` | `location(id) { id name }` | **batch aliasé**, 50 par requête | libellés lisibles des zones scannées |
| `fetchMetrics(eventId)` | `event(id).metrics.registration` | — | **écrite mais jamais appelée** (cf. note ci-dessous) |

`fetchEventConfig` fait **deux requêtes** parce que les deux informations vivent sur des
points d'entrée différents : `event(id)` (fédéré) porte le branding, `getEvent(id)` (service
registration) porte `mobileApplicationId`. La seconde est enveloppée dans un `try/catch` :
son échec dégrade `mobileAppId` à `null` sans casser le chargement.

`fetchLocationNames` est délibérément **best-effort** : le `zone_id` d'un scan Elasticsearch
*est* un `location.id`, mais l'index ne porte que l'identifiant. Les noms sont résolus par
lots de 50 avec des **variables typées** (`$id0: ID!, $id1: ID!, …` et des alias `l0:`, `l1:`)
pour éviter toute injection. Un lot en échec est journalisé en `warn` et les identifiants
bruts servent de repli — un nom de zone manquant ne fait jamais échouer le chargement des
scans.

> **`fetchMetrics` est du code mort.** Le backend expose déjà des agrégats prêts à l'emploi
> (`totalDelegatesCount`, `checkedInCount`, `statuses`, `categories`, `types`, `companies`,
> `accessDays`) que le PoC **recalcule intégralement côté navigateur**. C'est une piste
> d'optimisation directe pour la version de production.

### Champs délégué consommés

La constante `DELEGATE_FIELDS` (80 lignes) est la **surface de données réelle** du dashboard.
Chaque champ y est parce qu'un indicateur en dépend :

| Champ | Alimente |
|---|---|
| `id` | clé de dédoublonnage de tous les comptages de participants |
| `givenName`, `familyName`, `email`, `title` | identité dans les tableaux et exports, civilité |
| `status` | population de référence (`registered`), répartition par statut |
| `createdAt`, `updatedAt` | courbes temporelles d'inscription, hebdomadaire par statut |
| `checkedInDate` | **présence physique** — le KPI le plus scruté |
| `gender`, `occupation`, `jobTitle`, `qualification`, `practiceModes`, `company` | démographie, professions, sociétés |
| `categories` | répartition par catégorie |
| `gdpr` | présent dans le modèle, **non exploité** pour l'anonymisation (cf. dette) |
| `firstOnboardingConnection` | taux d'activation de l'espace personnel |
| `primaryAddress { countryCode city zipCode country.code }` | cartes monde/Europe, régions françaises (2 premiers caractères du code postal) |
| `registrations { id type status categories accessDays }` | types d'inscription, jours d'accès, multi-inscriptions |
| `badges { id type deliveredAt deliveredBy storage.publicUrl qrCode.value qrCode.decodedValue }` | badges délivrés, type de badge, **ré-association QR des scans** |
| `contact.externalIds { value type }` | **RPPS** (`type === "RPPS"`) et **identifiant Keycloak** (`type === "/kc"`) |
| `contact.emailAddresses { value source.id source.type }` | **identifiant Keycloak** quand `source.type === "ACCOUNT"` — clé de jointure live/replay |
| `contact.memberships.items.type` | type d'adhésion |
| `contact.apps { id lastUsed version name platform }` | usage de l'application mobile |
| `contactId`, `externalContactId`, `externalId`, `notes`, `options` | colonnes brutes de l'onglet Données et des exports |

**Deux champs sont des clés de jointure critiques** et méritent d'être connus :

- **`contact.emailAddresses[].source.id`** quand `source.type === "ACCOUNT"` → identifiant du
  compte Keycloak. C'est la clé du rattachement des vues live/replay.
- **`contact.externalIds[].value`** quand `type === "/kc"` → **seconde** source d'identifiant
  Keycloak, qui capte les délégués dont le compte n'est pas matérialisé dans
  `emailAddresses`. Elle réplique en mémoire la branche de repli de `contactByAccountId` du
  service `contacts`, sans appel réseau supplémentaire.

---

## 2.2 Elasticsearch — `src/api/elasticsearch.js`

### Accès

```js
const ES_BASE = import.meta.env.DEV ? "/api/es" : import.meta.env.VITE_ES_URL;
const BATCH_SIZE = 2000;
```

Le client est un `fetch` brut de 99 lignes vers `POST /{index}/_search`. **Aucun en-tête
d'authentification n'est envoyé** — le cluster n'en a pas (identique à
`xlsx-stats/datasources/els.js`, qui se connecte par un simple
`new Client({ node: process.env.ES_API })`).

En développement, le **proxy Vite `/api/es`** évite le CORS et garde l'IP interne hors du
navigateur. **En production, ce proxy n'a pas d'équivalent** : c'est le point de blocage
principal du passage en production (cf. [09 — Dette technique](09-dette-technique.md)).

### Pagination

`fetchAllHits(index, query, onProgress)` fait du **`search_after` sur `_id` décroissant**,
par lots de 2 000, jusqu'à obtenir un lot incomplet. Il n'y a **ni Point-in-Time, ni
`slice`** : la pagination est séquentielle, et une écriture concurrente pendant le parcours
peut théoriquement décaler le curseur.

Toutes les requêtes filtrent sur un unique terme :

```json
{ "term": { "congress_id.keyword": "<eventId>" } }
```

### Les cinq index

| Constante | Index | Granularité d'un document | Alimenté par |
|---|---|---|---|
| `audience` | `stats_user__onsite-audience-per-session-per-user` | 1 doc par (utilisateur, session) — **entrée de salle** | Flink `stats_room_scans.sql` ← Kafka `cyim.webhooks` |
| `checkin` | `stats_user__onsite_congress_checkin_per_user` | 1 doc par utilisateur — **portique d'entrée du site** | idem |
| `zone` | `stats_user__onsite_zone_checkin_per_user` | 1 doc par accès de zone (stand, lounge) | idem |
| `live` | `stats_user__live-view-duration-per-user-per-session` | 1 doc par (utilisateur, session) | Flink ← SI-views |
| `replay` | `stats_user__vod-view-per-user-per-session-per-origin` | 1 doc par (utilisateur, session, origine) | Flink ← SI-views |

> **Piège de nommage** : l'index `audience` utilise des **tirets**, `checkin` et `zone` des
> **underscores**. Ce n'est pas une coquille de la documentation, c'est l'état réel du
> cluster. Les noms sont codés en dur, sans alias versionné.

### Filtrage des comptes internes

`fetchLiveViews` et `fetchReplayViews` — et **elles seules** — excluent les testeurs CYIM :

```json
"must_not": [{ "wildcard": { "user_email.keyword": "*@cyim.com" } }]
```

Les trois index de scans **n'appliquent pas ce filtre**. Un scan effectué par un compte
interne compte donc dans les statistiques de présence sur site. À garder en tête lors des
comparaisons entre canaux.

### Champs Elasticsearch consommés

Les trois index de scans exposent des schémas différents pour la même information : la
normalisation (`utils/computeScanStats.js`) les ramène à un modèle unique.

| Champ normalisé | `audience` | `checkin` | `zone` |
|---|---|---|---|
| `delegateId` | `user_id` ∥ `user_identity_id` | `delegate_id` ∥ `delegate_identity_id` | `delegate_id` ∥ `delegate_identity_id` |
| `badgeType` | `badge_type` | `registration_type` | `registration_type` |
| `badgeId` | `badge_id` | `badge_id` | `badge_id` |
| identité | `user_fullName` ∥ `user_firstName` + `user_lastName`, `user_email` | idem | idem |
| session | `session_id`, `session_title`, `session_type`, `session_start` | — | — |
| lieu | `room_id`, `room_name` | — | `zone_id` (= `location.id`) |
| organisation | `industry_name` | — | — |
| autres | `direction`, `room_entry_approval`, `timestamp`, `raw_qr_code` | idem | idem |

Malgré la différence de nom (`user_id` vs `delegate_id`), **le contenu est identique** : le
job Flink écrit dans les trois cas
`badge.registrationByBadgeQRCode['delegate']['id']`, soit le `delegate.id` MongoDB. Aucune
traduction n'est nécessaire.

Pour les index live et replay, la normalisation est nettement plus défensive parce que le
mapping n'est pas stabilisé. L'horodatage est cherché dans **onze champs candidats** :

```
timestamp → @timestamp → view_timestamp → viewing_time → view_start → start_time
→ starttime → start → event_time → created_at → date  [→ session_start, live uniquement]
```

Même logique pour la durée (`view_duration` ∥ `duration` ∥ `live_duration` / `vod_duration`),
l'origine (`origin` ∥ `platform` ∥ `source` ∥ `device`) et la fin de session (six candidats).
Cette cascade de replis est une **dette assumée** : elle devrait disparaître au profit d'un
mapping typé côté Flink.

Champs spécifiques :

- **Live** : `channel_id`, `channel_name` (libellé de chaîne de diffusion, repli
  « Chaîne N » trié par volume).
- **Replay** : `media_id`, `presentation_id`, `presentation_title` (granularité VOD).

### Priorité du type de session

Le `sessionType` est toujours résolu dans cet ordre :

```
s.session_type  →  s.sessionType  →  session GraphQL .type
```

Le champ **Elasticsearch `session_type`** est prioritaire car il vient de `events.category`
côté SI-views — la même source que l'export `xlsx-stats`. Le `type` du nœud événement GraphQL
n'est que le discriminant générique (« SESSION »), trop large pour être exploitable ; il n'est
gardé qu'en dernier recours. **Cette priorité a déjà été inversée par erreur deux fois** (une
fois sur les indicateurs, une fois sur le filtre des exports) : ne pas y toucher.

---

## 2.3 Provenance amont — ce qui remplit les index

Les trois index de scans sont alimentés par **un seul job Flink** (`stats_room_scans.sql`)
consommant **un seul topic Kafka** (`cyim.webhooks`, produit par l'application mobile de scan).
Ce job résout le QR scanné en délégué via le resolver GraphQL
`event(id).registrationByBadgeQRCode(qrCode)`.

Cette résolution amont a une conséquence directe et importante sur les données :

| Index | Type de jointure Flink | Comportement quand la résolution échoue |
|---|---|---|
| `checkin`, `zone` | `LEFT JOIN` | la ligne est écrite avec `delegate_id = '-'` → **récupérable côté client** |
| `audience` | `INNER JOIN` | la ligne est **absente de l'index** → **définitivement perdue** |

C'est la raison d'être du mécanisme de **ré-association QR** décrit dans
[03 — Modèle de calcul](03-modele-calcul.md#34-ré-association-qr).

---

## 2.4 Table de traçabilité : indicateur → source

| Famille d'indicateurs | Source |
|---|---|
| Inscriptions, statuts, types, catégories, jours d'accès | GraphQL `searchDelegates` |
| Démographie, géographie, professions | GraphQL `searchDelegates` (`primaryAddress`, `occupation`…) |
| Check-in physique, badges délivrés | GraphQL `searchDelegates` (`checkedInDate`, `badges.deliveredAt`) |
| Onboarding, application mobile | GraphQL `searchDelegates` (`firstOnboardingConnection`, `contact.apps`) + `config.mobileApplicationId` |
| Audience en salle, entrée du site, accès aux zones | Elasticsearch (`audience`, `checkin`, `zone`) |
| Vues live, chaînes de diffusion | Elasticsearch (`live`) + sessions GraphQL |
| Vues replay / VOD | Elasticsearch (`replay`) + sessions GraphQL |
| Titres, types, horaires et organisateurs de session | GraphQL `children(SESSION)`, complété par les champs ES |
| Libellés de zones | GraphQL `location(id).name` |
| « Total participants » dédoublonné | **croisement** GraphQL × Elasticsearch (live + replay) |
