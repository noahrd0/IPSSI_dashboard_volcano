const axios = require('axios');

const USGS_VOLCANO_BASE_URL = 'https://volcanoes.usgs.gov/hans-public/api/volcano';

/**
 * Récupère tous les volcans surveillés par l'USGS
 * @returns {Promise<Array>} Liste des volcans surveillés
 */
async function getMonitoredVolcanoes() {
  try {
    const response = await axios.get(`${USGS_VOLCANO_BASE_URL}/getMonitoredVolcanoes`, {
      timeout: 30000
    });

    if (response.data && Array.isArray(response.data)) {
      return response.data;
    }

    return [];
  } catch (error) {
    console.error('Erreur lors de la récupération des volcans surveillés:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return [];
  }
}

/**
 * Récupère tous les volcans US
 * @returns {Promise<Array>} Liste des volcans US
 */
async function getUSVolcanoes() {
  try {
    const response = await axios.get(`${USGS_VOLCANO_BASE_URL}/getUSVolcanoes`, {
      timeout: 30000
    });

    if (response.data && Array.isArray(response.data)) {
      return response.data;
    }

    return [];
  } catch (error) {
    console.error('Erreur lors de la récupération des volcans US:', error.message);
    return [];
  }
}

/**
 * Récupère les informations détaillées d'un volcan
 * @param {string} vnumOrVolcanoCd - Numéro Smithsonian ou code USGS
 * @returns {Promise<Object|null>} Informations du volcan
 */
async function getVolcanoDetails(vnumOrVolcanoCd) {
  try {
    const response = await axios.get(`${USGS_VOLCANO_BASE_URL}/getVolcano/${vnumOrVolcanoCd}`, {
      timeout: 30000
    });

    if (response.data) {
      return response.data;
    }

    return null;
  } catch (error) {
    console.error(`Erreur lors de la récupération des détails du volcan ${vnumOrVolcanoCd}:`, error.message);
    return null;
  }
}

/**
 * Convertit les données USGS en format de notre modèle
 * @param {Object} usgsVolcano - Données du volcan depuis USGS
 * @returns {Object|null} Volcan formaté pour notre modèle
 */
function formatVolcanoForModel(usgsVolcano) {
  try {
    // Extraire les coordonnées (essayer plusieurs formats possibles)
    let latitude = null;
    let longitude = null;

    // Format 1: latitude/longitude directes (format getUSVolcanoes)
    if (usgsVolcano.latitude !== undefined && usgsVolcano.latitude !== null && 
        usgsVolcano.longitude !== undefined && usgsVolcano.longitude !== null) {
      latitude = parseFloat(usgsVolcano.latitude);
      longitude = parseFloat(usgsVolcano.longitude);
    }
    // Format 2: lat/lon
    else if (usgsVolcano.lat !== undefined && usgsVolcano.lat !== null && 
             usgsVolcano.lon !== undefined && usgsVolcano.lon !== null) {
      latitude = parseFloat(usgsVolcano.lat);
      longitude = parseFloat(usgsVolcano.lon);
    }
    // Format 3: GeoJSON coordinates [lon, lat]
    else if (usgsVolcano.coordinates && Array.isArray(usgsVolcano.coordinates) && usgsVolcano.coordinates.length >= 2) {
      longitude = parseFloat(usgsVolcano.coordinates[0]);
      latitude = parseFloat(usgsVolcano.coordinates[1]);
    }
    // Format 4: location avec lat/lon
    else if (usgsVolcano.location) {
      if (usgsVolcano.location.latitude && usgsVolcano.location.longitude) {
        latitude = parseFloat(usgsVolcano.location.latitude);
        longitude = parseFloat(usgsVolcano.location.longitude);
      } else if (usgsVolcano.location.lat && usgsVolcano.location.lon) {
        latitude = parseFloat(usgsVolcano.location.lat);
        longitude = parseFloat(usgsVolcano.location.lon);
      }
    }

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      // Ne pas logger pour chaque volcan (trop verbeux), seulement retourner null
      return null;
    }

    // Extraire le nom (essayer plusieurs champs possibles)
    const nom = usgsVolcano.volcano_name || 
                usgsVolcano.volcanoName || 
                usgsVolcano.name || 
                usgsVolcano.volcano || 
                'Volcan inconnu';

    // Déterminer le type de volcan
    // Essayer d'extraire depuis boilerplate ou utiliser une valeur par défaut
    let type = 'autre';
    const boilerplate = (usgsVolcano.boilerplate || '').toLowerCase();
    const volcanoType = (usgsVolcano.volcanoType || usgsVolcano.type || boilerplate || '').toLowerCase();
    
    if (volcanoType.includes('stratovolcan') || volcanoType.includes('composite') || volcanoType.includes('stratovolcano')) {
      type = 'stratovolcan';
    } else if (volcanoType.includes('bouclier') || volcanoType.includes('shield')) {
      type = 'volcan bouclier';
    } else if (volcanoType.includes('caldeira') || volcanoType.includes('caldera')) {
      type = 'caldeira';
    } else if (volcanoType.includes('cône') || volcanoType.includes('cone') || volcanoType.includes('cinder')) {
      type = 'cône de scories';
    } else if (volcanoType.includes('dôme') || volcanoType.includes('dome')) {
      type = 'dôme de lave';
    }
    
    // Si toujours 'autre', essayer de deviner depuis le nom ou la région
    if (type === 'autre') {
      // Par défaut, la plupart des volcans US sont des stratovolcans
      type = 'stratovolcan';
    }

    // Extraire le VEI max (si disponible)
    let veiMax = 4; // Valeur par défaut
    if (usgsVolcano.maxVEI !== undefined && usgsVolcano.maxVEI !== null && !isNaN(usgsVolcano.maxVEI)) {
      veiMax = parseInt(usgsVolcano.maxVEI);
    } else if (usgsVolcano.veiMax !== undefined && usgsVolcano.veiMax !== null && !isNaN(usgsVolcano.veiMax)) {
      veiMax = parseInt(usgsVolcano.veiMax);
    } else if (usgsVolcano.vei !== undefined && usgsVolcano.vei !== null && !isNaN(usgsVolcano.vei)) {
      veiMax = parseInt(usgsVolcano.vei);
    }

    // S'assurer que VEI est entre 0 et 8
    veiMax = Math.max(0, Math.min(8, isNaN(veiMax) ? 4 : veiMax));

    return {
      nom,
      type,
      veiMax,
      coordonnees: {
        latitude,
        longitude
      },
      // Garder les données USGS originales pour référence
      usgsData: {
        vnum: usgsVolcano.vnum || null,
        volcanoCode: usgsVolcano.volcano_cd || usgsVolcano.volcanoCode || usgsVolcano.code || null,
        elevation: usgsVolcano.elevation_meters || usgsVolcano.elevation || usgsVolcano.elevationM || null,
        region: usgsVolcano.region || null,
        nvewsThreat: usgsVolcano.nvews_threat || null
      }
    };
  } catch (error) {
    console.error('Erreur lors du formatage du volcan:', error);
    return null;
  }
}

