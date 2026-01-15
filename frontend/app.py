# app.py
import os
import datetime as dt
import html
import requests
import pandas as pd
import altair as alt
import streamlit as st

BACKEND = os.getenv("BACKEND_BASE_URL", "http://localhost:3000")

# ----------------------------
# Query params (depuis la carte)
# ----------------------------
qp = st.query_params
qp_q = (qp.get("q") or "").strip()
qp_vnum = (qp.get("vnum") or "").strip()

def _to_float(x, default):
    try:
        return float(x)
    except:
        return default

def _to_date(x):
    try:
        return dt.date.fromisoformat(str(x))
    except:
        return None

qp_radius = _to_float(qp.get("radius_km"), None)
qp_minmag = _to_float(qp.get("minmag"), None)
qp_start_d = _to_date(qp.get("start"))
qp_end_d = _to_date(qp.get("end"))

# ----------------------------
# Page config
# ----------------------------
st.set_page_config(page_title="Volcano Risk Dashboard", layout="wide")

st.title("🌋 Volcano Risk Dashboard")
st.caption(
    "Données: USGS Earthquake Catalog + USGS Volcano APIs. "
    "La pastille de risque est un indicateur heuristique (pas une prévision)."
)

# ----------------------------
# Helpers
# ----------------------------
def api_get(path: str, params=None, timeout: int = 30):
    url = f"{BACKEND}{path}"
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


@st.cache_data(ttl=300)
def search_volcanoes(q: str):
    return api_get("/volcanoes/search", params={"q": q})


@st.cache_data(ttl=120)
def get_indicators(vnum: str, start: str, end: str, radius_km: float, minmag: float):
    return api_get(
        f"/volcanoes/{vnum}/indicators",
        params={"start": start, "end": end, "radius_km": radius_km, "minmag": minmag},
    )


@st.cache_data(ttl=120)
def get_earthquakes(vnum: str, start: str, end: str, radius_km: float, minmag: float):
    return api_get(
        f"/volcanoes/{vnum}/earthquakes",
        params={"start": start, "end": end, "radius_km": radius_km, "minmag": minmag},
    )


def badge(color: str) -> str:
    color = (color or "green").lower()
    return {"green": "🟢", "yellow": "🟡", "orange": "🟠", "red": "🔴"}.get(color, "⚪")


def tooltip_span(label: str, tip: str) -> str:
    safe_tip = html.escape(tip or "", quote=True)
    safe_label = html.escape(label or "", quote=False)
    return f'<span title="{safe_tip}">{safe_label}</span>'


# ----------------------------
# Sidebar
# ----------------------------
with st.sidebar:
    st.header("Paramètres")

    q = st.text_input("Nom du volcan", value=(qp_q or "Etna"))

    radius_default = int(qp_radius) if qp_radius is not None else 25
    radius_km = st.slider("Rayon (km)", min_value=5, max_value=200, value=radius_default, step=5)

    minmag_default = qp_minmag if qp_minmag is not None else 0.0
    minmag = st.slider("Magnitude minimale", min_value=-1.0, max_value=5.0, value=float(minmag_default), step=0.1)

    today = dt.date.today()
    max_years = 5
    default_start = today - dt.timedelta(days=365)
    min_start = today - dt.timedelta(days=365 * max_years)

    if qp_start_d and qp_end_d:
        date_default = (max(qp_start_d, min_start), min(qp_end_d, today))
    else:
        date_default = (default_start, today)

    date_range = st.date_input(
        "Période (jusqu'à 5 ans)",
        value=date_default,
        min_value=min_start,
        max_value=today,
    )

# ----------------------------
# Search volcanoes
# ----------------------------
if not q.strip():
    st.info("Entrez un nom de volcan dans le panneau de gauche.")
    st.stop()

try:
    results = search_volcanoes(q.strip())
except Exception as e:
    st.error(f"Erreur recherche volcan: {e}")
    st.stop()

choices = []
for v in (results or {}).get("results", []) or []:
    name = v.get("vName", "—")
    vnum = v.get("vnum")
    if vnum:
        choices.append((f"{name} (GVP {vnum})", str(vnum)))

if not choices:
    st.warning("Aucun volcan trouvé. Essayez un autre nom.")
    st.stop()

label_to_vnum = {lbl: vnum for lbl, vnum in choices}
options = [c[0] for c in choices]

# index auto si vnum fourni
index = 0
if qp_vnum:
    for i, (lbl, vnum) in enumerate(choices):
        if str(vnum) == str(qp_vnum):
            index = i
            break

selected_label = st.selectbox("Volcan", options=options, index=index)
selected_vnum = label_to_vnum[selected_label]

# ----------------------------
# Dates
# ----------------------------
if not isinstance(date_range, (tuple, list)) or len(date_range) != 2:
    st.warning("Sélectionnez une plage de dates.")
    st.stop()

start_date, end_date = date_range
if start_date > end_date:
    st.warning("La date de début doit être antérieure à la date de fin.")
    st.stop()

