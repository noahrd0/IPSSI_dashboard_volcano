# Système de Monitoring Volcanique en Temps Réel

Application de monitoring volcanique avec backend Node.js, base de données MongoDB, et interface Streamlit, entièrement conteneurisée avec Docker.

## Architecture

- **Backend** : Node.js avec Express, WebSocket et Mongoose
- **Base de données** : MongoDB
- **Frontend** : Streamlit
- **Conteneurisation** : Docker Compose
- **APIs externes** :
  - **USGS Volcano API** : Récupération automatique de tous les volcans surveillés
  - **USGS Earthquake API** : Données sismiques (séismes)

## Structure du Dashboard

### Bandeau supérieur
- Nom du volcan
- NTVC (Niveau d'alerte volcanique) avec jauge
- État actuel (activité de fond / agitation accrue / phase pré-éruptive possible)

### Bloc 1 — Sismicité
- Séismes par heure (live)
- Magnitude maximale (24h)
- Profondeur moyenne
- Graphique d'évolution

### Bloc 2 — Thermique
- Données thermiques (si disponibles)
- Tendance thermique
- Graphique d'évolution

### Bloc 3 — Contexte de risque
- VEI max historique
- Type de volcan
- Message automatique contextuel

## Installation et Démarrage

### Prérequis
- Docker
- Docker Compose

### Démarrage

```bash
# Cloner le projet
cd IPSSI_TP_DATA_CRYPTO

# Démarrer tous les services
docker compose up -d

# Initialiser les données (récupère automatiquement tous les volcans surveillés depuis USGS)
docker compose exec backend node scripts/seed.js

# Options disponibles:
# --force : Force la récupération même si des volcans existent déjà
# --clean-data : Nettoie uniquement les données (séismes, états) sans toucher aux volcans

# Ajouter un nouveau volcan
docker compose exec backend node scripts/addVolcan.js "Nom du volcan" "type" veiMax latitude longitude
# Exemple: docker compose exec backend node scripts/addVolcan.js "Etna" "stratovolcan" 5 37.7510 14.9934

# Voir les logs
docker compose logs -f

# Arrêter les services
docker compose down
```

### Accès aux services

- **Frontend Streamlit** : http://localhost:8501
- **Backend API** : http://localhost:3000
- **MongoDB** : localhost:27017

## API Endpoints

### Volcans
- `GET /api/volcans` - Liste tous les volcans
- `GET /api/volcans/:id` - Récupère un volcan par ID
- `POST /api/volcans` - Crée un nouveau volcan
- `POST /api/volcans/:id/init` - Initialise les données sismiques pour un volcan (récupère depuis USGS)

### Séismes
- `GET /api/seismes/volcan/:volcanId` - Récupère les séismes d'un volcan
- `GET /api/seismes/volcan/:volcanId/stats` - Statistiques sismiques
- `GET /api/seismes/volcan/:volcanId/live` - Séismes par heure (live)
- `POST /api/seismes` - Crée un nouveau séisme

### Thermique
- `GET /api/thermique/volcan/:volcanId` - Récupère les données thermiques
- `GET /api/thermique/volcan/:volcanId/stats` - Statistiques thermiques
- `POST /api/thermique` - Crée une nouvelle donnée thermique

### États
- `GET /api/etats/volcan/:volcanId` - Récupère l'état actuel
- `GET /api/etats/volcan/:volcanId/complet` - État complet avec message
- `POST /api/etats/volcan/:volcanId/calculer` - Calcule et met à jour l'état
- `POST /api/etats` - Crée un nouvel état

### Synchronisation
- `POST /api/sync/all` - Synchronise toutes les données pour tous les volcans
- `POST /api/sync/volcan/:volcanId` - Synchronise les données pour un volcan spécifique

### WebSocket
- `WS /ws/volcan/:volcanId` - Connexion WebSocket pour mises à jour temps réel

## Synchronisation des Données

### Synchronisation manuelle

```bash
# Via l'API
curl -X POST http://localhost:3000/api/sync/all

# Pour un volcan spécifique
curl -X POST http://localhost:3000/api/sync/volcan/VOLCAN_ID
```

### Synchronisation automatique

Un service de synchronisation périodique est disponible :

```bash
# Démarrer le planificateur de synchronisation
docker compose exec backend node scripts/syncScheduler.js
```

Le planificateur synchronise automatiquement les données toutes les heures (configurable via `SYNC_INTERVAL`).

## Sources de Données

### USGS Volcano API
- **API** : https://volcanoes.usgs.gov/hans-public/api/volcano/
- **Endpoints utilisés** :
  - `getMonitoredVolcanoes` : Récupère tous les volcans surveillés par l'USGS
  - `getUSVolcanoes` : Récupère tous les volcans US (fallback)
- **Données récupérées** : Nom, coordonnées, type, VEI max, élévation, région
- **Authentification** : Aucune requise (API publique)

### USGS Earthquake API
- **API** : https://earthquake.usgs.gov/fdsnws/event/1
- **Données** : Séismes avec magnitude, profondeur, localisation
- **Période** : 30 derniers jours par défaut
- **Rayon** : 100 km autour du volcan
- **Authentification** : Aucune requise (API publique)

## Calcul du NTVC

Le NTVC (Niveau d'alerte volcanique) est calculé automatiquement basé sur les données sismiques USGS :
- **Score basé sur la magnitude maximale (0-50)** :
  - Magnitude ≥ 4.5 : +50 points
  - Magnitude ≥ 3.5 : +35 points
  - Magnitude ≥ 2.5 : +20 points
  - Magnitude ≥ 1.5 : +10 points
- **Score basé sur la fréquence (0-50)** :
  - ≥ 10 séismes/heure : +50 points
  - ≥ 5 séismes/heure : +30 points
  - ≥ 2 séismes/heure : +15 points
  - ≥ 1 séisme/heure : +5 points

Le score total (0-100) détermine l'état :
- 0-39 : Activité de fond
- 40-69 : Agitation accrue
- 70-100 : Phase pré-éruptive possible

## Développement

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
pip install -r requirements.txt
streamlit run app.py
```

## Structure des Données

### Collection `volcans`
- nom, type, veiMax, coordonnees

### Collection `seismes`
- volcan_id, timestamp, magnitude, profondeur

### Collection `thermique`
- volcan_id, timestamp, anomalies, temperature

### Collection `etats`
- volcan_id, timestamp, etat, ntvc
