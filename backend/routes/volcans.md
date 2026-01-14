# API Volcans - Documentation

## Endpoints disponibles

### GET /api/volcans
Liste tous les volcans enregistrés.

**Réponse :**
```json
[
  {
    "_id": "...",
    "nom": "Mont Saint Helens",
    "type": "stratovolcan",
    "veiMax": 5,
    "coordonnees": {
      "latitude": 46.1914,
      "longitude": -122.1956
    }
  }
]
```

### GET /api/volcans/:id
Récupère un volcan spécifique par son ID.

### POST /api/volcans
Crée un nouveau volcan.

**Corps de la requête :**
```json
{
  "nom": "Nom du volcan",
  "type": "stratovolcan",
  "veiMax": 5,
  "coordonnees": {
    "latitude": 46.1914,
    "longitude": -122.1956
  }
}
```

**Types de volcans valides :**
- `stratovolcan`
- `volcan bouclier`
- `caldeira`
- `cône de scories`
- `dôme de lave`
- `autre`

**VEI Max :** Nombre entre 0 et 8 (Volcanic Explosivity Index)

### POST /api/volcans/:id/init
Initialise les données sismiques pour un volcan en récupérant les données depuis USGS.

**Corps de la requête (optionnel) :**
```json
{
  "days": 30,
  "radiusKm": 100
}
```

**Paramètres :**
- `days` : Nombre de jours de données à récupérer (défaut: 30)
- `radiusKm` : Rayon de recherche en km autour du volcan (défaut: 100)

**Réponse :**
```json
{
  "success": true,
  "message": "Données initialisées pour Mont Saint Helens",
  "volcan": "Mont Saint Helens",
  "seismes": {
    "recus": 28,
    "sauvegardes": 28
  }
}
```

## Exemples d'utilisation

### Ajouter un nouveau volcan
```bash
curl -X POST http://localhost:3000/api/volcans \
  -H "Content-Type: application/json" \
  -d '{
    "nom": "Etna",
    "type": "stratovolcan",
    "veiMax": 5,
    "coordonnees": {
      "latitude": 37.7510,
      "longitude": 14.9934
    }
  }'
```

### Initialiser les données pour un volcan
```bash
# Récupérer l'ID du volcan depuis GET /api/volcans
curl -X POST http://localhost:3000/api/volcans/VOLCAN_ID/init \
  -H "Content-Type: application/json" \
  -d '{
    "days": 30,
    "radiusKm": 100
  }'
```
