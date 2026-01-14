const mongoose = require('mongoose');

const seismeSchema = new mongoose.Schema({
  volcan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Volcan',
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  magnitude: {
    type: Number,
    required: true,
    min: 0
  },
  profondeur: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

// Index composé pour les requêtes par volcan et date
seismeSchema.index({ volcan_id: 1, timestamp: -1 });

module.exports = mongoose.model('Seisme', seismeSchema);
