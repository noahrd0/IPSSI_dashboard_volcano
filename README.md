# Tableau de bord du risque volcanique (USGS + MongoDB + Node.js + Streamlit) --- Dockerisé

Ce projet propose un tableau de bord simple qui permet de :

-   Sélectionner un volcan par son nom (liste mondiale via l'API USGS
    VSC `volcanoesGVP`)
-   Choisir une période d'analyse (jusqu'à 5 ans)
-   Récupérer et mettre en cache les séismes autour du volcan (USGS
    Earthquake Catalog / FDSN Event)
-   Afficher des indicateurs compréhensibles avec des infobulles
    explicatives
-   Afficher une pastille de couleur indiquant un **risque estimé
    d'éruption majeure** (heuristique), ainsi qu'un niveau de confiance
-   **Consulter une carte des volcans actifs en temps quasi réel via la
    page 2 du tableau de bord**

------------------------------------------------------------------------

## Pages du tableau de bord

### 🟢 Page 1 --- Analyse d'un volcan

Permet de : - rechercher un volcan par nom, - sélectionner une période
d'étude, - afficher les indicateurs sismiques, - consulter le statut
officiel USGS (si disponible), - visualiser la pastille de risque et le
niveau de confiance.

### 🗺️ Page 2 --- Carte des volcans actifs (temps quasi réel)

Permet de : - afficher une carte mondiale des volcans actuellement
actifs ou sous surveillance, - visualiser rapidement les zones de
vigilance volcanique, - s'appuyer sur les données USGS HANS et VHP mises
à jour régulièrement.

> ⚠️ La carte est dite "temps réel" au sens opérationnel : les données
> sont rafraîchies automatiquement à intervalles courts, mais restent
> dépendantes des délais de publication des agences USGS.

------------------------------------------------------------------------

## Sources de données

-   **USGS Earthquake Catalog (FDSN Event)**\
    https://earthquake.usgs.gov/fdsnws/event/1/

-   **USGS VSC Volcano API (liste des volcans + statut VHP)**\
    https://volcanoes.usgs.gov/vsc/api/volcanoApi/

-   **USGS HANS Public API (volcans sous surveillance / alertes)**\
    https://volcanoes.usgs.gov/hans-public/api/

> ⚠️ Remarques : - La pastille de "risque" est une **heuristique pour la
> visualisation**, ce n'est **pas une prévision**. - La couverture des
> données varie selon les volcans et les régions ; le tableau de bord
> affiche donc un **niveau de confiance**.

------------------------------------------------------------------------

## Démarrage rapide

``` bash
docker compose up --build
```

Puis ouvrir :

-   Interface Streamlit : http://localhost:8501\
-   API backend : http://localhost:3000 (santé : `/health`)

------------------------------------------------------------------------

## Variables d'environnement

Voir `docker-compose.yml`. Tu peux modifier les valeurs par défaut :

-   `DEFAULT_RADIUS_KM` (par défaut : 25)
-   `DEFAULT_MIN_MAG` (par défaut : 0.0)

------------------------------------------------------------------------

## Structure du projet

-   `backend/` --- API Node.js + mise en cache MongoDB
-   `frontend/` --- application Streamlit (2 pages)
-   `docker-compose.yml` --- orchestration des services

------------------------------------------------------------------------

## Endpoints de l'API (backend)

-   `GET /health`

-   `GET /volcanoes/search?q=<nom>`\
    → Recherche de volcans (données mises en cache ; synchronisation
    auto depuis l'USGS VSC si la base est vide)

-   `GET /volcanoes/:vnum/status`\
    → Statut VHP (USGS VSC) + info HANS si disponible

-   `GET /volcanoes/:vnum/earthquakes?start=YYYY-MM-DD&end=YYYY-MM-DD&radius_km=25&minmag=0`\
    → Séismes autour du volcan sur la période donnée

-   `GET /volcanoes/:vnum/indicators?start=...&end=...`\
    → Indicateurs calculés + pastille de risque

------------------------------------------------------------------------

## Développement (sans Docker)

-   MongoDB :\
    `mongodb://localhost:27017/volcano_dashboard`

-   Backend :

    ``` bash
    cd backend
    npm install
    npm run dev
    ```

-   Frontend :

    ``` bash
    cd frontend
    pip install -r requirements.txt
    streamlit run app.py
    ```
