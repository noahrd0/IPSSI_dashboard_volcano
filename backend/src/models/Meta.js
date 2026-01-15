// src/models/Meta.js
const mongoose = require("mongoose");

const MetaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

const Meta = mongoose.model("Meta", MetaSchema);
module.exports = { Meta };
