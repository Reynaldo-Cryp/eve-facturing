"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const BASE_DIR = __dirname;
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join("/tmp", "eve-wealth-os") : path.join(BASE_DIR, ".data");
const TOKEN_PATH = path.join(DATA_DIR, "eve-token.json");
const USER_AGENT = "eve-wealth-os-live/1.0";

const ESI_BASE = "https://esi.evetech.net/latest";
const EVE_TYCOON_BASE = process.env.EVE_TYCOON_BASE || "https://evetycoon.com";
const SSO_AUTH = "https://login.eveonline.com/v2/oauth/authorize";
const SSO_TOKEN = "https://login.eveonline.com/v2/oauth/token";
const REFRESH_INTERVAL_MS = 60_000;
const MARKET_REFRESH_MS = 5 * 60 * 1000;
const MARKET_REGION_ID = Number(process.env.EVE_MARKET_REGION_ID || 10000002);

const CHARACTER_SKILL_MAP = {
  3380: "mining", // Mining
  3413: "astrogeology", // Astrogeology
  3385: "reprocessing", // Reprocessing
  3388: "industry", // Industry
  3387: "massProduction", // Mass Production
  16622: "accounting", // Accounting
  3446: "brokerRelations", // Broker Relations
  24268: "supplyChain" // Supply Chain Management
};

const ORE_MARKET_META = {
  Veldspar: {
    rawTypeId: 1230,
    compressedTypeId: 28432,
    unitVolume: 0.1,
    unitsPerCompressed: 100,
    refinePremium: 1.09
  },
  Scordite: {
    rawTypeId: 1228,
    compressedTypeId: 28429,
    unitVolume: 0.15,
    unitsPerCompressed: 100,
    refinePremium: 1.11
  },
  Plagioclase: {
    rawTypeId: 18,
    compressedTypeId: 28422,
    unitVolume: 0.35,
    unitsPerCompressed: 100,
    refinePremium: 1.12
  },
  Pyroxeres: {
    rawTypeId: 1224,
    compressedTypeId: 28424,
    unitVolume: 0.3,
    unitsPerCompressed: 100,
    refinePremium: 1.13
  },
  Kernite: {
    rawTypeId: 20,
    compressedTypeId: 28410,
    unitVolume: 1.2,
    unitsPerCompressed: 100,
    refinePremium: 1.15
  },
  Omber: {
    rawTypeId: 1227,
    compressedTypeId: 28416,
    unitVolume: 0.6,
    unitsPerCompressed: 100,
    refinePremium: 1.16
  }
};

const MINERAL_TYPE_IDS = {
  Tritanium: 34,
  Pyerite: 35,
  Mexallon: 36,
  Isogen: 37,
  Nocxium: 38,
  Zydrine: 39,
  Megacyte: 40
};

const MINERAL_BASELINE_PRICES = {
  Tritanium: 5.4,
  Pyerite: 11.2,
  Mexallon: 63,
  Isogen: 125,
  Nocxium: 860,
  Zydrine: 2700,
  Megacyte: 2100
};

const MINERAL_INDEX_WEIGHTS = {
  Tritanium: 0.42,
  Pyerite: 0.24,
  Mexallon: 0.15,
  Isogen: 0.1,
  Nocxium: 0.06,
  Zydrine: 0.02,
  Megacyte: 0.01
};

const INDUSTRY_PRODUCT_TYPE_IDS = {
  "Antimatter Charge M": 230,
  "Scourge Heavy Missile": 209,
  "Inferno Heavy Missile": 208,
  "Nanite Repair Paste": 28668,
  "Hobgoblin I": 2454,
  "Hammerhead I": 2183,
  "Warrior I": 2486,
  "Acolyte I": 2203,
  "Vespa I": 15508,
  "Hornet I": 2464,
  "Valkyrie I": 15510,
  "Ogre I": 2444,
  "Small Shield Extender II": 380,
  "Medium Shield Extender II": 3831,
  "Large Shield Extender II": 3841,
  "400mm Steel Plates I": 11297,
  "1600mm Steel Plates I": 11279,
  "Damage Control II": 2048,
  "Multispectrum Shield Hardener II": 2281,
  "Warp Disruptor II": 3244,
  "Stasis Webifier II": 527,
  "Co-Processor II": 3888,
  "Power Diagnostic System II": 1541,
  "Capacitor Power Relay II": 1447,
  "Cap Recharger II": 2032,
  "Signal Amplifier II": 1987,
  "Gyrostabilizer II": 519,
  "Magnetic Field Stabilizer II": 10190,
  "Heat Sink II": 2364,
  "Ballistic Control System II": 22291,
  "Shield Power Relay II": 1422,
  "Drone Damage Amplifier II": 4405
};

