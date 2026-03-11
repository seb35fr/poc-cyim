# Statistics Registration — POC

Dashboard de statistiques pour les organisateurs de congrès. Application standalone qui se connecte au gateway GraphQL existant sans modifier la codebase de production.

## Stack

- Vue 3 + Vite 6 + Vue Router
- Chart.js 4 + vue-chartjs (Doughnut, Bar, Line, Stacked, Choropleth)
- chartjs-chart-geo (carte du monde)
- html2pdf.js (export PDF client-side)

## Installation

```bash
npm install
```

## Configuration

Copier `.env.example` en `.env` et renseigner :

```env
VITE_GRAPHQL_URL=https://your-gateway-url/graphql
VITE_AUTH_TOKEN=your-bearer-token
```

- `VITE_GRAPHQL_URL` : URL du gateway Apollo GraphQL
- `VITE_AUTH_TOKEN` : Token Bearer d'authentification (récupéré depuis l'interface registration-admin)

## Lancement

```bash
npm run dev
```

Ouvrir `http://localhost:5174/{eventId}` en remplaçant `{eventId}` par l'identifiant de l'événement.

## Build

```bash
npm run build
npm run preview
```

## Architecture

```
src/
├── api/
│   └── graphql.js            # Couche fetch GraphQL (pagination curseur)
├── composables/
│   ├── useStatistics.js      # Chargement des données + calcul des stats
│   └── useExportPdf.js       # Export PDF via html2pdf.js
├── utils/
│   ├── computeStats.js       # Calcul client-side de toutes les statistiques
│   └── countries.js           # Mapping pays / continents / drapeaux
├── components/
│   ├── charts/
│   │   ├── DoughnutChart.vue
│   │   ├── HBarChart.vue
│   │   ├── LineChart.vue
│   │   ├── StackedBarChart.vue
│   │   └── ChoroplethMap.vue  # Carte choropleth (chartjs-chart-geo)
│   └── tabs/
│       ├── OverviewTab.vue    # KPIs, statuts, types, onboarding, timeline
│       ├── DemographicsTab.vue # Carte, pays, genre, professions
│       ├── RegistrationsTab.vue # Types, catégories, jours d'accès
│       ├── TemporalTab.vue    # Courbes, analyse hebdomadaire
│       └── DayOfTab.vue       # Check-in, badges, RGPD
├── views/
│   └── StatisticsView.vue     # Layout principal avec navigation par onglets
├── App.vue
└── main.js
```

## Fonctionnement

L'application récupère **tous les délégués** d'un événement via l'endpoint `searchDelegates` (pagination curseur, 500 par page) puis calcule l'ensemble des statistiques côté client. Aucune modification du backend n'est nécessaire.

### 5 onglets

| Onglet | Contenu |
|--------|---------|
| Vue d'ensemble | KPIs globaux, statuts, types d'inscription, onboarding, courbe temporelle |
| Démographie | Carte du monde, top pays, continents, genre, professions, entreprises |
| Inscriptions | Types détaillés, catégories, jours d'accès, multi-inscriptions |
| Dynamique | Courbe cumulée avec sélecteur de période, analyse hebdomadaire, jour de la semaine |
| Jour J | Progression check-in, flux horaire, RGPD, comptes onboarding |

## Limitations

- **Pas de temps réel** : les données sont chargées au montage, bouton refresh pour actualiser
- **Performance** : le chargement peut prendre quelques secondes pour les événements avec beaucoup de délégués (pagination séquentielle)
- **Badges** : les compteurs de badges livrés/non livrés ne sont pas disponibles (non implémentés côté backend)
- **Données uniquement du service Registration** : pas de croisement avec d'autres microservices
