// src/models/QuakeEvent.js
const mongoose = require("mongoose");

const QuakeEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true },
    volcanoVnum: { type: String, required: true, index: true },

    time: { type: Date, required: true, index: true },

    mag: { type: Number, default: null },
    place: { type: String, default: null },
    depthKm: { type: Number, default: null },

    lat: { type: Number, default: null },
    lon: { type: Number, default: null },

    url: { type: String, default: null },

    radiusKm: { type: Number, required: true, index: true },
    minmag: { type: Number, required: true, index: true },

    // ✅ raw conservé
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

// ✅ Unique par event + volcan + params
QuakeEventSchema.index(
  { eventId: 1, volcanoVnum: 1, radiusKm: 1, minmag: 1 },
  { unique: true }
);

// ✅ Index CRUCIAL pour toutes tes requêtes time-range
QuakeEventSchema.index({ volcanoVnum: 1, radiusKm: 1, minmag: 1, time: 1 });

// Optionnel TTL (à activer seulement si tu veux purger automatiquement)
// QuakeEventSchema.index({ time: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const QuakeEvent = mongoose.model("QuakeEvent", QuakeEventSchema);
module.exports = { QuakeEvent };
