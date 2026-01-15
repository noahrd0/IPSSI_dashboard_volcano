import os
import requests
import streamlit as st
import folium
from streamlit_folium import st_folium

BACKEND = os.getenv("BACKEND_BASE_URL", "http://localhost:3000")

st.set_page_config(page_title="Carte des risques", layout="wide")
st.title("🗺️ Carte des volcans (risques)")
st.caption("Affichage des volcans + périmètre autour. Couleur selon la pastille de risque.")

def api_get(path: str, params=None, timeout: int = 120):
    url = f"{BACKEND}{path}"
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()

# ----------------------------
# Sidebar
# ----------------------------
with st.sidebar:
    st.header("Paramètres")

    days = st.slider("Fenêtre d'analyse (jours)", 1, 365, 30, 1)
    radius_km = st.slider("Rayon autour (km)", 5, 200, 25, 5)
    minmag = st.slider("Magnitude minimale", -1.0, 5.0, 0.0, 0.1)

    limit = st.slider("Nb de volcans", 50, 1000, 300, 50)
    concurrency = st.slider("Concurrence (backend)", 1, 20, 6, 1)

    st.subheader("Filtre (optionnel)")
    only_high = st.checkbox("Afficher seulement orange/rouge", value=False)

@st.cache_data(ttl=120)
def get_risk_map(days, radius_km, minmag, limit, concurrency):
    return api_get(
        "/risk-map",
        params={
            "days": days,
            "radius_km": radius_km,
            "minmag": minmag,
            "limit": limit,
            "page": 1,
            "concurrency": concurrency,
        },
    )

# ----------------------------
# Data
# ----------------------------
try:
    payload = get_risk_map(days, radius_km, minmag, limit, concurrency)
except Exception as e:
    st.error(f"Erreur API /risk-map : {e}")
    st.stop()

rows = (payload or {}).get("results", []) or []
received = len(rows)

if received == 0:
    st.warning("Aucun volcan retourné par /risk-map.")
    st.stop()

if only_high:
    rows = [r for r in rows if (r.get("color") in ("orange", "red"))]

shown = len(rows)

st.info(f"Volcans reçus du backend: **{received}** — affichés: **{shown}**")

if shown == 0:
    st.warning("Aucun volcan après filtre. Décoche le filtre ou change les paramètres.")
    st.stop()

# ----------------------------
# Map center
# ----------------------------
lat0 = sum(r["lat"] for r in rows) / len(rows)
lon0 = sum(r["lon"] for r in rows) / len(rows)

m = folium.Map(location=[lat0, lon0], zoom_start=2, control_scale=True)

def folium_color(c: str) -> str:
    c = (c or "green").lower()
    if c == "red":
        return "red"
    if c == "orange":
        return "orange"
    # folium gère parfois mal "yellow" => on met bleu clair/gris
    if c == "yellow":
        return "lightgray"
    return "green"

# ----------------------------
# Layers
# ----------------------------
for r in rows:
    lat = float(r["lat"])
    lon = float(r["lon"])
    name = r.get("vName", "Volcan")
    vnum = r.get("vnum", "")
    color = folium_color(r.get("color"))
    score = r.get("score")

    # cercle périmètre
    folium.Circle(
        location=(lat, lon),
        radius=float(radius_km) * 1000.0,
        color="#666666",
        weight=1,
        fill=True,
        fill_opacity=0.06,
    ).add_to(m)

    # marker simple
    folium.CircleMarker(
        location=(lat, lon),
        radius=5,
        color=None,
        fill=True,
        fill_opacity=0.95,
        fill_color=color,
        tooltip=f"{name} (GVP {vnum}) — {r.get('color')} — score {score}",
    ).add_to(m)

st.subheader("Carte")
st_folium(m, width=None, height=700)
