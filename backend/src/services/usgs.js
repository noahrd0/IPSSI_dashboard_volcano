// src/services/usgs.js
// Node 20+ (global fetch)
// Goals:
// - Seed volcano list once (upsert, no silent errors)
// - Fetch official USGS VHP status (best-effort)
// - Fetch HANS elevated volcanoes with in-memory cache
// - Fetch USGS earthquakes (FDSN Event) with chunking + bulk upserts
// - Compute indicators + a risk badge + confidence label
//
// Expected models:
//  - Volcano: { vnum, vName, lat, lon, volcanoCd?, obs?, region?, vUrl?, vImage?, source?, updatedAtSource? }
//  - QuakeEvent: { eventId, volcanoVnum, time, mag, place, depthKm, lat, lon, url, radiusKm, minmag, raw }
//  - Meta: { key, value }  (value can be string or object)

const { Volcano } = require("../models/Volcano");
const { QuakeEvent } = require("../models/QuakeEvent");
const { Meta } = require("../models/Meta");

const USER_AGENT = process.env.USER_AGENT || "volcano-dashboard/1.0";

// -------------------- utils --------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function median(values) {
  if (!values.length) return null;
  const a = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseDepthKm(feature) {
  try {
    const coords = feature?.geometry?.coordinates; // [lon, lat, depth_km]
    if (Array.isArray(coords) && coords.length >= 3) return safeNumber(coords[2]);
  } catch {}
  return null;
}

async function httpGetJson(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} for ${url} :: ${text.slice(0, 200)}`);
    }

    return res.json();
  } finally {
    clearTimeout(t);
  }
}

// -------------------- Volcano list caching (USGS VSC) --------------------
// Endpoint from USGS VSC Volcano API docs:
// https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP
function pickRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.volcanoes)) return data.volcanoes;
  return null;
}

function mapVolcanoRow(v, now) {
  const vnum = v?.vnum != null ? String(v.vnum).trim() : "";
  const vName = String(v?.vName || v?.name || v?.volcanoName || "").trim();

  const lat = safeNumber(v?.lat ?? v?.latitude);
  const lon = safeNumber(v?.lon ?? v?.longitude ?? v?.long);

  if (!vnum || !vName || lat === null || lon === null) return null;

  return {
    vnum,
    vName,
    lat,
    lon,
    volcanoCd: v?.volcanoCd ?? v?.volcano_cd ?? null,
    obs: v?.obs ?? v?.obsAbbr ?? null,
    region: v?.region ?? v?.subregion ?? null,
    vUrl: v?.vUrl ?? v?.webpage ?? null,
    vImage: v?.vImage ?? null,
    source: "usgs_vsc_volcanoesGVP",
    updatedAtSource: now,
  };
}

/**
 * Seed volcano list if empty (upsert, loud on unexpected format).
 * - No silent catch
 * - Uses bulkWrite upsert to avoid unique-index issues
 */
async function ensureVolcanoListCached() {
  const existing = await Volcano.estimatedDocumentCount();
  if (existing > 0) return { ok: true, seeded: false, count: existing };

  const url = "https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP";
  const payload = await httpGetJson(url, 60000);
  const rows = pickRows(payload);

  if (!rows) {
    const keys =
      payload && typeof payload === "object" ? Object.keys(payload) : typeof payload;
    throw new Error(`[seed] unexpected volcano list format. keys=${JSON.stringify(keys)}`);
  }

  const now = new Date();
  const docs = [];
  let skipped = 0;

  for (const r of rows) {
    const d = mapVolcanoRow(r, now);
    if (!d) skipped++;
    else docs.push(d);
  }

  if (!docs.length) {
    console.error("[seed] got 0 usable volcano docs. sample row:", rows[0]);
    throw new Error("[seed] 0 usable volcano docs after parsing");
  }

  const ops = docs.map((d) => ({
    updateOne: {
      filter: { vnum: d.vnum },
      update: { $set: d },
      upsert: true,
    },
  }));

  const result = await Volcano.bulkWrite(ops, { ordered: false });
  await Meta.updateOne(
    { key: "volcanoes_last_sync" },
    { $set: { value: now.toISOString() } },
    { upsert: true }
  );

  const finalCount = await Volcano.countDocuments();
  console.log("[seed] volcano upserts:", {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    matched: result.matchedCount,
    skipped,
    total: finalCount,
  });

  return { ok: true, seeded: true, count: finalCount };
}

// -------------------- USGS VHP status --------------------
// https://volcanoes.usgs.gov/vsc/api/volcanoApi/vhpstatus/<vnum>
async function fetchVhpStatus(vnum) {
  const url = `https://volcanoes.usgs.gov/vsc/api/volcanoApi/vhpstatus/${encodeURIComponent(
    String(vnum)
  )}`;
  return httpGetJson(url, 30000);
}

// -------------------- HANS elevated volcanoes (cache mémoire 5 min) --------------------
let hansCache = { elevated: null, fetchedAt: 0 };

async function fetchHanselevated() {
  const now = Date.now();
  const ttlMs = 5 * 60 * 1000;

  if (hansCache.elevated && now - hansCache.fetchedAt < ttlMs) {
    return {
      elevated: hansCache.elevated,
      fetchedAt: new Date(hansCache.fetchedAt).toISOString(),
      cache: "hit",
    };
  }

  const url =
    "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes";
  const elevated = await httpGetJson(url, 30000);
  hansCache = { elevated, fetchedAt: now };

  return { elevated, fetchedAt: new Date(now).toISOString(), cache: "miss" };
}

// -------------------- USGS Earthquakes (FDSN Event) --------------------
function buildEventQueryUrl({ lat, lon, radiusKm, minmag, start, end, orderby }) {
  const params = new URLSearchParams({
    format: "geojson",
    latitude: String(lat),
    longitude: String(lon),
    maxradiuskm: String(radiusKm),
    minmagnitude: String(minmag),
    starttime: start,
    endtime: end,
    orderby: orderby || "time",
    limit: "20000",
  });
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`;
}

