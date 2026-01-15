// src/server.js
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { z } = require("zod");

const { Volcano } = require("./models/Volcano");
const { QuakeEvent } = require("./models/QuakeEvent");

const {
  fetchVhpStatus,
  fetchHanselevated,
  fetchEarthquakesAndCache,
  computeIndicatorsAndRisk,
} = require("./services/usgs");

const { ensureVolcanoSeed } = require("./seed/ensureVolcanoSeed");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/volcano_dashboard";

// -----------------------------
// Helpers
// -----------------------------
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toIsoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function parseIsoDateOrThrow(s) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(String(s));
  if (!ok) throw new Error("Invalid date format (expected YYYY-MM-DD)");
  return String(s);
}

// Avoid reseeding at every request (still safe if called multiple times)
let seededOnce = false;
async function ensureSeeded() {
  if (seededOnce) return;
  await ensureVolcanoSeed();
  seededOnce = true;
}

// Shared query validation for quake/risk endpoints
const rangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  radius_km: z.coerce.number().min(1).max(500).optional(),
  minmag: z.coerce.number().min(-1).max(10).optional(),
});

// -----------------------------
// Health
// -----------------------------
app.get("/health", async (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// -----------------------------
// Volcano search (name -> list)
// - Uses only fields that exist in your schema: vName, vnum
// -----------------------------
app.get("/volcanoes/search", async (req, res) => {
  try {
    await ensureSeeded();

    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing query parameter q" });

    const regex = new RegExp(escapeRegex(q), "i");

    const results = await Volcano.find({
      $or: [{ vName: { $regex: regex } }, { vnum: { $regex: regex } }],
    })
      .limit(30)
      .sort({ vName: 1 })
      .lean();

    res.json({ query: q, count: results.length, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// -----------------------------
// Volcano list (paged)
// - Only uses fields that exist in schema
// -----------------------------
app.get("/volcanoes", async (req, res) => {
  try {
    await ensureSeeded();

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 200)));
    const skip = (page - 1) * limit;

    const sortBy = String(req.query.sortBy || "vName"); // vName | vnum
    const sortDir = String(req.query.sortDir || "asc") === "desc" ? -1 : 1;

    const sort = {};
    sort[sortBy === "vnum" ? "vnum" : "vName"] = sortDir;

    const [items, total] = await Promise.all([
      Volcano.find({})
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Volcano.countDocuments({}),
    ]);

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      results: items,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// -----------------------------
// Official status (USGS VHP + HANS if available)
// -----------------------------
app.get("/volcanoes/:vnum/status", async (req, res) => {
  try {
    await ensureSeeded();

    const vnum = String(req.params.vnum).trim();
    const volcano = await Volcano.findOne({ vnum }).lean();
    if (!volcano) return res.status(404).json({ error: "Unknown volcano vnum" });

    const [vhp, hans] = await Promise.all([
      fetchVhpStatus(vnum).catch(() => null),
      fetchHanselevated().catch(() => null),
    ]);

    // HANS matching: best-effort by vnum, fallback volcanoCd if your db has it
    let hansMatch = null;
    if (hans && Array.isArray(hans.elevated)) {
      hansMatch =
        hans.elevated.find((v) => String(v?.vnum || v?.volcanoVnum || "") === vnum) ||
        (volcano.volcanoCd
          ? hans.elevated.find((v) => String(v?.volcanoCd || "") === String(volcano.volcanoCd))
          : null);
    }

    res.json({
      volcano: {
        vnum: volcano.vnum,
        vName: volcano.vName,
        lat: volcano.lat,
        lon: volcano.lon,
      },
      vhp: vhp || null,
      hans: hansMatch || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// -----------------------------
// Earthquakes (catalog + cache)
// -----------------------------
app.get("/volcanoes/:vnum/earthquakes", async (req, res) => {
  try {
    await ensureSeeded();

    const vnum = String(req.params.vnum).trim();
    const volcano = await Volcano.findOne({ vnum }).lean();
    if (!volcano) return res.status(404).json({ error: "Unknown volcano vnum" });

    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const radiusKm =
      parsed.data.radius_km ?? Number(process.env.DEFAULT_RADIUS_KM || 25);
    const minmag =
      parsed.data.minmag ?? Number(process.env.DEFAULT_MIN_MAG || 0.0);

    const start = parseIsoDateOrThrow(parsed.data.start);
    const end = parseIsoDateOrThrow(parsed.data.end);

    const { fetched, stats } = await fetchEarthquakesAndCache({
      volcano,
      start,
      end,
      radiusKm,
      minmag,
    });

    const startD = new Date(start + "T00:00:00Z");
    const endD = new Date(end + "T23:59:59Z");

    const events = await QuakeEvent.find({
      volcanoVnum: vnum,
      radiusKm,
      minmag,
      time: { $gte: startD, $lte: endD },
    })
      .sort({ time: 1 })
      .lean();

    res.json({
      volcano: { vnum: volcano.vnum, vName: volcano.vName, lat: volcano.lat, lon: volcano.lon },
      query: { start, end, radiusKm, minmag },
      cache: { fetchedNow: fetched, fetchStats: stats },
      count: events.length,
      events,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// -----------------------------
// Indicators + risk
// -----------------------------
app.get("/volcanoes/:vnum/indicators", async (req, res) => {
  try {
    await ensureSeeded();

    const vnum = String(req.params.vnum).trim();
    const volcano = await Volcano.findOne({ vnum }).lean();
    if (!volcano) return res.status(404).json({ error: "Unknown volcano vnum" });

    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const radiusKm =
      parsed.data.radius_km ?? Number(process.env.DEFAULT_RADIUS_KM || 25);
    const minmag =
      parsed.data.minmag ?? Number(process.env.DEFAULT_MIN_MAG || 0.0);

    const start = parseIsoDateOrThrow(parsed.data.start);
    const end = parseIsoDateOrThrow(parsed.data.end);

    await fetchEarthquakesAndCache({ volcano, start, end, radiusKm, minmag });

    const payload = await computeIndicatorsAndRisk({
      volcano,
      start,
      end,
      radiusKm,
      minmag,
    });

    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// -----------------------------
// Global risk map (batch)  ✅
// GET /risk-map?days=30&radius_km=25&minmag=0&limit=300&page=1
// -----------------------------
app.get("/risk-map", async (req, res) => {
  try {
    await ensureVolcanoSeed();

    const schema = z.object({
      days: z.coerce.number().min(1).max(365).default(30),
      radius_km: z.coerce.number().min(1).max(500).default(Number(process.env.DEFAULT_RADIUS_KM || 25)),
      minmag: z.coerce.number().min(-1).max(10).default(Number(process.env.DEFAULT_MIN_MAG || 0.0)),
      limit: z.coerce.number().min(10).max(1000).default(300),
      page: z.coerce.number().min(1).default(1),
      concurrency: z.coerce.number().min(1).max(20).default(6),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { days, radius_km, minmag, limit, page, concurrency } = parsed.data;

    const endD = new Date();
    const startD = new Date(endD.getTime() - days * 24 * 60 * 60 * 1000);

    const start = startD.toISOString().slice(0, 10);
    const end = endD.toISOString().slice(0, 10);

    const skip = (page - 1) * limit;

    const volcanoes = await Volcano.find({})
      .sort({ vName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Petit pool de promesses (concurrency limitée)
    async function mapWithConcurrency(items, workerCount, fn) {
      const results = new Array(items.length);
      let i = 0;

      async function worker() {
        while (true) {
          const idx = i++;
          if (idx >= items.length) break;
          try {
            results[idx] = await fn(items[idx], idx);
          } catch (e) {
            results[idx] = null;
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      return results.filter(Boolean);
    }

    const rows = await mapWithConcurrency(volcanoes, concurrency, async (v) => {
      // ⚠️ pour éviter des trous, on vérifie coords ici
      const lat = v.lat ?? v.latitude;
      const lon = v.lon ?? v.longitude ?? v.long;
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;

      // 1) fetch/cacher séismes si nécessaire
      await fetchEarthquakesAndCache({
        volcano: v,
        start,
        end,
        radiusKm: radius_km,
        minmag,
      });

      // 2) compute risk/indicators (utilise ta logique existante)
      const out = await computeIndicatorsAndRisk({
        volcano: v,
        start,
        end,
        radiusKm: radius_km,
        minmag,
      });

      const risk = out.risk_badge || {};
      return {
        vnum: v.vnum,
        vName: v.vName,
        lat: Number(lat),
        lon: Number(lon),
        score: risk.score_0_100 ?? null,
        color: risk.color ?? "green",
        basis: risk.basis ?? null,
      };
    });

    res.json({
      query: { days, start, end, radius_km, minmag, limit, page, concurrency },
      count: rows.length,
      results: rows,
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});


// -----------------------------
// Startup
// -----------------------------
async function start() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB");

  // Seed once at boot
  await ensureSeeded();
  const n = await Volcano.countDocuments();
  console.log(`Volcano index ready: ${n} documents`);

  app.listen(PORT, () => console.log(`Backend listening on :${PORT}`));
}

start().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