start = start_date.isoformat()
end = end_date.isoformat()

# ----------------------------
# Fetch indicators + events
# ----------------------------
try:
    indicators = get_indicators(selected_vnum, start, end, radius_km, minmag)
    eq = get_earthquakes(selected_vnum, start, end, radius_km, minmag)
except Exception as e:
    st.error(f"Erreur API: {e}")
    st.stop()

vinfo = indicators.get("volcano") or {}
risk = indicators.get("risk_badge") or {}
tooltips = indicators.get("tooltips", {}) or {}
conf = indicators.get("confidence", "—")

vname = vinfo.get("vName", "Volcan")
vnum = vinfo.get("vnum", selected_vnum)

st.subheader(f"{vname} — GVP {vnum}")

colA, colB, colC, colD = st.columns([1.2, 1, 1, 1])

with colA:
    risk_color = (risk.get("color") or "green").lower()
    score = risk.get("score_0_100", "—")
    details_tip = tooltips.get("risk_badge", "")

    st.markdown(
        "\n".join(
            [
                f"**Pastille risque:** {badge(risk_color)}",
                f"Score: **{score} / 100**",
                f"Confiance: **{conf}**",
                f"<small>{tooltip_span('ℹ️ Détails', details_tip)}</small>",
            ]
        ),
        unsafe_allow_html=True,
    )

ind = indicators.get("indicators") or {}

with colB:
    st.markdown(f"### {ind.get('n_total', '—')}")
    st.markdown(tooltip_span("Séismes (total)", tooltips.get("n_total", "")), unsafe_allow_html=True)

with colC:
    st.markdown(f"### {ind.get('n7', '—')}")
    st.markdown(tooltip_span("Séismes (7j)", tooltips.get("n7", "")), unsafe_allow_html=True)

with colD:
    mmax = ind.get("mmax", None)
    st.markdown(f"### {'—' if mmax is None else mmax}")
    st.markdown(tooltip_span("Magnitude max", tooltips.get("mmax", "")), unsafe_allow_html=True)

# Official status if present
official = indicators.get("official_status")
if official:
    st.success(
        "Statut officiel USGS (si disponible): "
        f"{official.get('colorCode')} / {official.get('alertLevel')}"
    )
else:
    st.info(
        "Pas de statut officiel USGS pour ce volcan (ou non disponible). "
        "La pastille risque repose surtout sur la sismicité."
    )

# ----------------------------
# DataFrame & Charts
# ----------------------------
events = (eq or {}).get("events", []) or []
if not events:
    st.warning("Aucun événement sismique trouvé sur la période sélectionnée avec ces paramètres.")
    st.stop()

df = pd.DataFrame(
    [
        {
            "time": pd.to_datetime(e.get("time"), errors="coerce"),
            "mag": e.get("mag"),
            "depthKm": e.get("depthKm"),
            "place": e.get("place"),
        }
        for e in events
    ]
).dropna(subset=["time"]).sort_values("time")

df["date"] = df["time"].dt.floor("D")
counts = df.groupby("date").size().reset_index(name="count")

st.divider()
c1, c2 = st.columns(2)

with c1:
    st.markdown("### Sismicité (nombre d'événements / jour)")
    chart1 = (
        alt.Chart(counts)
        .mark_line()
        .encode(
            x=alt.X("date:T", title="Date"),
            y=alt.Y("count:Q", title="Nombre d'événements"),
            tooltip=[alt.Tooltip("date:T", title="Date"), alt.Tooltip("count:Q", title="N")],
        )
        .interactive()
    )
    st.altair_chart(chart1, use_container_width=True)

with c2:
    st.markdown("### Magnitudes (points) — survol pour détails")
    chart2 = (
        alt.Chart(df)
        .mark_circle()
        .encode(
            x=alt.X("time:T", title="Temps"),
            y=alt.Y("mag:Q", title="Magnitude"),
            tooltip=[
                alt.Tooltip("time:T", title="Temps"),
                alt.Tooltip("mag:Q", title="Mag"),
                alt.Tooltip("depthKm:Q", title="Profondeur (km)"),
                alt.Tooltip("place:N", title="Lieu"),
            ],
        )
        .interactive()
    )
    st.altair_chart(chart2, use_container_width=True)

with st.expander("Comprendre les indicateurs"):
    st.markdown(f"- **Séismes (total)** : {tooltips.get('n_total','')}")
    st.markdown(f"- **Séismes (7j)** : {tooltips.get('n7','')}")
    st.markdown(f"- **Magnitude max** : {tooltips.get('mmax','')}")
    st.markdown(f"- **Profondeur médiane** : {tooltips.get('depth_median','')}")
    st.markdown(f"- **Confiance** : {tooltips.get('confidence','')}")

st.caption(
    "⚠️ Ce dashboard ne remplace pas les alertes officielles d'observatoires. "
    "Les données peuvent être révisées par les organismes producteurs."
)
