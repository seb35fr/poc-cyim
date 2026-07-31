# Phase 2 — Backend : resolver `scanStatistics`

> **Porte de validation : G3** (backend / infra / déploiement — humain avec les accès).
> **Risque : élevé** (chemin critique). **Parallélisable** avec la Phase 1.

---

## 1. Objectif

Remplacer la **lecture Elasticsearch directe depuis le navigateur** (3 index, proxy `/api/es`,
token bearer en clair) par un **resolver GraphQL fédéré authentifié**. C'est le prérequis
non négociable de toute mise en prod (cf. mapping §5).

## 2. Problème actuel (PoC)

- `api/elasticsearch.js` interroge ES en direct : aucune auth, aucune whitelist d'index, aucun
  rate-limit ; token dans `.env`.
- Tout est chargé en RAM navigateur → intenable sur un gros congrès (> 100 k scans).
- Le proxy `/api/es` est un artefact **dev** sans équivalent prod.

## 3. Cible

- **Resolver** : `scanStatistics(eventId: ID!, filters: { dateRange, badgeTypes }): ScanStatistics`.
- **Retour** :
  - **agrégations serveur** (`size: 0` + `terms`, `date_histogram`, `cardinality`) couvrant les
    KPI du PoC (vues en salle, top sessions/salles/zones, par jour/heure/sens/type de badge) ;
  - **échantillon de scans bruts** paginé (pour la table détail + la ré-association QR côté `stats-core`).
- **Auth** : directive Cerbos, action `event:scan:stats:read` (à confirmer avec les policies).
- **Hôte** : **nouveau micro `stats`** — *décision arrêtée*. Aucune greffe sur un
  microservice existant (ni `registration-badges`, ni `xlsx-stats`).
- **Index source** (à aliaser proprement, cf. mapping) :
  `stats_user__onsite-audience-per-session-per-user`, `*onsite_congress_checkin_per_user`,
  `*onsite_zone_checkin_per_user`.

## 4. Tâches

- **Claude** : implémente le schéma fédéré + resolver + aggs ES, suit les patterns
  `registration-badges` — **patterns repris, service non modifié** (datasources per-request, DataLoader, directive Cerbos).
- **Humain (G3)** : review sécurité + policies Cerbos, fournit accès infra ES/Mongo, intègre,
  déploie en staging, teste contre données réelles.

## 5. Critère de sortie (porte G3)

- Resolver authentifié déployé en staging.
- **Parité** : les agrégations renvoyées reproduisent les chiffres que le PoC calculait à
  partir des lectures ES directes (sur un event de référence).
- Proxy `/api/es` et token en clair **supprimés** du chemin prod.

## 6. Articulation avec les autres phases

- La **ré-association QR** reste côté client dans `stats-core` (elle s'appuie sur les badges
  déjà chargés via GraphQL — pas d'appel réseau supplémentaire). Le resolver fournit
  l'échantillon de scans bruts ; `stats-core` rattache/enrichit.
- La Phase 4 (UI) branchera les onglets sur ce resolver via `@platform/graphql-core`.

## 7. Charge indicative

**5 – 15 j·h** (lot 0 du mapping §4) selon la complexité des agrégations et l'hôte retenu.
