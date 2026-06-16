# Phase 5 — Durcissement & bascule

> **Porte de validation : G1 + G3** (recette finale + RGPD + déploiement prod).
> **Risque : moyen**. Démarre après la Phase 4.

---

## 1. Objectif

Combler les écarts prod restants, valider la conformité, basculer les utilisateurs et
décommissionner le PoC.

## 2. Tâches

### 2.1 RGPD (Claude + validation humaine)
- Masquage des délégués sans flag `gdpr` (le micro `xlsx-stats` anonymisait en `***` ; le PoC
  a **perdu** ce comportement — à réintroduire).
- S'appuyer sur la jointure délégué déjà disponible + `delegate.gdpr`.

### 2.2 Performance (Claude + infra)
- Agrégations serveur pour gros congrès (suite Phase 2 : `size:0` + aggs, `_pit`/`slice`).
- Téléchargement exhaustif des scans = clic explicite, pas chargement systématique.
- Optionnel : refresh incrémental (ES PIT + `timestamp > last_seen`, ou SSE depuis backend).

### 2.3 Recette finale
- Bilingue FR/EN complet.
- Parité globale vs PoC sur ≥ 2 events (petit + gros).
- Exports (MD/JSON, CSV par session, parcours, industrie XLSX) vérifiés.

### 2.4 Bascule
- Mise en prod de `statistics-admin`.
- Communication utilisateurs.
- **Décommissionnement du PoC** (`statistics-reg`) une fois la prod validée.

## 3. Critère de sortie (portes G1 + G3)

- RGPD signée (masquage effectif).
- Recette finale validée (parité chiffrée G1).
- Prod déployée et stable ; PoC retiré.

## 4. Charge indicative

**4 – 8 j·h** (lot 5 du mapping §4).

---

## 5. Après la bascule

`stats-core` et `viewerJoin` deviennent des libs `@platform/*` réutilisables par d'autres
fronts CYIM. Aligner avec les « Axes d'évolution » du `CLAUDE.md` du PoC (metrics backend,
pagination parallèle, SSE) restées pertinentes.
