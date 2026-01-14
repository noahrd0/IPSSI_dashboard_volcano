const express = require('express');
const router = express.Router();
const Etat = require('../models/Etat');
const { mettreAJourEtat } = require('../services/ntvcService');
const { genererMessage } = require('../services/messageService');

// GET /api/etats/volcan/:volcanId - Récupère l'état actuel d'un volcan
router.get('/volcan/:volcanId', async (req, res) => {
  try {
    const { volcanId } = req.params;
    
    const etat = await Etat.findOne({
      volcan_id: volcanId
    })
    .sort({ timestamp: -1 })
    .populate('volcan_id', 'nom type veiMax');
    
    if (!etat) {
      return res.status(404).json({ error: 'Aucun état trouvé pour ce volcan' });
    }
    
    res.json(etat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/etats/volcan/:volcanId/historique - Historique des états
router.get('/volcan/:volcanId/historique', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const { limit = 100 } = req.query;
    
    const etats = await Etat.find({
      volcan_id: volcanId
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit));
    
    res.json(etats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/etats - Crée un nouvel état
router.post('/', async (req, res) => {
  try {
    const etat = new Etat(req.body);
    await etat.save();
    res.status(201).json(etat);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/etats/volcan/:volcanId/calculer - Calcule et met à jour l'état
router.post('/volcan/:volcanId/calculer', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const nouvelEtat = await mettreAJourEtat(volcanId);
    const message = await genererMessage(volcanId);
    
    res.json({
      ...nouvelEtat.toObject(),
      message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/etats/volcan/:volcanId/complet - Récupère l'état complet avec message
router.get('/volcan/:volcanId/complet', async (req, res) => {
  try {
    const { volcanId } = req.params;
    const etat = await Etat.findOne({
      volcan_id: volcanId
    })
    .sort({ timestamp: -1 })
    .populate('volcan_id', 'nom type veiMax');
    
    if (!etat) {
      return res.status(404).json({ error: 'Aucun état trouvé pour ce volcan' });
    }
    
    const message = await genererMessage(volcanId);
    
    res.json({
      ...etat.toObject(),
      message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
