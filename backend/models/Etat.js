const mongoose = require('mongoose');

const etatSchema = new mongoose.Schema({
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
  etat: {
    type: String,
    required: true,
    enum: ['activité de fond', 'agitation accrue', 'phase pré-éruptive possible']
  },
  ntvc: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Index composé pour les requêtes par volcan et date
etatSchema.index({ volcan_id: 1, timestamp: -1 });

module.exports = mongoose.model('Etat', etatSchema);
