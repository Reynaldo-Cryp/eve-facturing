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
const SSO_AUTH = "https://login.eveonline.com/v2/oauth/authorize";
const SSO_TOKEN = "https://login.eveonline.com/v2/oauth/token";
const REFRESH_INTERVAL_MS = 60_000;

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

const ORE_TYPE_IDS = {
  Veldspar: 1230,
  Scordite: 1228,
  Plagioclase: 18,
  Pyroxeres: 1224,
  Kernite: 20,
  Omber: 1227
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

function extractMarketPrices(pricesRows) {
  const byId = new Map();
  if (Array.isArray(pricesRows)) {
    for (const row of pricesRows) {
      byId.set(Number(row.type_id), row);
    }
  }

  const ores = {};
  for (const [name, typeId] of Object.entries(ORE_TYPE_IDS)) {
    const market = byId.get(typeId);
    if (market) {
      ores[name] = {
        rawPricePerM3: Number(market.adjusted_price || market.average_price || 0),
        compressedPricePerM3: Number(market.average_price || market.adjusted_price || 0) * 1.09,
        refinedValuePerM3: Number(market.average_price || market.adjusted_price || 0) * 1.21
      };
    }
  }

  const plexRow = byId.get(PLEX_TYPE_ID);
  return {
    ores,
    plexPrice: plexRow ? Number(plexRow.average_price || plexRow.adjusted_price || 0) : null
  };
}

async function pullLiveSnapshot() {
  if (!live.token?.characterId) {
    live.auth = {
      connected: false,
      characterId: null
    };
    return;
  }

  const characterId = Number(live.token.characterId);
  live.auth = {
    connected: true,
    characterId
  };

  const [charInfo, skills, skillQueue, wallet, orders, jobs, mining, assets, prices] = await Promise.all([
    esiRequest(`/characters/${characterId}/`, { auth: true }),
    esiRequest(`/characters/${characterId}/skills/`, { auth: true }),
    esiRequest(`/characters/${characterId}/skillqueue/`, { auth: true }),
    esiRequest(`/characters/${characterId}/wallet/`, { auth: true }),
    esiRequest(`/characters/${characterId}/orders/`, { auth: true }),
    esiRequest(`/characters/${characterId}/industry/jobs/`, { auth: true, query: { include_completed: true } }),
    esiRequest(`/characters/${characterId}/mining/`, { auth: true }),
    esiRequest(`/characters/${characterId}/assets/`, { auth: true }),
    esiRequest(`/markets/prices/`, { auth: false })
  ]);

  const skillLevels = mapCoreSkills(skills);
  const miningSummary = summarizeMining(mining);
  const ordersSummary = summarizeOrders(orders);
  const industrySummary = summarizeIndustry(jobs);
  const marketSummary = extractMarketPrices(prices);

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
