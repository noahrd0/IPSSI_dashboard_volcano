const Volcan = require('../models/Volcan');
const Etat = require('../models/Etat');

/**
 * Génère un message automatique basé sur le contexte de risque du volcan
 * @param {string} volcanId - ID du volcan
 * @returns {Promise<string>}
 */
async function genererMessage(volcanId) {
  try {
    const volcan = await Volcan.findById(volcanId);
    if (!volcan) {
      return 'Volcan non trouvé';
    }
    
    const etat = await Etat.findOne({
      volcan_id: volcanId
    }).sort({ timestamp: -1 });
    
    if (!etat) {
      return 'Aucun état disponible';
    }
    
    const messages = [];
    
    // Message basé sur le VEI max historique
    if (volcan.veiMax >= 6) {
      messages.push('Volcan à très fort potentiel explosif');
    } else if (volcan.veiMax >= 4) {
      messages.push('Volcan à fort potentiel explosif');
    }
    
    // Message basé sur l'état actuel
    if (etat.ntvc >= 70) {
      messages.push('Activité très élevée détectée');
    } else if (etat.ntvc >= 40) {
      messages.push('Activité élevée détectée');
    }
    
    // Message basé sur le type de volcan
    if (volcan.type === 'stratovolcan' && etat.ntvc >= 50) {
      messages.push('Surveillance renforcée recommandée pour ce type de volcan');
    }
    
    // Message combiné
    if (messages.length === 0) {
      return 'Activité normale';
    }
    
    return messages.join(' - ');
  } catch (error) {
    console.error('Erreur lors de la génération du message:', error);
    return 'Erreur lors de la génération du message';
  }
}

module.exports = {
  genererMessage
};
