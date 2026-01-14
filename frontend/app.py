import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime, timedelta
import time
import json
import os

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://backend:3000')
REFRESH_INTERVAL = 5  # secondes

# Configuration de la page
st.set_page_config(
    page_title="Monitoring Volcanique",
    page_icon="🌋",
    layout="wide"
)

# Cache pour les données
@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_volcans():
    """Récupère la liste des volcans"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/volcans")
        if response.status_code == 200:
            return response.json()
        return []
    except Exception as e:
        st.error(f"Erreur lors de la récupération des volcans: {e}")
        return []

@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_etat_complet(volcan_id):
    """Récupère l'état complet d'un volcan"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/etats/volcan/{volcan_id}/complet")
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        st.error(f"Erreur lors de la récupération de l'état: {e}")
        return None

@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_stats_seismes(volcan_id):
    """Récupère les statistiques sismiques"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/seismes/volcan/{volcan_id}/stats?hours=24")
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        return None

@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_seismes_live(volcan_id):
    """Récupère les séismes en temps réel"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/seismes/volcan/{volcan_id}/live")
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        return None

@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_seismes_historique(volcan_id, hours=24):
    """Récupère l'historique des séismes"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/seismes/volcan/{volcan_id}?hours={hours}&limit=1000")
        if response.status_code == 200:
            return response.json()
        return []
    except Exception as e:
        return []

@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_stats_thermique(volcan_id):
    """Récupère les statistiques thermiques"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/thermique/volcan/{volcan_id}/stats")
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        return None

