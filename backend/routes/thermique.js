const express = require('express');
const router = express.Router();
const Thermique = require('../models/Thermique');

// GET /api/thermique/volcan/:volcanId - Récupère les données thermiques d'un volcan
router.get('/volcan/:volcanId', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const { limit = 100, hours = 24 } = req.query;
    
    const dateLimit = new Date();
    dateLimit.setHours(dateLimit.getHours() - parseInt(hours));
    
    const thermiques = await Thermique.find({
      volcan_id: volcanId,
      timestamp: { $gte: dateLimit }
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .populate('volcan_id', 'nom');
    
    res.json(thermiques);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/thermique/volcan/:volcanId/stats - Statistiques thermiques
router.get('/volcan/:volcanId/stats', async (req, res) => {
  try {
    const { volcanId } = req.params;
    
    const now = new Date();
    const date24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const date7j = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const anomalies24h = await Thermique.find({
      volcan_id: volcanId,
      timestamp: { $gte: date24h },
      anomalies: { $gt: 0 }
    });
    
    const anomalies7j = await Thermique.find({
      volcan_id: volcanId,
      timestamp: { $gte: date7j },
      anomalies: { $gt: 0 }
    });
    
    const thermiques24h = await Thermique.find({
      volcan_id: volcanId,
      timestamp: { $gte: date24h }
    }).sort({ timestamp: 1 });
    
    let tendance = 'stable';
    if (thermiques24h.length >= 2) {
      const premier = thermiques24h[0].temperature;
      const dernier = thermiques24h[thermiques24h.length - 1].temperature;
      const diff = dernier - premier;
      if (diff > 1) tendance = 'hausse';
      else if (diff < -1) tendance = 'baisse';
    }
    
    res.json({
      anomalies24h: anomalies24h.length,
      anomalies7j: anomalies7j.length,
      tendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/thermique - Crée une nouvelle donnée thermique
router.post('/', async (req, res) => {
  try {
    const thermique = new Thermique(req.body);
    await thermique.save();
    res.status(201).json(thermique);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