const INDUSTRY_PRODUCT_BASELINES = {
  "Antimatter Charge M": 1110000,
  "Hobgoblin I": 620000,
  "Small Shield Extender II": 1460000,
  "400mm Steel Plates I": 1820000,
  "Damage Control II": 6200000
};

const PLEX_TYPE_ID = 44992;
const AUTH_SCOPES = [
  "esi-skills.read_skills.v1",
  "esi-skills.read_skillqueue.v1",
  "esi-wallet.read_character_wallet.v1",
  "esi-assets.read_assets.v1",
  "esi-industry.read_character_jobs.v1",
  "esi-industry.read_character_mining.v1",
  "esi-markets.read_character_orders.v1",
  "esi-characters.read_blueprints.v1"
];

const oauthStates = new Map();
const marketStatsCache = new Map();
const live = {
  startedAt: new Date().toISOString(),
  auth: {
    connected: false,
    characterId: null
  },
  snapshot: null,
  lastUpdatedAt: null,
  lastError: null,
  token: null
};

async function loadDotEnvFile() {
  const envPath = path.join(BASE_DIR, ".env");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (_error) {
    // no .env is fine
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function getEnv() {
  const clientId = process.env.EVE_CLIENT_ID || "";
  const clientSecret = process.env.EVE_CLIENT_SECRET || "";
  const callbackUrl = process.env.EVE_CALLBACK_URL || `http://${HOST}:${PORT}/auth/eve/callback`;
  return {
    clientId,
    clientSecret,
    callbackUrl,
    configured: Boolean(clientId && clientSecret)
  };
}

function parseJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch (_error) {
    return null;
  }
}

function parseCharacterIdFromJwt(accessToken) {
  const payload = parseJwtPayload(accessToken);
  if (!payload || typeof payload.sub !== "string") {
    return null;
  }
  const match = payload.sub.match(/CHARACTER:EVE:(\d+)/);
  return match ? Number(match[1]) : null;
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadTokenFromDisk() {
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function saveTokenToDisk(tokenData) {
  await ensureDataDir();
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenData, null, 2), "utf8");
}

async function clearTokenFromDisk() {
  try {
    await fs.unlink(TOKEN_PATH);
  } catch (_error) {
    // no-op
  }
}

async function exchangeCodeForToken(code) {
  const env = getEnv();
  if (!env.configured) {
    throw new Error("EVE_CLIENT_ID/EVE_CLIENT_SECRET não configurados.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code
  });

  const response = await fetch(SSO_TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT
    },
    body
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Token exchange falhou (${response.status}): ${txt.slice(0, 240)}`);
  }

  const payload = await response.json();
  const characterId = parseCharacterIdFromJwt(payload.access_token);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: Number(payload.expires_in || 0),
    obtainedAt: nowUnix(),
    characterId
  };
}

async function refreshAccessToken() {
  if (!live.token?.refreshToken) {
    throw new Error("Sem refresh token para renovar sessão.");
  }

  const env = getEnv();
  if (!env.configured) {
    throw new Error("EVE_CLIENT_ID/EVE_CLIENT_SECRET não configurados.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: live.token.refreshToken
  });

  const response = await fetch(SSO_TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT
    },
    body
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Refresh token falhou (${response.status}): ${txt.slice(0, 240)}`);
  }

  const payload = await response.json();
  live.token = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || live.token.refreshToken,
    expiresIn: Number(payload.expires_in || 0),
    obtainedAt: nowUnix(),
    characterId: parseCharacterIdFromJwt(payload.access_token) || live.token.characterId || null
  };
  await saveTokenToDisk(live.token);
}

async function getValidAccessToken() {
  if (!live.token?.accessToken) {
    return null;
  }

  const expiresAt = live.token.obtainedAt + live.token.expiresIn;
  if (expiresAt - nowUnix() < 120) {
    await refreshAccessToken();
  }

  return live.token.accessToken;
}