/**
 * Récupère et formate tous les volcans surveillés
 * @returns {Promise<Array>} Liste des volcans formatés
 */
async function getAllMonitoredVolcanoesFormatted() {
  try {
    console.log('📡 Récupération des volcans US depuis USGS...');
    
    // Utiliser getUSVolcanoes en priorité car il contient les coordonnées
    let volcanoes = await getUSVolcanoes();
    
    if (volcanoes.length === 0) {
      console.log('⚠️  Aucun volcan US trouvé, tentative avec getMonitoredVolcanoes...');
      // Si getUSVolcanoes ne retourne rien, essayer getMonitoredVolcanoes
      // mais il faudra ensuite récupérer les détails pour chaque volcan
      const monitored = await getMonitoredVolcanoes();
      
      // Récupérer les détails pour chaque volcan surveillé
      console.log(`📡 Récupération des détails pour ${monitored.length} volcan(s) surveillé(s)...`);
      for (const notice of monitored) {
        if (notice.vnum) {
          const details = await getVolcanoDetails(notice.vnum);
          if (details) {
            volcanoes.push(details);
          }
        }
      }
    }

    console.log(`✅ ${volcanoes.length} volcan(s) récupéré(s) depuis USGS`);

    const formattedVolcanoes = [];
    let skippedCount = 0;
    
    for (const volcano of volcanoes) {
      const formatted = formatVolcanoForModel(volcano);
      if (formatted) {
        formattedVolcanoes.push(formatted);
      } else {
        skippedCount++;
      }
    }

    console.log(`✅ ${formattedVolcanoes.length} volcan(s) formaté(s) avec succès`);
    if (skippedCount > 0) {
      console.log(`⚠️  ${skippedCount} volcan(s) ignoré(s) (coordonnées invalides)`);
    }
    return formattedVolcanoes;
  } catch (error) {
    console.error('Erreur lors de la récupération des volcans:', error);
    return [];
  }
}

module.exports = {
  getMonitoredVolcanoes,
  getUSVolcanoes,
  getVolcanoDetails,
  formatVolcanoForModel,
  getAllMonitoredVolcanoesFormatted
};
