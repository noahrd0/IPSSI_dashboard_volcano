const Seisme = require('../models/Seisme');
const Etat = require('../models/Etat');

/**
 * Calcule le NTVC (Niveau d'alerte volcanique) basé sur les données sismiques USGS
 * @param {string} volcanId - ID du volcan
 * @returns {Promise<{ntvc: number, etat: string}>}
 */
async function calculerNTVC(volcanId) {
  try {
    const now = new Date();
    const date24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Récupérer les données sismiques des dernières 24h
    const seismes = await Seisme.find({
      volcan_id: volcanId,
      timestamp: { $gte: date24h }
    });
    
    // Calcul du score sismique (0-100, basé uniquement sur les séismes)
    let scoreSismique = 0;
    if (seismes.length > 0) {
      const magnitudeMax = Math.max(...seismes.map(s => s.magnitude));
      const seismesParHeure = seismes.length / 24;
      
      // Score basé sur la magnitude max (0-50)
      if (magnitudeMax >= 4.5) scoreSismique += 50;
      else if (magnitudeMax >= 3.5) scoreSismique += 35;
      else if (magnitudeMax >= 2.5) scoreSismique += 20;
      else if (magnitudeMax >= 1.5) scoreSismique += 10;
      
      // Score basé sur la fréquence (0-50)
      if (seismesParHeure >= 10) scoreSismique += 50;
      else if (seismesParHeure >= 5) scoreSismique += 30;
      else if (seismesParHeure >= 2) scoreSismique += 15;
      else if (seismesParHeure >= 1) scoreSismique += 5;
    }
    
    // NTVC total (0-100) - basé uniquement sur les données sismiques
    const ntvc = Math.min(100, Math.round(scoreSismique));
    
    // Détermination de l'état
    let etat = 'activité de fond';
    if (ntvc >= 70) {
      etat = 'phase pré-éruptive possible';
    } else if (ntvc >= 40) {
      etat = 'agitation accrue';
    }
    
    return { ntvc, etat };
  } catch (error) {
    console.error('Erreur lors du calcul du NTVC:', error);
    return { ntvc: 0, etat: 'activité de fond' };
  }
}

/**
 * Met à jour l'état d'un volcan avec le NTVC calculé
 * @param {string} volcanId - ID du volcan
 * @returns {Promise<Etat>}
 */
async function mettreAJourEtat(volcanId) {
  const { ntvc, etat } = await calculerNTVC(volcanId);
  
  const nouvelEtat = new Etat({
    volcan_id: volcanId,
    ntvc,
    etat
  });
  
  await nouvelEtat.save();
  return nouvelEtat;
}

module.exports = {
  calculerNTVC,
  mettreAJourEtat
};
