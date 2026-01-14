const Volcan = require('../models/Volcan');
const Seisme = require('../models/Seisme');
const { mettreAJourEtat } = require('./ntvcService');
const { getSeismicDataForVolcano, getRecentEarthquakes } = require('./usgsService');

/**
 * Synchronise les données sismiques pour un volcan
 * @param {Object} volcan - Objet volcan
 * @returns {Promise<number>} Nombre de nouveaux séismes ajoutés
 */
async function syncSeismicData(volcan) {
  try {
    // Récupérer les séismes récents (7 derniers jours)
    const seismicData = await getSeismicDataForVolcano(volcan, 7, 100);
    
    if (seismicData.length === 0) {
      return 0;
    }

    let newCount = 0;
    
    for (const eq of seismicData) {
      // Vérifier si le séisme existe déjà (basé sur timestamp et magnitude)
      const existing = await Seisme.findOne({
        volcan_id: volcan._id,
        timestamp: {
          $gte: new Date(eq.timestamp.getTime() - 60000), // ±1 minute
          $lte: new Date(eq.timestamp.getTime() + 60000)
        },
        magnitude: eq.magnitude
      });

      if (!existing) {
        const seisme = new Seisme({
          volcan_id: volcan._id,
          timestamp: eq.timestamp,
          magnitude: eq.magnitude,
          profondeur: eq.profondeur
        });
        await seisme.save();
        newCount++;
      }
    }

    return newCount;
  } catch (error) {
    console.error(`Erreur lors de la synchronisation sismique pour ${volcan.nom}:`, error);
    return 0;
  }
}


/**
 * Synchronise toutes les données pour tous les volcans
 * @returns {Promise<Object>} Résumé de la synchronisation
 */
async function syncAllVolcanoes() {
  try {
    const volcans = await Volcan.find();
    const summary = {
      total: volcans.length,
      seismic: { total: 0, new: 0 },
      errors: []
    };

    for (const volcan of volcans) {
      try {
        // Synchroniser les données sismiques
        const seismicNew = await syncSeismicData(volcan);
        summary.seismic.total += 1;
        summary.seismic.new += seismicNew;

        // Mettre à jour l'état NTVC
        await mettreAJourEtat(volcan._id);

        console.log(`✅ ${volcan.nom}: ${seismicNew} nouveaux séismes`);
      } catch (error) {
        summary.errors.push({ volcan: volcan.nom, error: error.message });
        console.error(`❌ Erreur pour ${volcan.nom}:`, error);
      }
    }

    return summary;
  } catch (error) {
    console.error('Erreur lors de la synchronisation globale:', error);
    throw error;
  }
}

/**
 * Synchronise les données pour un volcan spécifique
 * @param {string} volcanId - ID du volcan
 * @returns {Promise<Object>} Résumé de la synchronisation
 */
async function syncVolcano(volcanId) {
  try {
    const volcan = await Volcan.findById(volcanId);
    if (!volcan) {
      throw new Error('Volcan non trouvé');
    }

    const seismicNew = await syncSeismicData(volcan);
    await mettreAJourEtat(volcan._id);

    return {
      volcan: volcan.nom,
      seismic: { new: seismicNew }
    };
  } catch (error) {
    console.error(`Erreur lors de la synchronisation du volcan ${volcanId}:`, error);
    throw error;
  }
}

module.exports = {
  syncSeismicData,
  syncAllVolcanoes,
  syncVolcano
};
