# Volcano Risk Dashboard (USGS + MongoDB + Node.js + Streamlit) — Dockerized

This project builds a simple dashboard where you can:
- Select a volcano by name (worldwide list via USGS VSC `volcanoesGVP`)
- Choose a time window (up to 5 years)
- Fetch and cache earthquake events around the volcano (USGS Earthquake Catalog / FDSN Event)
- Display beginner-friendly indicators with hover explanations
- Show a color badge for estimated "major eruption risk" (heuristic), and a confidence label

## Data sources
- USGS Earthquake Catalog (FDSN Event): https://earthquake.usgs.gov/fdsnws/event/1/  (GeoJSON output supported) 
- USGS VSC Volcano API (volcano list + VHP status): https://volcanoes.usgs.gov/vsc/api/volcanoApi/
- USGS HANS Public API (elevated/monitored volcanoes + notices): https://volcanoes.usgs.gov/hans-public/api/

> Notes:
> - The "risk" badge is a heuristic for dashboarding, not a forecast.
> - Coverage varies by volcano/region; the dashboard reports a confidence level.

## Quick start
```bash
docker compose up --build
```

Then open:
- Streamlit UI: http://localhost:8501
- Backend API: http://localhost:3000 (health: `/health`)

## Environment variables
See `docker-compose.yml`. You can tweak defaults:
- `DEFAULT_RADIUS_KM` (default 25)
- `DEFAULT_MIN_MAG` (default 0.0)

## Project layout
- `backend/` Node.js API + MongoDB caching
- `frontend/` Streamlit app
- `docker-compose.yml` orchestration

## API endpoints (backend)
- `GET /health`
- `GET /volcanoes/search?q=<name>` — search volcanoes (cached; auto-sync from USGS VSC if empty)
- `GET /volcanoes/:vnum/status` — VHP status (USGS VSC) + HANS elevated info if available
- `GET /volcanoes/:vnum/earthquakes?start=YYYY-MM-DD&end=YYYY-MM-DD&radius_km=25&minmag=0`
- `GET /volcanoes/:vnum/indicators?start=...&end=...` — derived metrics + risk badge

## Development (without Docker)
- MongoDB: `mongodb://localhost:27017/volcano_dashboard`
- Backend: `cd backend && npm i && npm run dev`
- Frontend: `cd frontend && pip install -r requirements.txt && streamlit run app.py`

