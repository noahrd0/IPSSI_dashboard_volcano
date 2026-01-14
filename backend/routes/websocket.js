const express = require('express');
const router = express.Router();
const Seisme = require('../models/Seisme');
const Thermique = require('../models/Thermique');
const Etat = require('../models/Etat');

// Stockage des connexions WebSocket par volcan
const connections = new Map();

// Fonction pour diffuser les données à tous les clients connectés pour un volcan
function broadcastToVolcan(volcanId, data) {
  const volcanConnections = connections.get(volcanId) || [];
  volcanConnections.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
    }
  });
}

// WebSocket endpoint pour les mises à jour en temps réel
router.ws('/volcan/:volcanId', (ws, req) => {
  const { volcanId } = req.params;
  
  // Ajouter la connexion à la liste
  if (!connections.has(volcanId)) {
    connections.set(volcanId, []);
  }
  connections.get(volcanId).push(ws);
  
  console.log(`📡 Client connecté pour le volcan ${volcanId}`);
  
  // Envoyer les données initiales
  sendInitialData(volcanId, ws);
  
  // Gérer la déconnexion
  ws.on('close', () => {
    const volcanConnections = connections.get(volcanId) || [];
    const index = volcanConnections.indexOf(ws);
    if (index > -1) {
      volcanConnections.splice(index, 1);
    }
    if (volcanConnections.length === 0) {
      connections.delete(volcanId);
    }
    console.log(`📡 Client déconnecté pour le volcan ${volcanId}`);
  });
  
  // Gérer les erreurs
  ws.on('error', (error) => {
    console.error(`❌ Erreur WebSocket pour volcan ${volcanId}:`, error);
  });
});

// Fonction pour envoyer les données initiales
async function sendInitialData(volcanId, ws) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Données sismiques récentes
    const seismes = await Seisme.find({
      volcan_id: volcanId,
      timestamp: { $gte: oneHourAgo }
    }).sort({ timestamp: -1 });
    
    // Données thermiques récentes
    const thermiques = await Thermique.find({
      volcan_id: volcanId,
      timestamp: { $gte: oneHourAgo }
    }).sort({ timestamp: -1 });
    
    // État actuel
    const etat = await Etat.findOne({
      volcan_id: volcanId
    }).sort({ timestamp: -1 });
    
    ws.send(JSON.stringify({
      type: 'initial',
      data: {
        seismes: seismes,
        thermiques: thermiques,
        etat: etat
      }
    }));
  } catch (error) {
    console.error('Erreur lors de l\'envoi des données initiales:', error);
  }
}

// Export de la fonction de broadcast pour utilisation dans d'autres modules
module.exports = router;
module.exports.broadcastToVolcan = broadcastToVolcan;