async function esiRequest(pathname, options = {}) {
  const token = options.auth ? await getValidAccessToken() : null;
  const url = new URL(`${ESI_BASE}${pathname}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    Accept: "application/json",
    "User-Agent": USER_AGENT
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const txt = await response.text();
    const err = new Error(`${pathname} falhou (${response.status})`);
    err.status = response.status;
    err.body = txt.slice(0, 280);
    throw err;
  }

  return response.json();
}

function mapCoreSkills(skillsPayload) {
  const mapped = {
    mining: null,
    astrogeology: null,
    reprocessing: null,
    industry: null,
    massProduction: null,
    accounting: null,
    brokerRelations: null,
    supplyChain: null
  };

  const list = Array.isArray(skillsPayload?.skills) ? skillsPayload.skills : [];
  for (const skill of list) {
    const key = CHARACTER_SKILL_MAP[skill.skill_id];
    if (key) {
      mapped[key] = Number(skill.active_skill_level || skill.trained_skill_level || 0);
    }
  }

  return mapped;
}

function summarizeMining(miningRows) {
  if (!Array.isArray(miningRows) || miningRows.length === 0) {
    return {
      entries: 0,
      quantity: 0
    };
  }
  const quantity = miningRows.reduce((acc, row) => acc + Number(row.quantity || 0), 0);
  return {
    entries: miningRows.length,
    quantity
  };
}

function summarizeOrders(ordersRows) {
  if (!Array.isArray(ordersRows)) {
    return {
      total: 0,
      active: 0,
      sell: 0,
      buy: 0
    };
  }

  const active = ordersRows.filter((row) => row.is_buy_order !== undefined).length;
  const sell = ordersRows.filter((row) => !row.is_buy_order).length;
  const buy = ordersRows.filter((row) => row.is_buy_order).length;
  return {
    total: ordersRows.length,
    active,
    sell,
    buy
  };
}

function summarizeIndustry(jobsRows) {
  if (!Array.isArray(jobsRows)) {
    return {
      total: 0,
      active: 0,
      paused: 0
    };
  }
  const active = jobsRows.filter((job) => job.status === "active").length;
  const paused = jobsRows.filter((job) => job.status === "paused").length;
  return {
    total: jobsRows.length,
    active,
    paused
  };
}

function mapEsiFallbackPrices(pricesRows) {
  const byId = new Map();
  if (Array.isArray(pricesRows)) {
    for (const row of pricesRows) {
      byId.set(Number(row.type_id), row);
    }
  }

  const prices = new Map();
  for (const [typeId, row] of byId.entries()) {
    const avg = Number(row.average_price || 0);
    const adj = Number(row.adjusted_price || 0);
    const value = avg > 0 ? avg : adj;
    if (value > 0) {
      prices.set(typeId, value);
    }
  }
  return prices;
}

function parseExpiresToMs(expiresHeader) {
  if (!expiresHeader) {
    return Date.now() + MARKET_REFRESH_MS;
  }
  const parsed = Date.parse(expiresHeader);
  return Number.isFinite(parsed) ? parsed : Date.now() + MARKET_REFRESH_MS;
}

async function fetchTycoonStats(regionId, typeId) {
  const cacheKey = `${regionId}:${typeId}`;
  const cached = marketStatsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `${EVE_TYCOON_BASE}/api/v1/market/stats/${regionId}/${typeId}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      }
    });
    if (!response.ok) {
      throw new Error(`Tycoon stats ${typeId} (${response.status})`);
    }
    const data = await response.json();
    const expiresAt = parseExpiresToMs(response.headers.get("expires"));
    marketStatsCache.set(cacheKey, { data, expiresAt });
    return data;
  } catch (error) {
    if (cached?.data) {
      return cached.data;
    }
    throw error;
  }
}

function pickTycoonPrice(stats, mode = "balanced") {
  const buy = Number(stats?.buyAvgFivePercent || 0);
  const sell = Number(stats?.sellAvgFivePercent || 0);
  if (buy <= 0 && sell <= 0) {
    return 0;
  }

  if (mode === "instant") {
    return buy > 0 ? buy : sell * 0.92;
  }
  if (mode === "patient") {
    return sell > 0 ? sell : buy * 1.04;
  }

  if (buy > 0 && sell > 0) {
    const spreadRatio = sell / Math.max(1, buy);
    if (spreadRatio > 3.2) {
      return sell * 0.74;
    }
    return buy * 0.62 + sell * 0.38;
  }

  return buy > 0 ? buy * 0.96 : sell * 0.9;
}

function safePrice(primary, fallback) {
  const p = Number(primary || 0);
  if (p > 0) {
    return p;
  }
  const f = Number(fallback || 0);
  return f > 0 ? f : 0;
}