function isEndRecent(endIsoDate) {
  const endDate = new Date(endIsoDate + "T23:59:59Z");
  return Date.now() - endDate.getTime() < 2 * 24 * 60 * 60 * 1000;
}

async function shouldFetchWindow({ windowKey, endIsoDate, ttlMs }) {
  const meta = await Meta.findOne({ key: windowKey }).lean();
  if (!meta) return { yes: true, reason: "no_meta", meta: null };

  const last = meta?.value?.fetchedAt ? new Date(meta.value.fetchedAt) : null;
  if (last && Date.now() - last.getTime() < ttlMs) {
    return { yes: false, reason: "ttl", meta };
  }

  // If the window includes very recent days, allow refresh even if meta exists
  if (isEndRecent(endIsoDate)) return { yes: true, reason: "recent_end", meta };

  return { yes: false, reason: "cache", meta };
}

/**
 * Fetch earthquakes near a volcano for [start,end] and cache results in QuakeEvent.
 * - Chunked by maxDaysPerChunk to avoid huge queries
 * - bulkWrite per chunk for performance
 * - Window cache tracked in Meta (key = windowKey) with TTL
 */
async function fetchEarthquakesAndCache({
  volcano,
  start,
  end,
  radiusKm,
  minmag,
  cacheTtlMs = 5 * 60 * 1000,
  maxDaysPerChunk = 31,
}) {
  const vnum = String(volcano?.vnum || "").trim();
  if (!vnum) throw new Error("fetchEarthquakesAndCache: volcano.vnum missing");

  const lat = safeNumber(volcano?.lat);
  const lon = safeNumber(volcano?.lon);

  if (lat === null || lon === null) {
    throw new Error(
      `Volcano coords missing for vnum=${vnum} (lat=${volcano?.lat}, lon=${volcano?.lon})`
    );
  }

  const windowKey = `eq:${vnum}:${start}:${end}:r${radiusKm}:m${minmag}`;

  const gate = await shouldFetchWindow({
    windowKey,
    endIsoDate: end,
    ttlMs: cacheTtlMs,
  });
  if (!gate.yes) return { fetched: false, stats: { reason: gate.reason, windowKey } };

  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T23:59:59Z");
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
    throw new Error(`Invalid start/end date: start=${start} end=${end}`);
  }
  if (startD > endD) throw new Error("start must be <= end");

  let cursor = new Date(startD);
  let totalFetched = 0;
  let totalOps = 0;
  let chunks = 0;

  while (cursor <= endD) {
    chunks += 1;

    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(
      Math.min(endD.getTime(), chunkStart.getTime() + maxDaysPerChunk * 86400000)
    );

    const s = isoDate(chunkStart);
    const e = isoDate(chunkEnd);

    const url = buildEventQueryUrl({
      lat,
      lon,
      radiusKm,
      minmag,
      start: s,
      end: e,
      orderby: "time",
    });

    const data = await httpGetJson(url, 60000);
    const features = Array.isArray(data?.features) ? data.features : [];
    totalFetched += features.length;

    const bulk = [];

    for (const f of features) {
      const eventId = f?.id != null ? String(f.id) : null;
      if (!eventId) continue;

      const props = f?.properties || {};
      const coords = f?.geometry?.coordinates || [];

      const evLon = Array.isArray(coords) && coords.length > 0 ? safeNumber(coords[0]) : null;
      const evLat = Array.isArray(coords) && coords.length > 1 ? safeNumber(coords[1]) : null;

      const time = props?.time != null ? new Date(props.time) : null;
      if (!time || Number.isNaN(time.getTime())) continue;

      const doc = {
        eventId,
        volcanoVnum: vnum,
        time,
        mag: typeof props.mag === "number" ? props.mag : null,
        place: props.place || null,
        depthKm: parseDepthKm(f),
        lat: evLat,
        lon: evLon,
        url: props.url || null,
        radiusKm,
        minmag,
        raw: {
          type: f?.type,
          id: f?.id,
          properties: {
            time: f?.properties?.time ?? null,
            updated: f?.properties?.updated ?? null,
            mag: f?.properties?.mag ?? null,
            place: f?.properties?.place ?? null,
            tz: f?.properties?.tz ?? null,
            felt: f?.properties?.felt ?? null,
            cdi: f?.properties?.cdi ?? null,
            mmi: f?.properties?.mmi ?? null,
            alert: f?.properties?.alert ?? null,
            status: f?.properties?.status ?? null,
            tsunami: f?.properties?.tsunami ?? null,
            sig: f?.properties?.sig ?? null,
            net: f?.properties?.net ?? null,
            code: f?.properties?.code ?? null,
            ids: f?.properties?.ids ?? null,
            sources: f?.properties?.sources ?? null,
            types: f?.properties?.types ?? null,
            nst: f?.properties?.nst ?? null,
            dmin: f?.properties?.dmin ?? null,
            rms: f?.properties?.rms ?? null,
            gap: f?.properties?.gap ?? null,
            magType: f?.properties?.magType ?? null,
            type: f?.properties?.type ?? null,
            url: f?.properties?.url ?? null,
            detail: f?.properties?.detail ?? null,
          },
          geometry: f?.geometry ?? null, // coords + depth
        },
      };

      bulk.push({
        updateOne: {
          filter: { eventId, volcanoVnum: vnum, radiusKm, minmag },
          update: { $set: doc },
          upsert: true,
        },
      });
    }

    if (bulk.length) {
      await QuakeEvent.bulkWrite(bulk, { ordered: false });
      totalOps += bulk.length;
    }

    // be nice to USGS
    await sleep(150);

    cursor = new Date(chunkEnd.getTime() + 86400000);
  }

  const fetchedAt = new Date().toISOString();

  await Meta.updateOne(
    { key: windowKey },
    {
      $set: {
        value: {
          fetchedAt,
          totalFetched,
          totalOps,
          chunks,
          params: { start, end, radiusKm, minmag },
        },
      },
    },
    { upsert: true }
  );

  return { fetched: true, stats: { totalFetched, totalOps, chunks, windowKey, fetchedAt } };
}

