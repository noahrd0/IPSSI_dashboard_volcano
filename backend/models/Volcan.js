const mongoose = require('mongoose');

const volcanSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['stratovolcan', 'volcan bouclier', 'caldeira', 'cône de scories', 'dôme de lave', 'autre']
  },
  veiMax: {
    type: Number,
    required: true,
    min: 0,
    max: 8
  },
  coordonnees: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    }
  },
  usgsData: {
    vnum: String,
    volcanoCode: String,
    elevation: Number,
    region: String
  }
}, {
  timestamps: true
});

// Index pour éviter les doublons (même nom et coordonnées)
volcanSchema.index({ nom: 1, 'coordonnees.latitude': 1, 'coordonnees.longitude': 1 }, { unique: true });

module.exports = mongoose.model('Volcan', volcanSchema);
