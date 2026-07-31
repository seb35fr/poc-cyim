# Documentation technique — `statistics` (PoC)

Documentation technique de référence du **dashboard de statistiques congrès**, dans son
état **actuel** (PoC). Elle décrit ce qui *est*, pas ce qui *devrait être* : les choix
non conformes au standard CYIM sont documentés tels quels et tracés dans
[09 — Dette technique](09-dette-technique.md).

> **Version documentée** : branche `feature/md-export-enrichment` · `package.json` 0.1.0
> · ~23 000 lignes sur 74 fichiers `src/`
> **Dernière mise à jour** : 2026-07-31

---

## Les trois documents du repo — qui sert à quoi

| Document | Public | Contenu |
|---|---|---|
| [`../README.md`](../README.md) | utilisateur / nouvel arrivant | à quoi sert l'app, démarrage rapide, onglets, concepts |
| **`docs/` (ce dossier)** | développeur / architecte | référence technique : couches, sources, calculs, exploitation, dette |
| [`../CLAUDE.md`](../CLAUDE.md) | agents Claude Code | instructions et conventions pour modifier le code |

### Version HTML

Une **version HTML autonome** de cette documentation (sommaire latéral, thème clair/sombre,
imprimable) est disponible : **[`documentation-technique.html`](documentation-technique.html)**.

Elle est **générée** depuis les `.md` de ce dossier — qui restent la source de vérité :

```bash
node docs/build-html.mjs      # aucune dépendance npm
```

> Ne pas éditer le `.html` à la main : modifier les chapitres `.md` puis régénérer.
> Corollaire pour les titres : **pas d'emoji ni de guillemets typographiques dans un titre**,
> sinon l'ancre générée diverge de celle de l'aperçu Markdown GitHub.

Le **plan de migration vers la production** vit à part :
[`../perennisation/plan-migration.html`](../perennisation/plan-migration.html) (séquencement en lots)
et [`../perennisation-mapping.md`](../perennisation-mapping.md) (mapping vers `@platform/*` + chiffrage).

---

## Sommaire

| # | Chapitre | Répond à |
|---|---|---|
| 01 | [Architecture & runtime](01-architecture.md) | Comment l'app est structurée, ce qui s'exécute et dans quel ordre |
| 02 | [Sources de données](02-sources-donnees.md) | D'où vient chaque chiffre : opérations GraphQL, index Elasticsearch, champs consommés |
| 03 | [Modèle de calcul](03-modele-calcul.md) | Comment les statistiques sont calculées, les jointures et la ré-association QR |
| 04 | [État, filtres & rafraîchissement](04-etat-filtres.md) | Où vit l'état réactif, comment les filtres se propagent |
| 05 | [Interface](05-interface.md) | Navigation, onglets, graphiques, i18n, design tokens |
| 06 | [Exports](06-exports.md) | Les 7 familles d'exports, leurs formats et leurs règles |
| 07 | [Dictionnaire des indicateurs](07-dictionnaire-indicateurs.md) | Définition exacte, dénominateur et pièges de chaque KPI |
| 08 | [Exploitation](08-exploitation.md) | Configuration, build, déploiement, performances observées |
| 09 | [Dette technique](09-dette-technique.md) | Ce qui bloque la mise en production, classé par sévérité |

---

## Résumé en dix lignes

`statistics` est une **SPA Vue 3 autonome, en lecture seule**, qui produit un tableau de
bord de statistiques par congrès. Elle n'a **ni backend propre, ni base de données** : elle
agrège deux sources existantes — le **gateway Apollo GraphQL** (délégués, sessions, config
événement, noms de zones) et **5 index Elasticsearch** alimentés par Flink (scans sur site,
vues live, vues replay). **L'intégralité des statistiques est calculée dans le navigateur**
par des fonctions pures (`src/utils/compute*.js`), puis rendue par Chart.js.

Le PoC assume trois écarts majeurs au standard CYIM, tous liés à sa vocation de prototype :
**JavaScript** au lieu de TypeScript, **aucun framework UI** (`@platform/common-ui` absent,
CSS maison), et surtout un **accès Elasticsearch direct depuis le navigateur** avec un
**token Bearer stocké dans `.env`** — sans Keycloak ni Cerbos. Ces trois points sont le cœur
du chantier de pérennisation.
