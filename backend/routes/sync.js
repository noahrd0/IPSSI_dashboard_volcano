const express = require('express');
const router = express.Router();
const { syncAllVolcanoes, syncVolcano } = require('../services/dataSyncService');

// POST /api/sync/all - Synchronise toutes les données pour tous les volcans
router.post('/all', async (req, res) => {
  try {
    console.log('🔄 Démarrage de la synchronisation globale...');
    const summary = await syncAllVolcanoes();
    res.json({
      success: true,
      message: 'Synchronisation terminée',
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/sync/volcan/:volcanId - Synchronise les données pour un volcan spécifique
router.post('/volcan/:volcanId', async (req, res) => {
  try {
    const { volcanId } = req.params;
    console.log(`🔄 Synchronisation du volcan ${volcanId}...`);
    const summary = await syncVolcano(volcanId);
    res.json({
      success: true,
      message: 'Synchronisation terminée',
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