async function extractMarketPrices(pricesRows, regionId = MARKET_REGION_ID) {
  const esiFallback = mapEsiFallbackPrices(pricesRows);
  const typeIds = new Set([PLEX_TYPE_ID]);
  Object.values(MINERAL_TYPE_IDS).forEach((id) => typeIds.add(id));
  Object.values(ORE_MARKET_META).forEach((meta) => {
    typeIds.add(meta.rawTypeId);
    typeIds.add(meta.compressedTypeId);
  });
  Object.values(INDUSTRY_PRODUCT_TYPE_IDS).forEach((id) => typeIds.add(id));

  const tycoonStatsByType = new Map();
  await Promise.all(
    Array.from(typeIds).map(async (typeId) => {
      try {
        const stats = await fetchTycoonStats(regionId, typeId);
        tycoonStatsByType.set(typeId, stats);
      } catch (_error) {
        // fallback to ESI later
      }
    })
  );

  function resolveUnitPrice(typeId, mode = "balanced") {
    const stats = tycoonStatsByType.get(typeId);
    const tycoonPrice = pickTycoonPrice(stats, mode);
    const fallbackPrice = esiFallback.get(typeId) || 0;
    if (tycoonPrice > 0) {
      return { price: tycoonPrice, source: "tycoon" };
    }
    return {
      price: fallbackPrice,
      source: fallbackPrice > 0 ? "esi-fallback" : "missing"
    };
  }

  const mineralPrices = {};
  const mineralSources = {};
  for (const [name, typeId] of Object.entries(MINERAL_TYPE_IDS)) {
    const resolved = resolveUnitPrice(typeId, "balanced");
    mineralPrices[name] = resolved.price;
    mineralSources[name] = resolved.source;
  }

  let mineralWeighted = 0;
  let mineralWeightTotal = 0;
  for (const [name, baseline] of Object.entries(MINERAL_BASELINE_PRICES)) {
    const current = Number(mineralPrices[name] || 0);
    const weight = Number(MINERAL_INDEX_WEIGHTS[name] || 0);
    if (current > 0 && baseline > 0 && weight > 0) {
      mineralWeighted += (current / baseline) * weight;
      mineralWeightTotal += weight;
    }
  }

  const mineralIndex =
    mineralWeightTotal > 0 ? Math.min(Math.max(mineralWeighted / mineralWeightTotal, 0.65), 1.7) : 1;

  const ores = {};
  let oreCoverageCount = 0;
  for (const [name, meta] of Object.entries(ORE_MARKET_META)) {
    const rawResolved = resolveUnitPrice(meta.rawTypeId, "balanced");
    const compressedResolved = resolveUnitPrice(meta.compressedTypeId, "balanced");
    const rawUnitPrice = rawResolved.price;
    if (rawUnitPrice <= 0 || meta.unitVolume <= 0) {
      continue;
    }

    oreCoverageCount += 1;
    const compressedUnitPrice = compressedResolved.price;
    const rawPricePerM3 = rawUnitPrice / meta.unitVolume;
    const compressedPricePerM3 =
      compressedUnitPrice > 0
        ? compressedUnitPrice / (meta.unitVolume * meta.unitsPerCompressed)
        : rawPricePerM3 * 1.03;
    const refinedValuePerM3 = rawPricePerM3 * meta.refinePremium * Math.min(Math.max(mineralIndex, 0.8), 1.35);

    ores[name] = {
      rawPricePerUnit: rawUnitPrice,
      compressedPricePerUnit: compressedUnitPrice > 0 ? compressedUnitPrice : null,
      rawPricePerM3,
      compressedPricePerM3,
      refinedValuePerM3,
      source:
        rawResolved.source === "tycoon" || compressedResolved.source === "tycoon"
          ? "tycoon"
          : compressedUnitPrice > 0
            ? "esi-fallback"
            : "estimated"
    };
  }

  const products = {};
  const productRatios = [];
  for (const [name, typeId] of Object.entries(INDUSTRY_PRODUCT_TYPE_IDS)) {
    const sellResolved = resolveUnitPrice(typeId, "patient");
    const instantResolved = resolveUnitPrice(typeId, "instant");
    const marketResolved = resolveUnitPrice(typeId, "balanced");
    const sellPrice = sellResolved.price;
    if (sellPrice > 0) {
      products[name] = {
        sellPrice,
        instantSellPrice: instantResolved.price,
        marketPrice: marketResolved.price,
        source: sellResolved.source
      };
      const baseline = Number(INDUSTRY_PRODUCT_BASELINES[name] || 0);
      if (baseline > 0) {
        productRatios.push(sellPrice / baseline);
      }
    }
  }

  const productIndex = productRatios.length
    ? Math.min(Math.max(productRatios.reduce((acc, value) => acc + value, 0) / productRatios.length, 0.7), 1.8)
    : 1;

  const plexResolved = resolveUnitPrice(PLEX_TYPE_ID, "patient");
  const plexPrice = safePrice(plexResolved.price, esiFallback.get(PLEX_TYPE_ID));
  const tycoonTypeCoverage = typeIds.size ? tycoonStatsByType.size / typeIds.size : 0;

  return {
    ores,
    minerals: mineralPrices,
    mineralSources,
    mineralIndex,
    products,
    productIndex,
    oreCoverage: Object.keys(ORE_MARKET_META).length
      ? oreCoverageCount / Object.keys(ORE_MARKET_META).length
      : 0,
    typeCoverage: tycoonTypeCoverage,
    regionId,
    plexPrice: plexPrice > 0 ? plexPrice : null
  };
}