// -------------------- Risk scoring --------------------
function mapStatusToRisk(alertLevel, colorCode) {
  const a = String(alertLevel || "").toUpperCase();
  const c = String(colorCode || "").toUpperCase();

  let score = 20;
  if (a === "ADVISORY") score = 45;
  if (a === "WATCH") score = 65;
  if (a === "WARNING") score = 85;

  if (c === "YELLOW") score = Math.max(score, 45);
  if (c === "ORANGE") score = Math.max(score, 65);
  if (c === "RED") score = Math.max(score, 85);

  const color =
    score >= 80 ? "red" : score >= 60 ? "orange" : score >= 40 ? "yellow" : "green";

  return { score, color, basis: "usgs_status" };
}

function heuristicRiskFromSeismicity({ n7, n30, mmax7, shallowMedian }) {
  let score = 20;

  const m = Number(mmax7 || 0);
  if (m >= 4.5) score += 35;
  else if (m >= 3.5) score += 20;
  else if (m >= 2.5) score += 10;

  // Compare last 7 days vs background rate in last 30 days
  const ratio = n30 > 0 ? n7 / ((n30 / 30) * 7) : n7 > 0 ? 3 : 1;

  if (ratio >= 4) score += 35;
  else if (ratio >= 2) score += 20;
  else if (ratio >= 1.5) score += 10;

  if (shallowMedian !== null) {
    if (shallowMedian <= 3) score += 15;
    else if (shallowMedian <= 7) score += 8;
  }

  score = clamp(score, 0, 95);
  const color =
    score >= 80 ? "red" : score >= 60 ? "orange" : score >= 40 ? "yellow" : "green";

  return { score, color, basis: "seismic_heuristic" };
}

