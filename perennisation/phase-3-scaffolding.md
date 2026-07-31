# Phase 3 — Scaffolding de l'app `statistics` (v1)

> **Porte de validation : G2** (conformité au modèle + accès Keycloak).
> **Risque : faible**. **Parallélisable** avec la Phase 2.

---

## 1. Objectif

Générer le **shell** d'une vraie application plateforme `statistics` (v1), conforme au
monorepo `@platform`, prête à accueillir l'UI (Phase 4). Aucune logique métier ici — juste
l'ossature standard.

## 2. Prérequis

- Décision *reconstruire* actée (Phase 0, G2).
- Accès registry npm privé `@platform/*` + repo modèle `communication-admin`.
- Client Keycloak / config-module disponibles pour le tenant.

## 3. Tâches (Claude, via skill `tech_front_app_init`)

Génère, modelé sur `communication-admin` :
- **Config** : Vite 8 + `@quasar/vite-plugin`, Vitest 4, eslint/prettier/tsconfig
  (`@platform/front-configs`), Docker, nginx, GitLab CI, `.env`.
- **Shell** : `main.ts` (mount + `app.use(CommonUI)` + `registerI18n`), `App.vue`,
  router (enums name/path + guard de bootstrap), stores Pinia (auth / `config-module` / global),
  i18n, config Quasar, `initApp`.
- **Bootstrap tenant** : `config-module` (résolution config par URL), **Keycloak auth**,
  theming via `theme-core` + `useQuasarOption().initQuasar(palette)`.
- **Libs câblées** : `common-ui`, `graphql-core`, `filter-ui`, `vue-logger` (et le reste selon besoin).

## 4. Livrable

App vide **buildable et déployable** qui s'authentifie (Keycloak), affiche le shell (header,
navigation drawer), charge sa config tenant et son thème.

## 5. Critère de sortie (porte G2)

- App conforme au modèle `communication-admin` (review lead front).
- Authentification Keycloak fonctionnelle en staging.
- CI verte, image Docker publiée.

## 6. Charge indicative

**3 – 5 j·h** (lot 1 du mapping §4), largement généré par la skill.