@st.cache_data(ttl=REFRESH_INTERVAL)
def fetch_thermique_historique(volcan_id, hours=168):
    """Récupère l'historique thermique (7 jours par défaut)"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/thermique/volcan/{volcan_id}?hours={hours}&limit=1000")
        if response.status_code == 200:
            return response.json()
        return []
    except Exception as e:
        return []

def afficher_bandeau(volcan, etat_complet):
    """Affiche le bandeau supérieur avec nom, NTVC et état"""
    col1, col2, col3 = st.columns([2, 1, 1])
    
    with col1:
        st.title(f"🌋 {volcan['nom']}")
    
    with col2:
        if etat_complet:
            ntvc = etat_complet.get('ntvc', 0)
            st.metric("NTVC", f"{ntvc}/100")
            st.progress(ntvc / 100)
    
    with col3:
        if etat_complet:
            etat = etat_complet.get('etat', 'N/A')
            # Couleur selon l'état
            if etat == 'phase pré-éruptive possible':
                st.error(f"⚠️ {etat}")
            elif etat == 'agitation accrue':
                st.warning(f"⚡ {etat}")
            else:
                st.success(f"✅ {etat}")

def afficher_bloc_sismicite(volcan_id):
    """Affiche le bloc 1 - Sismicité"""
    st.subheader("📈 Bloc 1 — Sismicité")
    
    col1, col2, col3 = st.columns(3)
    
    # Séismes par heure (live)
    with col1:
        live_data = fetch_seismes_live(volcan_id)
        if live_data:
            st.metric("Séismes / heure (live)", live_data.get('count', 0))
        else:
            st.metric("Séismes / heure (live)", 0)
    
    # Magnitude max 24h
    with col2:
        stats = fetch_stats_seismes(volcan_id)
        if stats:
            st.metric("Magnitude max (24h)", f"{stats.get('magnitudeMax', 0):.2f}")
        else:
            st.metric("Magnitude max (24h)", "N/A")
    
    # Profondeur moyenne
    with col3:
        if stats:
            st.metric("Profondeur moyenne", f"{stats.get('profondeurMoyenne', 0):.2f} km")
        else:
            st.metric("Profondeur moyenne", "N/A")
    
    # Graphiques sismiques
    seismes_24h = fetch_seismes_historique(volcan_id, hours=24)
    seismes_7j = fetch_seismes_historique(volcan_id, hours=168)
    
    # Statistiques supplémentaires
    if stats:
        st.write("**Statistiques détaillées:**")
        col_stat1, col_stat2, col_stat3 = st.columns(3)
        with col_stat1:
            st.caption(f"Total séismes (24h): {stats.get('count', 0)}")
        with col_stat2:
            st.caption(f"Séismes/heure: {stats.get('seismesParHeure', 0):.2f}")
        with col_stat3:
            profondeurs = [s.get('profondeur', 0) for s in (seismes_24h or []) if s.get('profondeur')]
            profondeur_max = max(profondeurs) if profondeurs else 0
            st.caption(f"Profondeur max: {profondeur_max:.1f} km")
    
    if seismes_24h or seismes_7j:
        # Graphique 1: Séismes par heure (24h)
        if seismes_24h and len(seismes_24h) > 0:
            df_24h = pd.DataFrame(seismes_24h)
            if not df_24h.empty and 'timestamp' in df_24h.columns:
                df_24h['timestamp'] = pd.to_datetime(df_24h['timestamp'])
                # Filtrer les valeurs NaN
                df_24h = df_24h.dropna(subset=['timestamp'])
                
                if not df_24h.empty:
                    df_24h['heure'] = df_24h['timestamp'].dt.floor('H')
                    seismes_par_heure = df_24h.groupby('heure').size().reset_index(name='count')
                    
                    if not seismes_par_heure.empty:
                        fig1 = px.line(seismes_par_heure, x='heure', y='count', 
                                     title='Séismes par heure (24h)',
                                     labels={'heure': 'Heure', 'count': 'Nombre de séismes'},
                                     markers=True)
                        fig1.update_traces(line_color='#1f77b4', marker_color='#1f77b4')
                        st.plotly_chart(fig1, use_container_width=True)
        
        # Graphique 2: Magnitude dans le temps
        if seismes_7j and len(seismes_7j) > 0:
            df_7j = pd.DataFrame(seismes_7j)
            if not df_7j.empty and 'timestamp' in df_7j.columns and 'magnitude' in df_7j.columns:
                df_7j['timestamp'] = pd.to_datetime(df_7j['timestamp'])
                # Filtrer les valeurs NaN
                df_7j = df_7j.dropna(subset=['timestamp', 'magnitude'])
                
                if not df_7j.empty:
                    fig2 = go.Figure()
                    fig2.add_trace(go.Scatter(
                        x=df_7j['timestamp'],
                        y=df_7j['magnitude'],
                        mode='markers',
                        name='Magnitude',
                        marker=dict(
                            size=8,
                            color=df_7j['magnitude'],
                            colorscale='Reds',
                            showscale=True,
                            colorbar=dict(title="Magnitude")
                        )
                    ))
                    fig2.update_layout(
                        title='Magnitude des séismes (7 jours)',
                        xaxis_title='Date',
                        yaxis_title='Magnitude',
                        hovermode='closest'
                    )
                    st.plotly_chart(fig2, use_container_width=True)
        
        # Graphique 3: Profondeur vs Magnitude
        if seismes_24h and len(seismes_24h) > 0:
            df_24h_scatter = pd.DataFrame(seismes_24h)
            if not df_24h_scatter.empty and 'magnitude' in df_24h_scatter.columns and 'profondeur' in df_24h_scatter.columns:
                # Filtrer les valeurs NaN
                df_24h_scatter = df_24h_scatter.dropna(subset=['magnitude', 'profondeur'])
                
                if not df_24h_scatter.empty:
                    # Convertir timestamp pour l'affichage
                    if 'timestamp' in df_24h_scatter.columns:
                        df_24h_scatter['timestamp'] = pd.to_datetime(df_24h_scatter['timestamp'])
                    
                    fig3 = px.scatter(df_24h_scatter, x='magnitude', y='profondeur',
                                     title='Profondeur vs Magnitude (24h)',
                                     labels={'magnitude': 'Magnitude', 'profondeur': 'Profondeur (km)'},
                                     color='magnitude',
                                     size='magnitude',
                                     hover_data=['timestamp'] if 'timestamp' in df_24h_scatter.columns else [])
                    st.plotly_chart(fig3, use_container_width=True)
    else:
        st.info("Aucune donnée sismique disponible pour les dernières 24h.")

def afficher_bloc_thermique(volcan_id):
    """Affiche le bloc 2 - Thermique"""
    st.subheader("🌡️ Bloc 2 — Thermique")
    
    stats = fetch_stats_thermique(volcan_id)
    thermiques_24h = fetch_thermique_historique(volcan_id, hours=24)
    thermiques_7j = fetch_thermique_historique(volcan_id, hours=168)
    
    # Vérifier si des données thermiques sont disponibles
    has_thermal_data = (stats and (stats.get('anomalies24h', 0) > 0 or stats.get('anomalies7j', 0) > 0)) or \
                       (thermiques_24h and len(thermiques_24h) > 0) or \
                       (thermiques_7j and len(thermiques_7j) > 0)
    
    if not has_thermal_data:
        st.info("ℹ️ Les données thermiques ne sont actuellement pas disponibles. Le système utilise uniquement les données sismiques USGS pour le calcul du NTVC.")
        st.write("**Note:** Les données thermiques peuvent être ajoutées manuellement via l'API si nécessaire.")
        return
    
    col1, col2 = st.columns(2)
    
    with col1:
        if stats:
            st.metric("Anomalies 24h", stats.get('anomalies24h', 0))
        else:
            st.metric("Anomalies 24h", 0)
    
    with col2:
        if stats:
            st.metric("Anomalies 7j", stats.get('anomalies7j', 0))
        else:
            st.metric("Anomalies 7j", 0)
    
    # Tendance thermique
    if stats:
        tendance = stats.get('tendance', 'stable')
        if tendance == 'hausse':
            st.success(f"📈 Tendance thermique: {tendance}")
        elif tendance == 'baisse':
            st.info(f"📉 Tendance thermique: {tendance}")
        else:
            st.info(f"➡️ Tendance thermique: {tendance}")
    
    # Graphique d'évolution
    if thermiques_24h or thermiques_7j:
        fig = go.Figure()
        
        if thermiques_7j and len(thermiques_7j) > 0:
            df_7j = pd.DataFrame(thermiques_7j)
            if not df_7j.empty and 'timestamp' in df_7j.columns:
                df_7j['timestamp'] = pd.to_datetime(df_7j['timestamp'])
                fig.add_trace(go.Scatter(
                    x=df_7j['timestamp'],
                    y=df_7j['anomalies'],
                    mode='lines',
                    name='Anomalies 7j',
                    line=dict(color='orange', width=1)
                ))
        
        if thermiques_24h and len(thermiques_24h) > 0:
            df_24h = pd.DataFrame(thermiques_24h)
            if not df_24h.empty and 'timestamp' in df_24h.columns:
                df_24h['timestamp'] = pd.to_datetime(df_24h['timestamp'])
                fig.add_trace(go.Scatter(
                    x=df_24h['timestamp'],
                    y=df_24h['anomalies'],
                    mode='lines+markers',
                    name='Anomalies 24h',
                    line=dict(color='red', width=2)
                ))
        
        if len(fig.data) > 0:
            fig.update_layout(
                title='Évolution des anomalies thermiques',
                xaxis_title='Date',
                yaxis_title='Nombre d\'anomalies',
                hovermode='x unified'
            )
            st.plotly_chart(fig, use_container_width=True)

def afficher_bloc_contexte(volcan, etat_complet):
    """Affiche le bloc 3 - Contexte de risque"""
    st.subheader("⚠️ Bloc 3 — Contexte de risque")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.metric("VEI max historique", volcan.get('veiMax', 'N/A'))
        st.write(f"**Type de volcan:** {volcan.get('type', 'N/A')}")
        
        # Afficher les coordonnées si disponibles
        if volcan.get('coordonnees'):
            coords = volcan['coordonnees']
            st.write(f"**Coordonnées:** {coords.get('latitude', 'N/A'):.4f}°N, {coords.get('longitude', 'N/A'):.4f}°E")
        
        # Afficher les données USGS si disponibles
        if volcan.get('usgsData'):
            usgs = volcan['usgsData']
            if usgs.get('region'):
                st.write(f"**Région:** {usgs['region']}")
            if usgs.get('elevation'):
                st.write(f"**Élévation:** {usgs['elevation']:.0f} m")
    
    with col2:
        if etat_complet and 'message' in etat_complet:
            st.info(f"**Message automatique:**\n\n{etat_complet['message']}")
        else:
            st.info("**Message automatique:** Aucun message disponible")
        
        # Afficher le score NTVC détaillé si disponible
        if etat_complet:
            ntvc = etat_complet.get('ntvc', 0)
            st.write(f"**Score NTVC:** {ntvc}/100")
            
            # Barre de progression colorée
            if ntvc >= 70:
                st.progress(ntvc / 100)
                st.caption("🔴 Niveau élevé")
            elif ntvc >= 40:
                st.progress(ntvc / 100)
                st.caption("🟡 Niveau modéré")
            else:
                st.progress(ntvc / 100)
                st.caption("🟢 Niveau faible")

# Application principale
def main():
    st.header("Dashboard de Monitoring Volcanique")
    
    # Récupération des volcans
    volcans = fetch_volcans()
    
    if not volcans:
        st.warning("Aucun volcan disponible. Veuillez ajouter des volcans via l'API.")
        return
    
    # Sélection du volcan
    volcan_names = [f"{v['nom']} (ID: {str(v['_id'])[:8]}...)" for v in volcans]
    selected_index = st.selectbox("Sélectionner un volcan", range(len(volcan_names)), 
                                  format_func=lambda x: volcan_names[x])
    
    if selected_index is not None:
        volcan = volcans[selected_index]
        # Convertir ObjectId en string si nécessaire
        volcan_id = str(volcan['_id']) if volcan.get('_id') else None
        
        # Récupération de l'état complet
        etat_complet = fetch_etat_complet(volcan_id)
        
        # Bandeau supérieur
        afficher_bandeau(volcan, etat_complet)
        
        st.divider()
        
        # Bloc 1 - Sismicité
        afficher_bloc_sismicite(volcan_id)
        
        st.divider()
        
        # Bloc 2 - Thermique
        afficher_bloc_thermique(volcan_id)
        
        st.divider()
        
        # Bloc 3 - Contexte de risque
        afficher_bloc_contexte(volcan, etat_complet)
        
        # Auto-refresh avec indicateur
        placeholder = st.empty()
        for i in range(REFRESH_INTERVAL, 0, -1):
            placeholder.info(f"🔄 Mise à jour automatique dans {i} secondes...")
            time.sleep(1)
        placeholder.empty()
        st.rerun()

if __name__ == "__main__":
    main()
