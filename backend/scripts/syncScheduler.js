require('dotenv').config();
const mongoose = require('mongoose');
const { syncAllVolcanoes } = require('../services/dataSyncService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volcano_monitoring';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '3600000'); // 1 heure par défaut

async function startScheduler() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    console.log(`🔄 Planificateur de synchronisation démarré (intervalle: ${SYNC_INTERVAL / 1000 / 60} minutes)`);

    // Synchronisation immédiate au démarrage
    console.log('🔄 Synchronisation initiale...');
    await syncAllVolcanoes();

    // Synchronisation périodique
    setInterval(async () => {
      console.log(`\n🔄 Synchronisation périodique à ${new Date().toISOString()}`);
      try {
        const summary = await syncAllVolcanoes();
        console.log('📊 Résumé:', JSON.stringify(summary, null, 2));
      } catch (error) {
        console.error('❌ Erreur lors de la synchronisation périodique:', error);
      }
    }, SYNC_INTERVAL);

    console.log('✅ Planificateur actif');
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du planificateur:', error);
    process.exit(1);
  }
}

// Gérer l'arrêt propre
process.on('SIGINT', async () => {
  console.log('\n🛑 Arrêt du planificateur...');
  await mongoose.connection.close();
  process.exit(0);
});

startScheduler();
