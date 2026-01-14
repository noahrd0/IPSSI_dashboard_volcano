const express = require('express');
const router = express.Router();
const Volcan = require('../models/Volcan');
const { getSeismicDataForVolcano } = require('../services/usgsService');
const { mettreAJourEtat } = require('../services/ntvcService');
const Seisme = require('../models/Seisme');

// GET /api/volcans - Liste tous les volcans
router.get('/', async (req, res) => {
  try {
    const volcans = await Volcan.find();
    res.json(volcans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/volcans/:id - Récupère un volcan par ID
router.get('/:id', async (req, res) => {
  try {
    const volcan = await Volcan.findById(req.params.id);
    if (!volcan) {
      return res.status(404).json({ error: 'Volcan non trouvé' });
    }
    res.json(volcan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/volcans - Crée un nouveau volcan
router.post('/', async (req, res) => {
  try {
    const volcan = new Volcan(req.body);
    await volcan.save();
    res.status(201).json(volcan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/volcans/:id/init - Initialise les données pour un volcan (récupère depuis USGS)
router.post('/:id/init', async (req, res) => {
  try {
    const volcan = await Volcan.findById(req.params.id);
    if (!volcan) {
      return res.status(404).json({ error: 'Volcan non trouvé' });
    }

    const { days = 30, radiusKm = 100 } = req.body;

    // Récupérer les séismes depuis USGS
    const seismicData = await getSeismicDataForVolcano(volcan, days, radiusKm);
    
    let savedCount = 0;
    for (const eq of seismicData) {
      // Vérifier si le séisme existe déjà
      const existing = await Seisme.findOne({
        volcan_id: volcan._id,
        timestamp: {
          $gte: new Date(eq.timestamp.getTime() - 60000),
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
        savedCount++;
      }
    }

    // Calculer l'état initial
    await mettreAJourEtat(volcan._id);

    res.json({
      success: true,
      message: `Données initialisées pour ${volcan.nom}`,
      volcan: volcan.nom,
      seismes: {
        recus: seismicData.length,
        sauvegardes: savedCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