function confidenceLabel({ totalEvents, daysSpan, hasOfficialStatus, endIsRecent }) {
  let score = 0;
  if (hasOfficialStatus) score += 2;
  if (endIsRecent) score += 1;

  if (totalEvents >= 200) score += 2;
  else if (totalEvents >= 50) score += 1;

  if (daysSpan >= 365) score += 1;

  if (score >= 5) return "élevée";
  if (score >= 3) return "moyenne";
  return "faible";
}

/**
 * Compute indicators + risk badge from cached QuakeEvent + optional VHP status.
 * Assumes you already called fetchEarthquakesAndCache() for the same window.
 */
async function computeIndicatorsAndRisk({ volcano, start, end, radiusKm, minmag }) {
  const vnum = String(volcano?.vnum || "").trim();
  if (!vnum) throw new Error("computeIndicatorsAndRisk: volcano.vnum missing");

  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T23:59:59Z");
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
    throw new Error(`Invalid start/end date: start=${start} end=${end}`);
  }

  const daysSpan = Math.max(1, Math.round((endD - startD) / 86400000));

  // Pull events only for this query/window
  const events = await QuakeEvent.find({
    volcanoVnum: vnum,
    radiusKm,
    minmag,
    time: { $gte: startD, $lte: endD },
  }).lean();

  const mags = events.map((e) => e.mag).filter((x) => typeof x === "number");
  const depths = events.map((e) => e.depthKm).filter((x) => typeof x === "number");

  const mmax = mags.length ? Math.max(...mags) : null;
  const depthMedian = median(depths);

  const endIsRecentFlag = isEndRecent(end);

  const d7 = new Date(endD.getTime() - 7 * 86400000);
  const d30 = new Date(endD.getTime() - 30 * 86400000);

  const events7 = events.filter((e) => e.time >= d7);
  const events30 = events.filter((e) => e.time >= d30);

  const n7 = events7.length;
  const n30 = events30.length;

  const mags7 = events7.map((e) => e.mag).filter((x) => typeof x === "number");
  const mmax7 = mags7.length ? Math.max(...mags7) : null;

  const shallowMedian = median(
    events7.map((e) => e.depthKm).filter((x) => typeof x === "number")
  );

  // Best-effort official status
  let vhp = null;
  try {
    vhp = await fetchVhpStatus(vnum);
  } catch {
    vhp = null;
  }

  const hasOfficial =
    vhp &&
    (vhp.alertLevel || vhp.colorCode) &&
    String(vhp.alertLevel || "").toUpperCase() !== "UNASSIGNED";

  let risk;
  if (hasOfficial) {
    risk = mapStatusToRisk(vhp.alertLevel, vhp.colorCode);

    // blend in a small seismic adjustment (keeps official status dominant)
    const h = heuristicRiskFromSeismicity({
      n7,
      n30,
      mmax7: mmax7 ?? 0,
      shallowMedian,
    });

    risk.score = clamp(risk.score + (h.score - 20) * 0.15, 0, 100);
    risk.color =
      risk.score >= 80 ? "red" : risk.score >= 60 ? "orange" : risk.score >= 40 ? "yellow" : "green";
    risk.basis = "usgs_status_plus_seismic";
  } else {
    risk = heuristicRiskFromSeismicity({
      n7,
      n30,
      mmax7: mmax7 ?? 0,
      shallowMedian,
    });
  }

  const confidence = confidenceLabel({
    totalEvents: events.length,
    daysSpan,
    hasOfficialStatus: hasOfficial,
    endIsRecent: endIsRecentFlag,
  });

  const tooltips = {
    n_total:
      "Nombre total de séismes détectés près du volcan (dans le rayon choisi) sur la période sélectionnée.",
    n7:
      "Nombre de séismes détectés sur les 7 derniers jours (dans la période affichée). Une hausse rapide peut signaler une évolution.",
    n30:
      "Nombre de séismes détectés sur les 30 derniers jours (dans la période affichée). Sert de référence de fond.",
    mmax:
      "Magnitude maximale sur la période. Une hausse de la magnitude peut refléter une fracturation plus énergique, mais n'implique pas forcément une éruption.",
    depth_median:
      "Profondeur médiane des séismes (km). Des séismes plus superficiels peuvent être plus directement liés aux processus volcaniques.",
    risk_badge:
      "Pastille de risque (heuristique). Si un statut officiel USGS est disponible, il est prioritaire; sinon, la pastille repose surtout sur des variations de sismicité. Ce n'est pas une prévision.",
    confidence:
      "Confiance de l'estimation: dépend de la couverture des données, du volume d'événements et de la fraîcheur de mise à jour.",
  };

  return {
    volcano: {
      vnum,
      vName: volcano?.vName || null,
      lat: safeNumber(volcano?.lat),
      lon: safeNumber(volcano?.lon),
    },
    query: { start, end, radiusKm, minmag },
    indicators: {
      n_total: events.length,
      days_span: daysSpan,
      n_per_day: Number((events.length / daysSpan).toFixed(3)),
      n7,
      n30,
      mmax,
      mmax7,
      depth_median_km: depthMedian,
      depth_median_7d_km: shallowMedian,
    },
    official_status: hasOfficial ? vhp : null,
    risk_badge: {
      color: risk.color,
      score_0_100: Number(risk.score.toFixed(1)),
      basis: risk.basis,
    },
    confidence,
    tooltips,
    computedAt: new Date().toISOString(),
  };
}

module.exports = {
  ensureVolcanoListCached,
  fetchVhpStatus,
  fetchHanselevated,
  fetchEarthquakesAndCache,
  computeIndicatorsAndRisk,
};