async function fetchPublicMarketSummary() {
  const prices = await esiRequest(`/markets/prices/`, { auth: false });
  return extractMarketPrices(prices, MARKET_REGION_ID);
}

async function pullLiveSnapshot() {
  if (!live.token?.characterId) {
    live.auth = {
      connected: false,
      characterId: null
    };
    const marketSummary = await fetchPublicMarketSummary();
    live.snapshot = {
      source: "market-only",
      updatedAt: new Date().toISOString(),
      market: marketSummary
    };
    live.lastUpdatedAt = live.snapshot.updatedAt;
    live.lastError = null;
    return;
  }

  const characterId = Number(live.token.characterId);
  live.auth = {
    connected: true,
    characterId
  };

  const [charInfo, skills, skillQueue, wallet, orders, jobs, mining, assets, marketSummary] = await Promise.all([
    esiRequest(`/characters/${characterId}/`, { auth: true }),
    esiRequest(`/characters/${characterId}/skills/`, { auth: true }),
    esiRequest(`/characters/${characterId}/skillqueue/`, { auth: true }),
    esiRequest(`/characters/${characterId}/wallet/`, { auth: true }),
    esiRequest(`/characters/${characterId}/orders/`, { auth: true }),
    esiRequest(`/characters/${characterId}/industry/jobs/`, { auth: true, query: { include_completed: true } }),
    esiRequest(`/characters/${characterId}/mining/`, { auth: true }),
    esiRequest(`/characters/${characterId}/assets/`, { auth: true }),
    fetchPublicMarketSummary()
  ]);

  const skillLevels = mapCoreSkills(skills);
  const miningSummary = summarizeMining(mining);
  const ordersSummary = summarizeOrders(orders);
  const industrySummary = summarizeIndustry(jobs);

  live.snapshot = {
    source: "esi-live",
    updatedAt: new Date().toISOString(),
    character: {
      id: characterId,
      name: charInfo?.name || `Character ${characterId}`,
      corporationId: Number(charInfo?.corporation_id || 0)
    },
    wallet: {
      balance: Number(wallet || 0)
    },
    skills: skillLevels,
    skillQueue: {
      entries: Array.isArray(skillQueue) ? skillQueue.length : 0
    },
    orders: ordersSummary,
    industry: industrySummary,
    assets: {
      totalRows: Array.isArray(assets) ? assets.length : 0
    },
    mining: miningSummary,
    market: marketSummary
  };

  live.lastUpdatedAt = live.snapshot.updatedAt;
  live.lastError = null;
}

async function refreshLiveLoop() {
  try {
    await pullLiveSnapshot();
  } catch (error) {
    live.lastError = `${error.message || "erro desconhecido"}${error.body ? ` | ${error.body}` : ""}`;
  }
}

function json(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  if (filePath.includes("..")) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const absolute = path.join(BASE_DIR, filePath);
  try {
    const raw = await fs.readFile(absolute);
    const ext = path.extname(absolute);
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": raw.length
    });
    res.end(raw);
  } catch (_error) {
    res.writeHead(404);
    res.end("Not found");
  }
}

