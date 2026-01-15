const mongoose = require("mongoose");

const VolcanoSchema = new mongoose.Schema(
  {
    vnum: { type: String, index: true, unique: true },
    vName: { type: String, index: true },
    lat: Number,
    lon: Number,
    volcanoCd: String,
    obs: String,
    region: String,
    vUrl: String,
    vImage: String,
    source: { type: String, default: "usgs_vsc_volcanoesGVP" },
    updatedAtSource: Date,
  },
  { timestamps: true }
);

const Volcano = mongoose.model("Volcano", VolcanoSchema);
module.exports = { Volcano };
