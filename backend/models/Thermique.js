const mongoose = require('mongoose');

const thermiqueSchema = new mongoose.Schema({
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
  anomalies: {
    type: Number,
    required: true,
    default: 0
  },
  temperature: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Index composé pour les requêtes par volcan et date
thermiqueSchema.index({ volcan_id: 1, timestamp: -1 });

module.exports = mongoose.model('Thermique', thermiqueSchema);
