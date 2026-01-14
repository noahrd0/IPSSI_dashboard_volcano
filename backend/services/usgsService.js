const axios = require('axios');

const USGS_BASE_URL = 'https://earthquake.usgs.gov/fdsnws/event/1';

/**
 * Récupère les séismes depuis l'API USGS
 * @param {number} latitude - Latitude du volcan
 * @param {number} longitude - Longitude du volcan
 * @param {number} radiusKm - Rayon de recherche en km (défaut: 100)
 * @param {Date} startDate - Date de début
 * @param {Date} endDate - Date de fin
 * @param {number} minMagnitude - Magnitude minimale (défaut: 1.0)
 * @returns {Promise<Array>} Liste des séismes
 */
async function fetchEarthquakes(latitude, longitude, radiusKm = 100, startDate, endDate, minMagnitude = 1.0) {
  try {
    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Construire l'URL avec les paramètres
    const params = {
      format: 'geojson',
      latitude: latitude,
      longitude: longitude,
      maxradiuskm: radiusKm,
      starttime: startDateStr,
      endtime: endDateStr,
      minmagnitude: minMagnitude,
      orderby: 'time'
    };

    const queryString = new URLSearchParams(params).toString();
    const url = `${USGS_BASE_URL}/query?${queryString}`;

    const response = await axios.get(url, {
      timeout: 30000
    });

    if (response.data && response.data.features) {
      return response.data.features.map(feature => ({
        id: feature.id,
        timestamp: new Date(feature.properties.time),
        magnitude: feature.properties.mag,
        place: feature.properties.place,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        depth: feature.geometry.coordinates[2] || 0, // Profondeur en km
        url: feature.properties.url,
        type: feature.properties.type,
        status: feature.properties.status
      }));
    }

    return [];
  } catch (error) {
    console.error('Erreur lors de la récupération des données USGS:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return [];
  }
}

/**
 * Récupère les séismes pour un volcan sur une période
 * @param {Object} volcan - Objet volcan avec latitude/longitude
 * @param {number} days - Nombre de jours à récupérer
 * @param {number} radiusKm - Rayon de recherche en km
 * @returns {Promise<Array>} Séismes formatés
 */
async function getSeismicDataForVolcano(volcan, days = 30, radiusKm = 100) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const earthquakes = await fetchEarthquakes(
      volcan.coordonnees.latitude,
      volcan.coordonnees.longitude,
      radiusKm,
      startDate,
      endDate,
      1.0 // Magnitude minimale
    );

    // Formater les données pour notre modèle
    return earthquakes.map(eq => ({
      timestamp: eq.timestamp,
      magnitude: eq.magnitude || 0,
      profondeur: Math.abs(eq.depth) || 0, // Profondeur en km (positive)
      latitude: eq.latitude,
      longitude: eq.longitude,
      place: eq.place,
      usgs_id: eq.id
    }));
  } catch (error) {
    console.error(`Erreur lors de la récupération des séismes pour ${volcan.nom}:`, error);
    return [];
  }
}

/**
 * Récupère les séismes récents (dernières 24h) pour un volcan
 * @param {Object} volcan - Objet volcan avec latitude/longitude
 * @param {number} radiusKm - Rayon de recherche en km
 * @returns {Promise<Array>} Séismes des dernières 24h
 */
async function getRecentEarthquakes(volcan, radiusKm = 100) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - 24);

  return await fetchEarthquakes(
    volcan.coordonnees.latitude,
    volcan.coordonnees.longitude,
    radiusKm,
    startDate,
    endDate,
    1.0
  );
}

module.exports = {
  fetchEarthquakes,
  getSeismicDataForVolcano,
  getRecentEarthquakes
};
