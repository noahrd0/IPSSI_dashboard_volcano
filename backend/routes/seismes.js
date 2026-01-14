const express = require('express');
const router = express.Router();
const Seisme = require('../models/Seisme');

// GET /api/seismes/volcan/:volcanId - Récupère les séismes d'un volcan
router.get('/volcan/:volcanId', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const { limit = 100, hours = 24 } = req.query;
    
    const dateLimit = new Date();
    dateLimit.setHours(dateLimit.getHours() - parseInt(hours));
    
    const seismes = await Seisme.find({
      volcan_id: volcanId,
      timestamp: { $gte: dateLimit }
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .populate('volcan_id', 'nom');
    
    res.json(seismes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/seismes/volcan/:volcanId/stats - Statistiques sismiques
router.get('/volcan/:volcanId/stats', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const { hours = 24 } = req.query;
    
    const dateLimit = new Date();
    dateLimit.setHours(dateLimit.getHours() - parseInt(hours));
    
    const seismes = await Seisme.find({
      volcan_id: volcanId,
      timestamp: { $gte: dateLimit }
    });
    
    if (seismes.length === 0) {
      return res.json({
        count: 0,
        magnitudeMax: 0,
        profondeurMoyenne: 0,
        seismesParHeure: 0
      });
    }
    
    const magnitudeMax = Math.max(...seismes.map(s => s.magnitude));
    const profondeurMoyenne = seismes.reduce((sum, s) => sum + s.profondeur, 0) / seismes.length;
    const seismesParHeure = seismes.length / parseInt(hours);
    
    res.json({
      count: seismes.length,
      magnitudeMax,
      profondeurMoyenne: Math.round(profondeurMoyenne * 100) / 100,
      seismesParHeure: Math.round(seismesParHeure * 100) / 100
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/seismes/volcan/:volcanId/live - Séismes par heure (live)
router.get('/volcan/:volcanId/live', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const seismes = await Seisme.find({
      volcan_id: volcanId,
      timestamp: { $gte: oneHourAgo }
    });
    
    res.json({
      count: seismes.length,
      timestamp: now
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/seismes - Crée un nouveau séisme
router.post('/', async (req, res) => {
  try {
    const seisme = new Seisme(req.body);
    await seisme.save();
    res.status(201).json(seisme);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
