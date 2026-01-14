# Guide de Démarrage - Frontend Streamlit

## Option 1 : Avec Docker Compose (Recommandé)

### Démarrer tous les services
```bash
cd /home/noahrd0/Documents/IPSSI_TP_DATA_CRYPTO
docker compose up -d
```

### Vérifier que les services sont démarrés
```bash
docker compose ps
```

Vous devriez voir 3 services :
- `volcano_mongodb` (MongoDB)
- `volcano_backend` (Backend Node.js)
- `volcano_frontend` (Frontend Streamlit)

### Accéder au frontend
Ouvrez votre navigateur à : **http://localhost:8501**

### Voir les logs du frontend
```bash
docker compose logs -f frontend
```

### Redémarrer le frontend si nécessaire
```bash
docker compose restart frontend
```

## Option 2 : Sans Docker (Développement local)

### Prérequis
- Python 3.11+
- Backend et MongoDB doivent être accessibles

### Installation
```bash
cd /home/noahrd0/Documents/IPSSI_TP_DATA_CRYPTO/frontend
pip install -r requirements.txt
```

### Configuration
Créer un fichier `.env` ou définir la variable d'environnement :
```bash
export API_BASE_URL=http://localhost:3000
```

### Démarrer le frontend
```bash
streamlit run app.py
```

Le frontend sera accessible à : **http://localhost:8501**

## Dépannage

### Le frontend ne démarre pas
1. Vérifier que le backend est démarré :
   ```bash
   curl http://localhost:3000/health
   ```
   Devrait retourner : `{"status":"OK",...}`

2. Vérifier les logs :
   ```bash
   docker compose logs frontend
   ```

### Erreur de connexion au backend
- Vérifier que `API_BASE_URL` est correct
- En Docker : utiliser `http://backend:3000`
- En local : utiliser `http://localhost:3000`

### Aucun volcan affiché
1. Vérifier que les données sont initialisées :
   ```bash
   docker compose exec backend node scripts/seed.js
   ```

2. Vérifier que MongoDB contient des volcans :
   ```bash
   curl http://localhost:3000/api/volcans
   ```

## Commandes utiles

### Arrêter tous les services
```bash
docker compose down
```

### Reconstruire le frontend
```bash
docker compose build frontend
docker compose up -d frontend
```

### Voir tous les logs
```bash
docker compose logs -f
```
