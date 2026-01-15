// src/seed/ensureVolcanoSeed.js
const axios = require("axios");
const { Volcano } = require("../models/Volcano");

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ");
}

function pickRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.volcanoes)) return data.volcanoes;
  return null;
}

async function ensureVolcanoSeed() {
  const count = await Volcano.countDocuments();
  if (count > 0) {
    console.log("[seed] volcanoes already present:", count);
    return { ok: true, seeded: false, count };
  }

  const url = process.env.VOLCANO_SEED_URL;
  if (!url) throw new Error("[seed] VOLCANO_SEED_URL missing");

  console.log("[seed] downloading volcano list:", url);

  const res = await axios.get(url, {
    headers: {
      "User-Agent": process.env.USER_AGENT || "volcano-dashboard/1.0",
      Accept: "application/json",
    },
    timeout: 60000,
  });

  const rows = pickRows(res.data);
  if (!rows) {
    const keys =
      res.data && typeof res.data === "object" ? Object.keys(res.data) : typeof res.data;
    console.error("[seed] unexpected payload keys:", keys);
    throw new Error("[seed] unexpected volcano list format (no array found)");
  }

  console.log("[seed] received rows:", rows.length);
  if (rows[0]) console.log("[seed] sample row keys:", Object.keys(rows[0]));

  const ops = [];
  let skipped = 0;

  for (const v of rows) {
    const vnum = v?.vnum != null ? String(v.vnum).trim() : "";
    const vName = String(v?.vName || v?.name || "").trim();

    const lat = Number(v?.latitude ?? v?.lat);
    const lon = Number(v?.longitude ?? v?.lon ?? v?.long);

    if (!vnum || !vName || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped++;
      continue;
    }

    const doc = {
      vnum,
      vName,
      lat,
      lon,

      // ✅ GeoJSON (si ajouté au schema)
      location: { type: "Point", coordinates: [lon, lat] },

      // ✅ normalisation (si ajouté au schema)
      vNameNorm: normalizeName(vName),

      // champs optionnels selon ta source + schema
      volcanoCd: v?.volcanoCd ?? v?.volcano_cd ?? null,
      obs: v?.obs ?? null,
      region: v?.region ?? null,
      vUrl: v?.webpage ?? v?.vUrl ?? null,
      vImage: v?.vImage ?? null,

      source: "usgs_vsc_volcanoesGVP",
      updatedAtSource: new Date(), // ou v.updatedAt si la source te le fournit
    };

    ops.push({
      updateOne: {
        filter: { vnum },
        update: { $set: doc },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) {
    console.error("[seed] 0 usable docs after parsing. skipped:", skipped);
    console.error("[seed] raw sample 1:", rows[0]);
    console.error("[seed] raw sample 2:", rows[1]);
    throw new Error("[seed] parsed 0 usable volcano docs");
  }

  const result = await Volcano.bulkWrite(ops, { ordered: false });
  const finalCount = await Volcano.countDocuments();

  console.log("[seed] bulkWrite result:", {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    matched: result.matchedCount,
    skipped,
    total: finalCount,
  });

  return { ok: true, seeded: true, count: finalCount };
}

module.exports = { ensureVolcanoSeed };
