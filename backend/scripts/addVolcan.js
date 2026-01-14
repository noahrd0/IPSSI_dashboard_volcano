require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Script pour ajouter un volcan via l'API
 * Usage: node scripts/addVolcan.js "Nom du volcan" "type" veiMax latitude longitude
 * 
 * Exemple:
 * node scripts/addVolcan.js "Etna" "stratovolcan" 5 37.7510 14.9934
 */

async function addVolcan(nom, type, veiMax, latitude, longitude, initData = true) {
  try {
    // Créer le volcan
    console.log(`📝 Création du volcan ${nom}...`);
    const createResponse = await axios.post(`${API_BASE_URL}/api/volcans`, {
      nom,
      type,
      veiMax: parseInt(veiMax),
      coordonnees: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      }
    });

    const volcan = createResponse.data;
    console.log(`✅ Volcan créé avec l'ID: ${volcan._id}`);

    // Initialiser les données si demandé
    if (initData) {
      console.log(`📡 Récupération des données USGS pour ${nom}...`);
      const initResponse = await axios.post(`${API_BASE_URL}/api/volcans/${volcan._id}/init`, {
        days: 30,
        radiusKm: 100
      });

      console.log(`✅ ${initResponse.data.seismes.sauvegardes} séismes récupérés et sauvegardés`);
    }

    console.log(`✨ Volcan ${nom} ajouté avec succès!`);
    return volcan;
  } catch (error) {
    console.error('❌ Erreur:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Récupérer les arguments de la ligne de commande
const args = process.argv.slice(2);

if (args.length < 5) {
  console.log('Usage: node scripts/addVolcan.js "Nom" "type" veiMax latitude longitude [--no-init]');
  console.log('');
  console.log('Exemples:');
  console.log('  node scripts/addVolcan.js "Etna" "stratovolcan" 5 37.7510 14.9934');
  console.log('  node scripts/addVolcan.js "Vésuve" "stratovolcan" 6 40.8220 14.4289');
  console.log('');
  console.log('Types valides: stratovolcan, volcan bouclier, caldeira, cône de scories, dôme de lave, autre');
  process.exit(1);
}

const [nom, type, veiMax, latitude, longitude] = args;
const initData = !args.includes('--no-init');

addVolcan(nom, type, veiMax, latitude, longitude, initData);