function buildAuthStartUrl() {
  const env = getEnv();
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);

  const url = new URL(SSO_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.callbackUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("scope", AUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

function cleanExpiredOauthStates() {
  const now = Date.now();
  for (const [key, expiresAt] of oauthStates.entries()) {
    if (expiresAt < now) {
      oauthStates.delete(key);
    }
  }
}

async function handleAuthStart(_req, res) {
  const env = getEnv();
  if (!env.configured) {
    json(res, 500, {
      error: "Configuração SSO ausente",
      hint: "Define EVE_CLIENT_ID e EVE_CLIENT_SECRET antes de conectar."
    });
    return;
  }

  cleanExpiredOauthStates();
  const url = buildAuthStartUrl();
  res.writeHead(302, { Location: url });
  res.end();
}

async function handleAuthCallback(reqUrl, res) {
  const state = reqUrl.searchParams.get("state");
  const code = reqUrl.searchParams.get("code");

  cleanExpiredOauthStates();
  if (!state || !oauthStates.has(state)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("State OAuth inválido.");
    return;
  }
  oauthStates.delete(state);

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Código de autorização ausente.");
    return;
  }

  try {
    live.token = await exchangeCodeForToken(code);
    await saveTokenToDisk(live.token);
    await refreshLiveLoop();
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Falha ao autenticar no EVE SSO: ${error.message}`);
  }
}

async function handleLogout(res) {
  live.token = null;
  live.snapshot = null;
  live.auth = {
    connected: false,
    characterId: null
  };
  live.lastError = null;
  await clearTokenFromDisk();
  json(res, 200, { ok: true });
}

function statusPayload() {
  const env = getEnv();
  return {
    mode: live.snapshot?.source ? "live" : "offline",
    snapshotSource: live.snapshot?.source || null,
    envConfigured: env.configured,
    authConnected: live.auth.connected,
    characterId: live.auth.characterId,
    startedAt: live.startedAt,
    lastUpdatedAt: live.lastUpdatedAt,
    lastError: live.lastError
  };
}

let initPromise = null;
let refreshTimerStarted = false;

async function initializeRuntime() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (!IS_VERCEL) {
      await loadDotEnvFile();
    }

    await ensureDataDir();
    const token = await loadTokenFromDisk();
    if (token) {
      live.token = token;
      live.auth.connected = Boolean(token.characterId);
      live.auth.characterId = token.characterId || null;
    }

    await refreshLiveLoop();

    if (!IS_VERCEL && !refreshTimerStarted) {
      setInterval(refreshLiveLoop, REFRESH_INTERVAL_MS).unref();
      refreshTimerStarted = true;
    }
  })();

  return initPromise;
}

function buildRequestUrl(req) {
  const host = req.headers?.host || `${HOST}:${PORT}`;
  return new URL(req.url || "/", `http://${host}`);
}

function shouldRefreshSnapshot() {
  if (!live.lastUpdatedAt) {
    return true;
  }
  const updatedAt = Date.parse(live.lastUpdatedAt);
  if (Number.isNaN(updatedAt)) {
    return true;
  }
  return Date.now() - updatedAt > REFRESH_INTERVAL_MS;
}

async function requestHandler(req, res) {
  try {
    await initializeRuntime();

    const reqUrl = buildRequestUrl(req);
    const pathname = reqUrl.pathname;

    if (pathname === "/api/status" && req.method === "GET") {
      json(res, 200, statusPayload());
      return;
    }

    if (pathname === "/api/snapshot" && req.method === "GET") {
      if (IS_VERCEL && shouldRefreshSnapshot()) {
        await refreshLiveLoop();
      }
      json(res, 200, {
        status: statusPayload(),
        snapshot: live.snapshot
      });
      return;
    }

    if (pathname === "/api/refresh" && req.method === "POST") {
      await refreshLiveLoop();
      json(res, 200, { ok: true, status: statusPayload() });
      return;
    }

    if (pathname === "/auth/eve/start" && req.method === "GET") {
      await handleAuthStart(req, res);
      return;
    }

    if (pathname === "/auth/eve/callback" && req.method === "GET") {
      await handleAuthCallback(reqUrl, res);
      return;
    }

    if (pathname === "/auth/eve/logout" && (req.method === "POST" || req.method === "GET")) {
      await handleLogout(res);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Erro no handler:", error);
    json(res, 500, {
      error: "internal_error",
      message: error?.message || "Erro interno"
    });
  }
}

async function startLocalServer() {
  await initializeRuntime();
  const server = http.createServer((req, res) => {
    requestHandler(req, res);
  });

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`EVE Wealth OS live server running at http://${HOST}:${PORT}`);
  });
}

if (IS_VERCEL) {
  module.exports = requestHandler;
} else {
  startLocalServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Falha ao iniciar servidor:", error);
    process.exit(1);
  });
}
