require('dotenv').config();
const mongoose = require('mongoose');
const Volcan = require('../models/Volcan');
const Seisme = require('../models/Seisme');
const Thermique = require('../models/Thermique');
const Etat = require('../models/Etat');
const { mettreAJourEtat } = require('../services/ntvcService');
const { getSeismicDataForVolcano } = require('../services/usgsService');
const { getAllMonitoredVolcanoesFormatted } = require('../services/usgsVolcanoService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volcano_monitoring';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    // Vérifier si des volcans existent déjà
    const existingVolcans = await Volcan.find();
    const forceUpdate = process.argv.includes('--force');
    
    if (existingVolcans.length > 0 && !forceUpdate) {
      console.log(`ℹ️  ${existingVolcans.length} volcan(s) existant(s) trouvé(s).`);
      console.log('💡 Utilisez --force pour récupérer tous les volcans depuis USGS.');
      console.log('💡 Utilisez l\'API POST /api/volcans pour ajouter de nouveaux volcans.');
      console.log('💡 Utilisez POST /api/volcans/:id/init pour initialiser les données d\'un volcan.');
      
      // Optionnel : nettoyer seulement les données (séismes, états) si demandé
      const cleanData = process.argv.includes('--clean-data');
      if (cleanData) {
        await Seisme.deleteMany({});
        await Thermique.deleteMany({});
        await Etat.deleteMany({});
        console.log('🧹 Données nettoyées (séismes, thermique, états)');
      }
      
      process.exit(0);
    }

    // Nettoyer les collections si --force ou si base vide
    if (forceUpdate || existingVolcans.length === 0) {
      if (forceUpdate) {
        console.log('🔄 Mode --force activé, nettoyage des collections...');
      }
      await Volcan.deleteMany({});
      await Seisme.deleteMany({});
      await Thermique.deleteMany({});
      await Etat.deleteMany({});
      console.log('🧹 Collections nettoyées');
    }

    // Récupérer tous les volcans surveillés depuis USGS
    const volcansUSGS = await getAllMonitoredVolcanoesFormatted();
    
    if (volcansUSGS.length === 0) {
      console.error('❌ Aucun volcan récupéré depuis USGS. Vérifiez votre connexion internet.');
      process.exit(1);
    }

    // Créer les volcans dans la base de données
    console.log(`\n📝 Création de ${volcansUSGS.length} volcan(s) dans la base de données...`);
    const volcansCrees = [];
    
    for (const volcanData of volcansUSGS) {
      try {
        // Vérifier si le volcan existe déjà (par nom et coordonnées)
        const existing = await Volcan.findOne({
          nom: volcanData.nom,
          'coordonnees.latitude': volcanData.coordonnees.latitude,
          'coordonnees.longitude': volcanData.coordonnees.longitude
        });

        if (existing) {
          console.log(`  ⏭️  ${volcanData.nom} existe déjà, ignoré`);
          volcansCrees.push(existing);
          continue;
        }

        const volcan = new Volcan(volcanData);
        await volcan.save();
        volcansCrees.push(volcan);
        console.log(`  ✅ ${volcan.nom} créé (${volcan.type}, VEI: ${volcan.veiMax})`);
      } catch (error) {
        console.error(`  ❌ Erreur lors de la création de ${volcanData.nom}:`, error.message);
      }
    }

    console.log(`\n🌋 ${volcansCrees.length} volcan(s) créé(s) avec succès`);

    // Récupérer les données sismiques pour tous les volcans
    console.log(`\n📡 Récupération des données sismiques depuis USGS pour ${volcansCrees.length} volcan(s)...`);

    let totalSeismes = 0;
    for (const volcan of volcansCrees) {
      console.log(`\n📊 Traitement de ${volcan.nom}...`);
      
      // Récupérer les séismes depuis USGS (30 derniers jours)
      console.log(`  🔍 Récupération des séismes depuis USGS...`);
      try {
        const seismicData = await getSeismicDataForVolcano(volcan, 30, 100);
        console.log(`  ✅ ${seismicData.length} séismes récupérés`);
        
        // Sauvegarder les séismes
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
        console.log(`  💾 ${savedCount} séismes sauvegardés (${seismicData.length - savedCount} déjà existants)`);
        totalSeismes += savedCount;
      } catch (error) {
        console.error(`  ❌ Erreur lors de la récupération des séismes:`, error.message);
      }

      // Calculer l'état pour ce volcan
      console.log(`  📈 Calcul de l'état NTVC...`);
      try {
        await mettreAJourEtat(volcan._id);
        console.log(`  ✅ État calculé pour ${volcan.nom}`);
      } catch (error) {
        console.error(`  ⚠️  Erreur lors du calcul de l'état:`, error.message);
      }
    }

    console.log(`\n📊 Résumé: ${totalSeismes} séismes récupérés au total`);

    console.log('\n📊 Données réelles récupérées et sauvegardées');
    console.log('✨ Seed terminé avec succès!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors du seed:', error);
    process.exit(1);
  }
}

seed();
