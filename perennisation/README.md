# Pérennisation `statistics-reg` — dossier d'exécution

Ce dossier décompose la pérennisation du PoC dashboard statistiques en **phases, une par
fichier**. Le cadrage global, le mapping PoC → `@platform/*` et le chiffrage vivent dans
[`../perennisation-mapping.md`](../perennisation-mapping.md) (section 8 = plan supervisé).

## Principe de supervision

Claude Code produit le volume de code ; un humain tient **3 portes de validation** :

- **G1 — Exactitude des stats** : sorties identiques au PoC (oracle de non-régression).
- **G2 — Décisions structurantes** : accès libs privées, arbitrages, UX.
- **G3 — Backend / infra / déploiement** : resolver, Cerbos, registry, CI/CD, prod.

> **Règle d'or** : aucune phase n'avance tant que sa porte n'est pas franchie.

## Phases

| # | Doc | Objectif | Porte | Risque |
|---|---|---|---|---|
| 0 | [phase-0-cadrage.md](phase-0-cadrage.md) | Périmètre `stats-core`, spec resolver, plan de tests | G2 | — |
| 1 | [phase-1-stats-core.md](phase-1-stats-core.md) | Extraire l'IP métier (TS + tests) — **proof-of-value** | G1 | Très faible |
| 2 | [phase-2-backend-resolver.md](phase-2-backend-resolver.md) | Resolver GraphQL `scanStatistics` + Cerbos | G3 | Élevé |
| 3 | [phase-3-scaffolding.md](phase-3-scaffolding.md) | Shell app `statistics-admin` (Quasar/auth/theming) | G2 | Faible |
| 4 | [phase-4-ui-rewrite.md](phase-4-ui-rewrite.md) | Réécriture UI sur `common-ui`, onglet par onglet | G1+G2 | Moyen |
| 5 | [phase-5-durcissement.md](phase-5-durcissement.md) | RGPD, perf, recette, bascule | G1+G3 | Moyen |

**État** : Phase 0 en cours. Phases 1 et 2 parallélisables après le cadrage.
