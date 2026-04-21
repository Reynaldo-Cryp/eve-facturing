"use strict";

const STORAGE_KEY = "eve-wealth-os-v3";
const LIVE_POLL_MS = 15000;

const liveCache = {
  status: null,
  snapshot: null,
  oreOverrides: {},
  pollTimer: null
};

const SKILL_LABELS = {
  mining: "Mining",
  astrogeology: "Astrogeology",
  reprocessing: "Reprocessing",
  industry: "Industry",
  massProduction: "Mass Production",
  accounting: "Accounting",
  brokerRelations: "Broker Relations",
  supplyChain: "Supply Chain"
};

const TRAINING_STEP_HOURS = {
  mining: [0, 4, 10, 18, 30, 46],
  astrogeology: [0, 5, 12, 20, 33, 50],
  reprocessing: [0, 4, 9, 17, 28, 44],
  industry: [0, 3, 8, 15, 24, 38],
  massProduction: [0, 4, 10, 20, 34, 52],
  accounting: [0, 5, 12, 24, 42, 64],
  brokerRelations: [0, 5, 13, 24, 41, 62],
  supplyChain: [0, 3, 8, 16, 27, 41]
};

const DEFAULT_STATE = {
  skills: {
    mining: 4,
    astrogeology: 3,
    reprocessing: 3,
    industry: 3,
    massProduction: 2,
    accounting: 2,
    brokerRelations: 2,
    supplyChain: 1
  },
  playHours: 3,
  baseYield: 18500,
  logisticsCost: 4.5,
  industryFee: 3.2,
  miningShare: 70,
  miningShip: "hulk",
  supportShip: "porpoise",
  burstLevel: 4,
  plexGoal: 500,
  plexPrice: 5600000,
  wallet: 600000000,
  reinvestRate: 35
};

const MINING_SHIPS = {
  hulk: {
    label: "Hulk",
    yieldMult: 1.25,
    riskMult: 1.08
  },
  mackinaw: {
    label: "Mackinaw",
    yieldMult: 1.14,
    riskMult: 0.96
  },
  covetor: {
    label: "Covetor",
    yieldMult: 1.16,
    riskMult: 1.04
  },
  retriever: {
    label: "Retriever",
    yieldMult: 1.02,
    riskMult: 0.94
  },
  procurer: {
    label: "Procurer",
    yieldMult: 0.92,
    riskMult: 0.82
  }
};

const SUPPORT_SHIPS = {
  porpoise: {
    label: "Porpoise",
    yieldBurst: 0.2,
    logisticsReduction: 1.7,
    compressionBonus: 0.065,
    refineBonus: 0.015,
    riskReduction: 0.18
  },
  orca: {
    label: "Orca",
    yieldBurst: 0.24,
    logisticsReduction: 2.1,
    compressionBonus: 0.085,
    refineBonus: 0.022,
    riskReduction: 0.25
  },
  none: {
    label: "Sem suporte",
    yieldBurst: 0,
    logisticsReduction: 0,
    compressionBonus: 0,
    refineBonus: 0,
    riskReduction: 0
  }
};

const ORES = [
  {
    name: "Veldspar",
    rawPricePerM3: 1550,
    compressedPricePerM3: 1700,
    refinedValuePerM3: 1880,
    harvestModifier: 1.12,
    risk: 0.04,
    liquidity: 0.98
  },
  {
    name: "Scordite",
    rawPricePerM3: 1680,
    compressedPricePerM3: 1820,
    refinedValuePerM3: 2050,
    harvestModifier: 1.08,
    risk: 0.05,
    liquidity: 0.96
  },
  {
    name: "Plagioclase",
    rawPricePerM3: 1730,
    compressedPricePerM3: 1880,
    refinedValuePerM3: 2130,
    harvestModifier: 1.01,
    risk: 0.06,
    liquidity: 0.92
  },
  {
    name: "Pyroxeres",
    rawPricePerM3: 1780,
    compressedPricePerM3: 1930,
    refinedValuePerM3: 2170,
    harvestModifier: 0.98,
    risk: 0.08,
    liquidity: 0.9
  },
  {
    name: "Kernite",
    rawPricePerM3: 1930,
    compressedPricePerM3: 2080,
    refinedValuePerM3: 2360,
    harvestModifier: 0.94,
    risk: 0.09,
    liquidity: 0.87
  },
  {
    name: "Omber",
    rawPricePerM3: 1980,
    compressedPricePerM3: 2140,
    refinedValuePerM3: 2430,
    harvestModifier: 0.91,
    risk: 0.1,
    liquidity: 0.84
  }
];

const INDUSTRY_PRODUCTS = [
  {
    name: "Antimatter Charge M",
    materialCost: 730000,
    sellPrice: 1110000,
    baseTimeMinutes: 18,
    demand: 0.98,
    complexity: 0.15
  },
  {
    name: "Hobgoblin I",
    materialCost: 380000,
    sellPrice: 620000,
    baseTimeMinutes: 14,
    demand: 0.96,
    complexity: 0.1
  },
  {
    name: "Small Shield Extender II",
    materialCost: 960000,
    sellPrice: 1460000,
    baseTimeMinutes: 32,
    demand: 0.92,
    complexity: 0.2
  },
  {
    name: "400mm Steel Plates I",
    materialCost: 1250000,
    sellPrice: 1820000,
    baseTimeMinutes: 44,
    demand: 0.89,
    complexity: 0.24
  },
  {
    name: "Damage Control II",
    materialCost: 4400000,
    sellPrice: 6200000,
    baseTimeMinutes: 88,
    demand: 0.9,
    complexity: 0.33
  }
];

const SYSTEMS = [
  {
    name: "Couster",
    security: 0.9,
    gankIndex: 12,
    jumpsToHub: 23,
    congestion: 18,
    ores: ["Veldspar", "Scordite", "Plagioclase"]
  },
  {
    name: "Arnon",
    security: 0.9,
    gankIndex: 14,
    jumpsToHub: 20,
    congestion: 21,
    ores: ["Veldspar", "Scordite"]
  },
  {
    name: "Todifrauan",
    security: 0.8,
    gankIndex: 15,
    jumpsToHub: 21,
    congestion: 17,
    ores: ["Scordite", "Plagioclase", "Pyroxeres"]
  },
  {
    name: "Pasha",
    security: 0.8,
    gankIndex: 19,
    jumpsToHub: 18,
    congestion: 20,
    ores: ["Veldspar", "Kernite"]
  },
  {
    name: "Deepari",
    security: 0.7,
    gankIndex: 26,
    jumpsToHub: 17,
    congestion: 24,
    ores: ["Scordite", "Pyroxeres", "Omber"]
  },
  {
    name: "Sobaseki",
    security: 0.8,
    gankIndex: 27,
    jumpsToHub: 7,
    congestion: 32,
    ores: ["Veldspar", "Scordite", "Kernite"]
  },
  {
    name: "Hek",
    security: 0.5,
    gankIndex: 31,
    jumpsToHub: 11,
    congestion: 30,
    ores: ["Pyroxeres", "Kernite", "Omber"]
  },
  {
    name: "Uedama",
    security: 0.5,
    gankIndex: 78,
    jumpsToHub: 5,
    congestion: 61,
    ores: ["Veldspar", "Scordite"]
  }
];

const SKILL_KEYS = Object.keys(SKILL_LABELS);
const MINING_SHIP_KEYS = Object.keys(MINING_SHIPS);
const SUPPORT_SHIP_KEYS = Object.keys(SUPPORT_SHIPS);

const INPUT_IDS = [
  "play-hours",
  "base-yield",
  "logistics-cost",
  "industry-fee",
  "mining-share",
  "mining-ship",
  "support-ship",
  "burst-level",
  "plex-goal",
  "plex-price",
  "wallet",
  "reinvest-rate"
];

const skillValueNodes = {
  mining: document.getElementById("value-mining"),
  astrogeology: document.getElementById("value-astrogeology"),
  reprocessing: document.getElementById("value-reprocessing"),
  industry: document.getElementById("value-industry"),
  massProduction: document.getElementById("value-massProduction"),
  accounting: document.getElementById("value-accounting"),
  brokerRelations: document.getElementById("value-brokerRelations"),
  supplyChain: document.getElementById("value-supplyChain")
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatISK(value) {
  return `${Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Math.round(value))} ISK`;
}

function formatISKCompact(value) {
  return `${Intl.NumberFormat("pt-PT", { notation: "compact", maximumFractionDigits: 1 }).format(
    Math.round(value)
  )} ISK`;
}

function formatDays(days) {
  if (!Number.isFinite(days)) {
    return "N/A";
  }
  if (days < 1) {
    return "< 1 dia";
  }
  if (days < 30) {
    return `${days.toFixed(1)} dias`;
  }
  const months = days / 30;
  if (months < 24) {
    return `${months.toFixed(1)} meses`;
  }
  return `${(months / 12).toFixed(1)} anos`;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeChoice(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function hasLiveBackend() {
  return window.location.protocol.startsWith("http");
}

function formatNumber(value) {
  return Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatWhen(isoString) {
  if (!isoString) {
    return "nunca";
  }
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) {
    return "nunca";
  }
  return dt.toLocaleString("pt-PT");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_STATE);
    }

    const parsed = JSON.parse(raw);
    return {
      skills: {
        mining: clamp(parseNumber(parsed.skills?.mining, DEFAULT_STATE.skills.mining), 0, 5),
        astrogeology: clamp(parseNumber(parsed.skills?.astrogeology, DEFAULT_STATE.skills.astrogeology), 0, 5),
        reprocessing: clamp(parseNumber(parsed.skills?.reprocessing, DEFAULT_STATE.skills.reprocessing), 0, 5),
        industry: clamp(parseNumber(parsed.skills?.industry, DEFAULT_STATE.skills.industry), 0, 5),
        massProduction: clamp(
          parseNumber(parsed.skills?.massProduction, DEFAULT_STATE.skills.massProduction),
          0,
          5
        ),
        accounting: clamp(parseNumber(parsed.skills?.accounting, DEFAULT_STATE.skills.accounting), 0, 5),
        brokerRelations: clamp(
          parseNumber(parsed.skills?.brokerRelations, DEFAULT_STATE.skills.brokerRelations),
          0,
          5
        ),
        supplyChain: clamp(parseNumber(parsed.skills?.supplyChain, DEFAULT_STATE.skills.supplyChain), 0, 5)
      },
      playHours: clamp(parseNumber(parsed.playHours, DEFAULT_STATE.playHours), 1, 16),
      baseYield: clamp(parseNumber(parsed.baseYield, DEFAULT_STATE.baseYield), 3000, 50000),
      logisticsCost: clamp(parseNumber(parsed.logisticsCost, DEFAULT_STATE.logisticsCost), 0, 20),
      industryFee: clamp(parseNumber(parsed.industryFee, DEFAULT_STATE.industryFee), 0, 15),
      miningShare: clamp(parseNumber(parsed.miningShare, DEFAULT_STATE.miningShare), 20, 100),
      miningShip: normalizeChoice(parsed.miningShip, MINING_SHIP_KEYS, DEFAULT_STATE.miningShip),
      supportShip: normalizeChoice(parsed.supportShip, SUPPORT_SHIP_KEYS, DEFAULT_STATE.supportShip),
      burstLevel: clamp(parseNumber(parsed.burstLevel, DEFAULT_STATE.burstLevel), 0, 5),
      plexGoal: clamp(parseNumber(parsed.plexGoal, DEFAULT_STATE.plexGoal), 50, 5000),
      plexPrice: clamp(parseNumber(parsed.plexPrice, DEFAULT_STATE.plexPrice), 1000000, 10000000),
      wallet: Math.max(0, parseNumber(parsed.wallet, DEFAULT_STATE.wallet)),
      reinvestRate: clamp(parseNumber(parsed.reinvestRate, DEFAULT_STATE.reinvestRate), 0, 95)
    };
  } catch (_error) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function writeStateToInputs(state) {
  SKILL_KEYS.forEach((key) => {
    const input = document.getElementById(`skill-${key}`);
    if (input) {
      input.value = String(state.skills[key]);
    }
  });

  document.getElementById("play-hours").value = String(state.playHours);
  document.getElementById("base-yield").value = String(state.baseYield);
  document.getElementById("logistics-cost").value = String(state.logisticsCost);
  document.getElementById("industry-fee").value = String(state.industryFee);
  document.getElementById("mining-share").value = String(state.miningShare);
  document.getElementById("mining-ship").value = state.miningShip;
  document.getElementById("support-ship").value = state.supportShip;
  document.getElementById("burst-level").value = String(state.burstLevel);
  document.getElementById("plex-goal").value = String(state.plexGoal);
  document.getElementById("plex-price").value = String(state.plexPrice);
  document.getElementById("wallet").value = String(state.wallet);
  document.getElementById("reinvest-rate").value = String(state.reinvestRate);
}

function readStateFromInputs() {
  const skills = {};
  SKILL_KEYS.forEach((key) => {
    const input = document.getElementById(`skill-${key}`);
    skills[key] = clamp(parseNumber(input?.value, DEFAULT_STATE.skills[key]), 0, 5);
  });

  return {
    skills,
    playHours: clamp(parseNumber(document.getElementById("play-hours")?.value, DEFAULT_STATE.playHours), 1, 16),
    baseYield: clamp(
      parseNumber(document.getElementById("base-yield")?.value, DEFAULT_STATE.baseYield),
      3000,
      50000
    ),
    logisticsCost: clamp(
      parseNumber(document.getElementById("logistics-cost")?.value, DEFAULT_STATE.logisticsCost),
      0,
      20
    ),
    industryFee: clamp(
      parseNumber(document.getElementById("industry-fee")?.value, DEFAULT_STATE.industryFee),
      0,
      15
    ),
    miningShare: clamp(
      parseNumber(document.getElementById("mining-share")?.value, DEFAULT_STATE.miningShare),
      20,
      100
    ),
    miningShip: normalizeChoice(
      document.getElementById("mining-ship")?.value,
      MINING_SHIP_KEYS,
      DEFAULT_STATE.miningShip
    ),
    supportShip: normalizeChoice(
      document.getElementById("support-ship")?.value,
      SUPPORT_SHIP_KEYS,
      DEFAULT_STATE.supportShip
    ),
    burstLevel: clamp(parseNumber(document.getElementById("burst-level")?.value, DEFAULT_STATE.burstLevel), 0, 5),
    plexGoal: clamp(parseNumber(document.getElementById("plex-goal")?.value, DEFAULT_STATE.plexGoal), 50, 5000),
    plexPrice: clamp(
      parseNumber(document.getElementById("plex-price")?.value, DEFAULT_STATE.plexPrice),
      1000000,
      10000000
    ),
    wallet: Math.max(0, parseNumber(document.getElementById("wallet")?.value, DEFAULT_STATE.wallet)),
    reinvestRate: clamp(
      parseNumber(document.getElementById("reinvest-rate")?.value, DEFAULT_STATE.reinvestRate),
      0,
      95
    )
  };
}

function updateSkillBadges(skills) {
  SKILL_KEYS.forEach((key) => {
    if (skillValueNodes[key]) {
      skillValueNodes[key].textContent = String(skills[key]);
    }
  });
}

function economyFromState(state) {
  const miningShip = MINING_SHIPS[state.miningShip] ?? MINING_SHIPS[DEFAULT_STATE.miningShip];
  const supportShip = SUPPORT_SHIPS[state.supportShip] ?? SUPPORT_SHIPS[DEFAULT_STATE.supportShip];
  const burstLevel = clamp(state.burstLevel, 0, 5);
  const burstQualityFactor = 0.7 + burstLevel * 0.06;

  const salesTax = clamp(0.08 - state.skills.accounting * 0.011, 0.015, 0.08);
  const brokerFee = clamp(0.04 - state.skills.brokerRelations * 0.006, 0.01, 0.04);
  const refineEfficiency = clamp(
    0.5 + state.skills.reprocessing * 0.07 + supportShip.refineBonus * burstQualityFactor,
    0.5,
    0.92
  );
  const shipSkillMultiplier = 1 + state.skills.mining * 0.05 + state.skills.astrogeology * 0.05;
  const fleetBurstMultiplier = 1 + supportShip.yieldBurst * burstQualityFactor;
  const miningThroughput =
    state.baseYield * shipSkillMultiplier * miningShip.yieldMult * fleetBurstMultiplier;
  const industryTimeMultiplier = clamp(1 - state.skills.industry * 0.04, 0.75, 1);
  const jobSlots = 1 + state.skills.massProduction;
  const factoryBonus = 1 + state.skills.supplyChain * 0.02;
  const effectiveLogisticsCost = clamp(
    state.logisticsCost - supportShip.logisticsReduction * burstQualityFactor,
    0,
    20
  );
  const compressionBonus = supportShip.compressionBonus * burstQualityFactor;
  const fleetRiskMultiplier = clamp(
    miningShip.riskMult - supportShip.riskReduction * burstQualityFactor,
    0.68,
    1.2
  );
  const safetyBias = supportShip.riskReduction * burstQualityFactor * 120;
  const fleetLabel = `${miningShip.label} + ${supportShip.label}`;

  return {
    salesTax,
    brokerFee,
    refineEfficiency,
    miningThroughput,
    industryTimeMultiplier,
    jobSlots,
    factoryBonus,
    miningShip,
    supportShip,
    burstLevel,
    effectiveLogisticsCost,
    compressionBonus,
    fleetRiskMultiplier,
    safetyBias,
    fleetLabel
  };
}

function getLiveMarketContext() {
  const market = liveCache.snapshot?.market || {};
  const products = market.products && typeof market.products === "object" ? market.products : {};
  const oreCoverage = clamp(parseNumber(market.oreCoverage, 0), 0, 1);
  const typeCoverage = clamp(parseNumber(market.typeCoverage, 0), 0, 1);
  return {
    mineralIndex: clamp(parseNumber(market.mineralIndex, 1), 0.65, 1.7),
    productIndex: clamp(parseNumber(market.productIndex, 1), 0.7, 1.8),
    productPrices: products,
    oreCoverage,
    typeCoverage,
    confidence: oreCoverage * 0.7 + typeCoverage * 0.3
  };
}

function evaluateOres(state, eco = economyFromState(state), marketCtx = getLiveMarketContext()) {
  return ORES.map((ore) => {
    const liveOre = liveCache.oreOverrides[ore.name] || {};
    const rawPricePerM3 = Number(liveOre.rawPricePerM3 || ore.rawPricePerM3);
    const compressedPricePerM3 = Number(liveOre.compressedPricePerM3 || ore.compressedPricePerM3);
    const refinedValuePerM3 = Number(liveOre.refinedValuePerM3 || ore.refinedValuePerM3);
    const marketSlip = 1 - (1 - ore.liquidity) * 0.14;
    const operationalEfficiency = clamp(
      0.78 + state.skills.supplyChain * 0.012 + eco.supportShip.logisticsReduction * 0.01,
      0.72,
      0.94
    );
    const effectiveThroughput = eco.miningThroughput * operationalEfficiency;

    const netRaw =
      rawPricePerM3 *
      marketSlip *
      (1 - eco.salesTax - eco.brokerFee - eco.effectiveLogisticsCost / 100);

    const netCompressed =
      compressedPricePerM3 *
      marketSlip *
      (1 + eco.compressionBonus) *
      (1 - eco.salesTax - eco.brokerFee - eco.effectiveLogisticsCost / 260);

    const netRefined =
      refinedValuePerM3 *
      marketSlip *
      eco.refineEfficiency *
      (1 - eco.salesTax - eco.brokerFee - eco.effectiveLogisticsCost / 230);

    const netFactory =
      refinedValuePerM3 *
        marketSlip *
        eco.refineEfficiency *
        (1.06 + eco.factoryBonus * 0.04 + eco.compressionBonus * 0.26) *
        (1 - eco.salesTax - eco.brokerFee) -
      refinedValuePerM3 * (state.industryFee / 100) * 0.34;

    const options = [
      { route: "Vender bruto", net: netRaw },
      { route: "Comprimir e vender", net: netCompressed },
      { route: "Refinar e vender minerais", net: netRefined },
      { route: "Refinar e puxar para fábrica", net: netFactory }
    ].sort((a, b) => b.net - a.net);

    const bestOption = options[0];
    const iskHour = bestOption.net * effectiveThroughput * ore.harvestModifier;
    const riskPenalty = 1 - ore.risk * 0.14 * eco.fleetRiskMultiplier;
    const confidenceFactor = 0.85 + marketCtx.confidence * 0.15;
    const score = iskHour * ore.liquidity * riskPenalty * confidenceFactor;

    return {
      ...ore,
      rawPricePerM3,
      compressedPricePerM3,
      refinedValuePerM3,
      options,
      bestOption,
      iskHour,
      score,
      effectiveThroughput
    };
  }).sort((a, b) => b.score - a.score);
}

function evaluateIndustry(state, eco = economyFromState(state), marketCtx = getLiveMarketContext()) {
  return INDUSTRY_PRODUCTS.map((product) => {
    const liveSell = Number(
      marketCtx.productPrices[product.name]?.marketPrice ||
        marketCtx.productPrices[product.name]?.sellPrice ||
        0
    );
    const sellPrice =
      liveSell > 0 ? liveSell : product.sellPrice * Math.min(Math.max(marketCtx.productIndex, 0.8), 1.5);
    const adjustedMaterials =
      product.materialCost * marketCtx.mineralIndex * (1 - state.skills.reprocessing * 0.009);
    const adjustedTime = product.baseTimeMinutes * eco.industryTimeMultiplier;
    const theoreticalRuns = (60 / adjustedTime) * eco.jobSlots;
    const marketFill = clamp(product.demand * (0.86 + (1 - product.complexity) * 0.11), 0.58, 1.04);
    const capitalLimitFactor = clamp(state.wallet / (adjustedMaterials * 40), 0.35, 1.2);
    const runsPerHour = theoreticalRuns * marketFill * capitalLimitFactor;
    const netSale = sellPrice * (1 - eco.salesTax - eco.brokerFee);
    const industryTax = sellPrice * (state.industryFee / 100);
    const profitPerRun = netSale - adjustedMaterials - industryTax;
    const profitHour = profitPerRun * runsPerHour;
    const stability = clamp(1 - product.complexity * 0.25, 0.52, 1);
    const score = profitHour * stability;
    const marginPct = adjustedMaterials > 0 ? (profitPerRun / adjustedMaterials) * 100 : 0;
    const breakEvenRuns = profitPerRun > 0 ? Math.ceil(adjustedMaterials / profitPerRun) : Infinity;

    return {
      ...product,
      sellPrice,
      adjustedMaterials,
      adjustedTime,
      runsPerHour,
      profitPerRun,
      profitHour,
      score,
      marginPct,
      breakEvenRuns
    };
  }).sort((a, b) => b.score - a.score);
}

function evaluateSystems(preferredOre, safetyBias = 0) {
  return SYSTEMS.map((system) => {
    const oreMatch = system.ores.includes(preferredOre) ? 1 : 0.82;
    const safety = system.security * 100 - system.gankIndex * 1.4;
    const logistics = Math.max(0, 100 - system.jumpsToHub * 3.2);
    const congestionPenalty = Math.max(0, 100 - system.congestion * 1.1);
    const score =
      safety * 0.42 + logistics * 0.28 + oreMatch * 18 + congestionPenalty * 0.3 + safetyBias * 0.4;

    return {
      ...system,
      oreMatch,
      score
    };
  }).sort((a, b) => b.score - a.score);
}

function computeWealthTargets(totalDaily, wallet, reinvestRate) {
  const goals = [
    { label: "1B", amount: 1_000_000_000 },
    { label: "5B", amount: 5_000_000_000 },
    { label: "10B", amount: 10_000_000_000 }
  ];

  return goals.map((goal) => {
    const linearDays = totalDaily > 0 ? Math.max(0, (goal.amount - wallet) / totalDaily) : Infinity;
    if (wallet >= goal.amount) {
      return {
        ...goal,
        linearDays: 0,
        acceleratedDays: 0,
        dailyNeeded30: 0
      };
    }

    const reinvest = clamp(reinvestRate / 100, 0, 0.95);
    const growthPerDay = reinvest * 0.0019;
    const cappedDaily = totalDaily * (1 + reinvest * 2.3);
    let simulatedWallet = wallet;
    let simulatedDaily = totalDaily;
    let acceleratedDays = Infinity;

    for (let day = 1; day <= 3650; day += 1) {
      simulatedWallet += simulatedDaily;
      simulatedDaily = Math.min(simulatedDaily * (1 + growthPerDay), cappedDaily);
      if (simulatedWallet >= goal.amount) {
        acceleratedDays = day;
        break;
      }
    }

    return {
      ...goal,
      linearDays,
      acceleratedDays,
      dailyNeeded30: Math.max(0, (goal.amount - wallet) / 30)
    };
  });
}

function computeSnapshot(state) {
  const eco = economyFromState(state);
  const marketCtx = getLiveMarketContext();
  const ores = evaluateOres(state, eco, marketCtx);
  const industry = evaluateIndustry(state, eco, marketCtx);
  const bestOre = ores[0];
  const bestIndustry = industry[0];
  const systems = evaluateSystems(bestOre.name, eco.safetyBias);

  const miningShare = clamp(state.miningShare / 100, 0.2, 1);
  const miningDaily = bestOre.iskHour * state.playHours * miningShare;
  const industryDaily = Math.max(0, bestIndustry.profitHour) * state.playHours * (1 - miningShare);
  const totalDaily = miningDaily + industryDaily;
  const totalHourly = totalDaily / state.playHours;
  const monthlyProjection = totalDaily * 30;

  const plexNeed = state.plexGoal * state.plexPrice;
  const plexDailyTarget = plexNeed / 30;
  const plexDailyGap = plexDailyTarget - totalDaily;
  const progressPercent = clamp((monthlyProjection / plexNeed) * 100, 0, 100);
  const daysToGoal = totalDaily > 0 ? Math.max(0, (plexNeed - state.wallet) / totalDaily) : Infinity;
  const wealthTargets = computeWealthTargets(totalDaily, state.wallet, state.reinvestRate);

  return {
    ores,
    industry,
    systems,
    bestOre,
    bestIndustry,
    miningDaily,
    industryDaily,
    totalDaily,
    totalHourly,
    monthlyProjection,
    plexDailyTarget,
    plexDailyGap,
    progressPercent,
    daysToGoal,
    fleetLabel: eco.fleetLabel,
    effectiveLogisticsCost: eco.effectiveLogisticsCost,
    burstLevel: eco.burstLevel,
    wealthTargets,
    marketConfidence: marketCtx.confidence
  };
}

function trainingHoursBetween(skillKey, currentLevel, targetLevel) {
  let hours = 0;
  for (let level = currentLevel + 1; level <= targetLevel; level += 1) {
    hours += TRAINING_STEP_HOURS[skillKey][level] ?? 0;
  }
  return hours;
}

function computeSkillROI(state, baseSnapshot) {
  return SKILL_KEYS.map((skillKey) => {
    const currentLevel = state.skills[skillKey];
    if (currentLevel >= 5) {
      return null;
    }

    const simulatedState = structuredClone(state);
    simulatedState.skills[skillKey] = currentLevel + 1;
    const nextSnapshot = computeSnapshot(simulatedState);
    const deltaDaily = nextSnapshot.totalDaily - baseSnapshot.totalDaily;
    const trainHours = trainingHoursBetween(skillKey, currentLevel, currentLevel + 1);
    const roiPerHour = trainHours > 0 ? deltaDaily / trainHours : 0;

    return {
      key: skillKey,
      label: SKILL_LABELS[skillKey],
      targetLevel: currentLevel + 1,
      deltaDaily,
      trainHours,
      roiPerHour
    };
  })
    .filter(Boolean)
    .sort((a, b) => b.roiPerHour - a.roiPerHour);
}

function setLiveDotState(isOnline) {
  const dotIds = ["live-dot", "live-badge-dot"];
  dotIds.forEach((id) => {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }
    node.classList.toggle("online", isOnline);
    node.classList.toggle("offline", !isOnline);
  });
}

function renderLiveStatus(status, snapshot) {
  const mode = status?.mode || "offline";
  const source = status?.snapshotSource || null;
  const connected = Boolean(status?.authConnected && snapshot);
  setLiveDotState(connected);

  const statusText = connected
    ? "Live ESI conectado"
    : source === "market-only"
      ? "Mercado live (sem SSO)"
      : mode === "offline"
        ? "Offline"
        : "Modo local";
  const updatedText =
    connected || source === "market-only"
      ? `Última sync: ${formatWhen(status?.lastUpdatedAt)}`
      : "Sem sincronização com ESI";

  const headerStatus = document.getElementById("live-status");
  const headerUpdated = document.getElementById("live-updated");
  const badgeText = document.getElementById("live-badge-text");
  if (headerStatus) {
    headerStatus.textContent = statusText;
  }
  if (headerUpdated) {
    headerUpdated.textContent = updatedText;
  }
  if (badgeText) {
    badgeText.textContent = connected ? "Online" : "Offline";
  }

  const warningNode = document.getElementById("live-mode-warning");
  if (warningNode) {
    if (!hasLiveBackend()) {
      warningNode.textContent =
        "Estás em file://. Para modo real-time 24h abre via servidor: http://127.0.0.1:3000";
    } else if (!status?.envConfigured) {
      warningNode.textContent =
        "Falta configurar EVE_CLIENT_ID e EVE_CLIENT_SECRET para autenticar no EVE SSO.";
    } else if (source === "market-only") {
      warningNode.textContent =
        "Mercado já está live. Conecta EVE SSO para destravar skills/wallet/jobs e precisão máxima.";
    } else if (!connected) {
      warningNode.textContent = "Conecta no EVE SSO para habilitar dados reais da tua conta.";
    } else {
      warningNode.textContent = "";
    }
  }
}

function renderLiveCards(status, snapshot) {
  document.getElementById("live-character").textContent = snapshot?.character
    ? `${snapshot.character.name} (#${snapshot.character.id})`
    : "Sem conexão";
  document.getElementById("live-wallet").textContent = snapshot?.wallet
    ? formatISK(snapshot.wallet.balance)
    : "0 ISK";
  document.getElementById("live-mining").textContent = snapshot?.mining
    ? `${formatNumber(snapshot.mining.quantity)} unidades em ${snapshot.mining.entries} entradas`
    : "Sem dados";
  document.getElementById("live-industry").textContent = snapshot?.industry
    ? `${snapshot.industry.active} ativos / ${snapshot.industry.total} total`
    : "Sem dados";
  document.getElementById("live-orders").textContent = snapshot?.orders
    ? `${snapshot.orders.total} ordens (${snapshot.orders.buy} buy / ${snapshot.orders.sell} sell)`
    : "Sem dados";
  document.getElementById("live-skillqueue").textContent = snapshot?.skillQueue
    ? `${snapshot.skillQueue.entries} skills na fila`
    : "Sem dados";

  const list = document.getElementById("live-errors");
  if (!list) {
    return;
  }
  const errors = [];
  if (status?.lastError) {
    errors.push(status.lastError);
  }
  list.innerHTML = errors.map((error) => `<li class="alert warn">${error}</li>`).join("");
}

function applyLiveSnapshotToInputs(snapshot) {
  if (!snapshot) {
    return;
  }

  if (snapshot.skills) {
    SKILL_KEYS.forEach((key) => {
      const level = snapshot.skills[key];
      if (typeof level === "number" && Number.isFinite(level)) {
        const input = document.getElementById(`skill-${key}`);
        if (input) {
          input.value = String(clamp(level, 0, 5));
        }
      }
    });
  }

  if (snapshot.wallet && Number.isFinite(snapshot.wallet.balance)) {
    const walletInput = document.getElementById("wallet");
    if (walletInput) {
      walletInput.value = String(Math.max(0, snapshot.wallet.balance));
    }
  }

  if (snapshot.market && Number.isFinite(snapshot.market.plexPrice) && snapshot.market.plexPrice > 0) {
    const plexInput = document.getElementById("plex-price");
    if (plexInput) {
      plexInput.value = String(Math.round(snapshot.market.plexPrice));
    }
  }

  if (snapshot.market?.ores && typeof snapshot.market.ores === "object") {
    liveCache.oreOverrides = snapshot.market.ores;
  }
}

async function loadLiveSnapshot(forceRefresh = false) {
  if (!hasLiveBackend()) {
    renderLiveStatus({ mode: "offline", envConfigured: false, authConnected: false }, null);
    renderLiveCards({ lastError: null }, null);
    return;
  }

  try {
    if (forceRefresh) {
      await fetch("/api/refresh", { method: "POST" });
    }

    const response = await fetch("/api/snapshot", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Falha API live (${response.status})`);
    }
    const payload = await response.json();
    liveCache.status = payload.status || null;
    liveCache.snapshot = payload.snapshot || null;

    renderLiveStatus(liveCache.status, liveCache.snapshot);
    renderLiveCards(liveCache.status, liveCache.snapshot);
    applyLiveSnapshotToInputs(liveCache.snapshot);
    renderDashboard();
  } catch (error) {
    liveCache.snapshot = null;
    liveCache.oreOverrides = {};
    renderLiveStatus(
      {
        mode: "offline",
        envConfigured: true,
        authConnected: false,
        lastError: error.message
      },
      null
    );
    renderLiveCards({ lastError: error.message }, null);
  }
}

function startLivePolling() {
  if (!hasLiveBackend()) {
    renderLiveStatus({ mode: "offline", envConfigured: false, authConnected: false }, null);
    renderLiveCards({ lastError: null }, null);
    const connectLink = document.getElementById("connect-eve");
    if (connectLink) {
      connectLink.setAttribute("href", "#");
    }
    return;
  }

  loadLiveSnapshot(false);
  liveCache.pollTimer = window.setInterval(() => {
    loadLiveSnapshot(false);
  }, LIVE_POLL_MS);
}

function renderHero(snapshot) {
  document.getElementById("hero-hourly").textContent = `${formatISKCompact(snapshot.totalHourly)}/h`;
  document.getElementById("hero-daily").textContent = `${formatISKCompact(snapshot.totalDaily)}/dia`;
  document.getElementById("hero-monthly").textContent = `${formatISKCompact(snapshot.monthlyProjection)}/mês`;
}

function renderActions(snapshot, skillRoi) {
  const bestSystem = snapshot.systems[0];
  const topSkill = skillRoi[0];
  const target1B = snapshot.wealthTargets.find((target) => target.label === "1B");
  const recommendedRuns = Math.max(
    1,
    Math.round((snapshot.bestIndustry.runsPerHour * (snapshot.bestIndustry.demand + 0.2)) / 2)
  );

  document.getElementById(
    "action-1"
  ).textContent = `${snapshot.fleetLabel}: minera ${snapshot.bestOre.name} e usa rota "${snapshot.bestOre.bestOption.route}". Potencial: ${formatISK(
    snapshot.bestOre.iskHour
  )}/h em ${bestSystem.name}.`;

  document.getElementById(
    "action-2"
  ).textContent = `Fabrica ${snapshot.bestIndustry.name} por ~${recommendedRuns} runs; margem média ${snapshot.bestIndustry.marginPct.toFixed(
    1
  )}% e potencial de ${formatISK(Math.max(0, snapshot.bestIndustry.profitHour))}/h.`;

  if (topSkill) {
    document.getElementById(
      "action-3"
    ).textContent = `Treina ${topSkill.label} para nível ${topSkill.targetLevel}: ganho estimado de ${formatISK(
      topSkill.deltaDaily
    )}/dia (${formatISK(topSkill.roiPerHour)}/hora de treino). ETA 1B: ${target1B ? formatDays(target1B.acceleratedDays) : "N/A"}.`;
  } else {
    document.getElementById("action-3").textContent =
      "Todas as skills já estão no máximo para este modelo. Otimiza só execução e logística.";
  }
}

function renderFleetSummary(snapshot) {
  const node = document.getElementById("fleet-summary");
  if (!node) {
    return;
  }
  node.textContent = `Setup atual: ${snapshot.fleetLabel} | Bursts ${snapshot.burstLevel}/5 | Logística efetiva ${snapshot.effectiveLogisticsCost.toFixed(
    1
  )}%`;
}

function renderPlex(snapshot) {
  document.getElementById("plex-daily-target").textContent = `Meta diária para PLEX: ${formatISK(
    snapshot.plexDailyTarget
  )}`;

  const gap = snapshot.plexDailyGap;
  if (gap > 0) {
    document.getElementById("plex-gap").textContent = `Falta ${formatISK(gap)} por dia para bater a meta.`;
  } else {
    document.getElementById("plex-gap").textContent = `Acima da meta em ${formatISK(Math.abs(gap))} por dia.`;
  }

  document.getElementById("plex-days").textContent = Number.isFinite(snapshot.daysToGoal)
    ? `Dias estimados para o alvo (com carteira atual): ${formatDays(snapshot.daysToGoal)}`
    : "Dias estimados para o alvo: infinito (receita atual zero).";

  document.getElementById("plex-progress").style.width = `${snapshot.progressPercent.toFixed(1)}%`;
}

function renderWealthTargets(snapshot) {
  const target1B = snapshot.wealthTargets.find((target) => target.label === "1B");
  const target5B = snapshot.wealthTargets.find((target) => target.label === "5B");
  const target10B = snapshot.wealthTargets.find((target) => target.label === "10B");

  document.getElementById("eta-1b").textContent = target1B
    ? `1B: ${formatDays(target1B.acceleratedDays)} (linear ${formatDays(target1B.linearDays)})`
    : "1B: N/A";
  document.getElementById("eta-5b").textContent = target5B
    ? `5B: ${formatDays(target5B.acceleratedDays)} (linear ${formatDays(target5B.linearDays)})`
    : "5B: N/A";
  document.getElementById("eta-10b").textContent = target10B
    ? `10B: ${formatDays(target10B.acceleratedDays)} (linear ${formatDays(target10B.linearDays)})`
    : "10B: N/A";

  const noteNode = document.getElementById("eta-note");
  if (!noteNode) {
    return;
  }

  if (!target1B) {
    noteNode.textContent = "Plano de escala: sem dados suficientes.";
    return;
  }

  if (target1B.acceleratedDays < target1B.linearDays * 0.85) {
    noteNode.textContent =
      "Plano de escala: reinvestimento está a acelerar bem. Mantém ciclo mineração + fabricação.";
  } else {
    noteNode.textContent =
      "Plano de escala: aceleração baixa. Aumenta throughput e reduz custos para encurtar o caminho ao 1B.";
  }
}

function renderOreTable(oreResults) {
  const tbody = document.getElementById("ore-table-body");
  tbody.innerHTML = oreResults
    .map((ore) => {
      const routes = Object.fromEntries(ore.options.map((option) => [option.route, option.net]));
      return `<tr>
        <td>${ore.name}</td>
        <td>${formatISKCompact(routes["Vender bruto"] || 0)}</td>
        <td>${formatISKCompact(routes["Comprimir e vender"] || 0)}</td>
        <td>${formatISKCompact(routes["Refinar e vender minerais"] || 0)}</td>
        <td>${formatISKCompact(routes["Refinar e puxar para fábrica"] || 0)}</td>
        <td><span class="tag-best">${ore.bestOption.route}</span></td>
      </tr>`;
    })
    .join("");
}

function renderSystems(systems) {
  const list = document.getElementById("safe-systems");
  const top = systems.slice(0, 5);
  list.innerHTML = top
    .map((system) => {
      const normalized = clamp(system.score, 0, 100);
      return `<li class="system-card">
        <div class="system-head">
          <span>${system.name}</span>
          <span>Score ${normalized.toFixed(1)}</span>
        </div>
        <p class="system-meta">Sec ${system.security.toFixed(1)} | Gank ${system.gankIndex} | ${system.jumpsToHub} jumps até hub</p>
        <div class="system-bar"><span style="width: ${normalized}%"></span></div>
      </li>`;
    })
    .join("");
}

function renderIndustry(industryResults) {
  const tbody = document.getElementById("industry-body");
  tbody.innerHTML = industryResults
    .map((product, idx) => {
      const decision = idx === 0 ? '<span class="tag-best">Prioridade</span>' : "Monitorar";
      const breakEvenText = Number.isFinite(product.breakEvenRuns) ? `${product.breakEvenRuns} runs` : "N/A";
      return `<tr>
        <td>${product.name}</td>
        <td>${formatISKCompact(product.profitPerRun)}</td>
        <td>${formatISKCompact(product.profitHour)}</td>
        <td>${product.adjustedTime.toFixed(1)} min</td>
        <td>${breakEvenText}</td>
        <td>${Math.round(product.demand * 100)}%</td>
        <td>${decision}</td>
      </tr>`;
    })
    .join("");

  const best = industryResults[0];
  document.getElementById("industry-best").textContent = `Melhor item agora: ${best.name} (${formatISK(
    best.profitHour
  )}/h, margem ${best.marginPct.toFixed(1)}%)`;
}

function renderSkillROI(skillRows) {
  const tbody = document.getElementById("skills-roi-body");
  if (!skillRows.length) {
    tbody.innerHTML = `<tr><td colspan="5">Sem upgrades relevantes no momento.</td></tr>`;
    return;
  }

  tbody.innerHTML = skillRows
    .map(
      (row) => `<tr>
      <td>${row.label}</td>
      <td>${row.targetLevel}</td>
      <td>${formatISKCompact(row.deltaDaily)}</td>
      <td>${row.trainHours.toFixed(0)}h</td>
      <td>${formatISKCompact(row.roiPerHour)}</td>
    </tr>`
    )
    .join("");
}

function renderPlan(snapshot, skillRows, state) {
  const topSkill = skillRows[0];
  const secondSkill = skillRows[1] ?? topSkill;
  const thirdSkill = skillRows[2] ?? secondSkill;
  const bestSystem = snapshot.systems[0];
  const target1B = snapshot.wealthTargets.find((target) => target.label === "1B");
  const target5B = snapshot.wealthTargets.find((target) => target.label === "5B");
  const runsDay = Math.max(1, Math.round(snapshot.bestIndustry.runsPerHour * (state.playHours * 0.4)));

  const sevenDays = [
    `Minera ${snapshot.bestOre.name} em ${bestSystem.name} por ${Math.max(1, Math.round(state.playHours * (state.miningShare / 100)))}h/dia.`,
    `Executa rota ${snapshot.bestOre.bestOption.route} para extrair ${formatISK(snapshot.bestOre.iskHour)} por hora.`,
    target1B ? `Ritmo atual para 1B: ${formatDays(target1B.acceleratedDays)}.` : "Ritmo para 1B indisponível.",
    topSkill
      ? `Treina ${topSkill.label} para nível ${topSkill.targetLevel}.`
      : "Mantém foco total na execução operacional."
  ];

  const thirtyDays = [
    `Consolida produção de ${snapshot.bestIndustry.name} em ${runsDay} runs/dia (break-even ${Number.isFinite(
      snapshot.bestIndustry.breakEvenRuns
    ) ? snapshot.bestIndustry.breakEvenRuns : "N/A"} runs).`,
    secondSkill
      ? `Treina ${secondSkill.label} para nível ${secondSkill.targetLevel}.`
      : "Revê blueprint, sem novo treino prioritário.",
    target5B ? `Projeção para 5B: ${formatDays(target5B.acceleratedDays)}.` : "Projeção para 5B indisponível.",
    `Mantém taxa logística abaixo de ${Math.max(2, state.logisticsCost - 0.8).toFixed(1)}%.`
  ];

  const ninetyDays = [
    `Escala para dois ciclos: mineração + indústria com ${state.playHours.toFixed(1)}h/dia.`,
    thirdSkill
      ? `Leva ${thirdSkill.label} para nível ${thirdSkill.targetLevel} e reavalia o ROI global.`
      : "Sem skills urgentes; otimização vem de mercado e volume.",
    `Meta de caixa: ${formatISK(snapshot.monthlyProjection * 3)} acumulados em 90 dias.`
  ];

  writeList(document.getElementById("plan-7"), sevenDays);
  writeList(document.getElementById("plan-30"), thirtyDays);
  writeList(document.getElementById("plan-90"), ninetyDays);
}

function writeList(node, items) {
  node.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function generateAlerts(snapshot, state, skillRows) {
  const alerts = [];
  const bestSystem = snapshot.systems[0];
  const target1B = snapshot.wealthTargets.find((target) => target.label === "1B");

  if (snapshot.plexDailyGap > 0) {
    alerts.push({
      type: "warn",
      message: `PLEX abaixo da rota: faltam ${formatISK(snapshot.plexDailyGap)} por dia para fechar o objetivo mensal.`
    });
  } else {
    alerts.push({
      type: "good",
      message: `Meta de PLEX coberta com folga diária de ${formatISK(Math.abs(snapshot.plexDailyGap))}.`
    });
  }

  if (state.skills.reprocessing < 4) {
    alerts.push({
      type: "warn",
      message: "Reprocessing abaixo de IV limita o valor do refino e enfraquece tua margem industrial."
    });
  }

  if (state.skills.accounting < 3 || state.skills.brokerRelations < 3) {
    alerts.push({
      type: "warn",
      message: "Taxas de mercado ainda altas. Accounting e Broker Relations pagam rápido no teu perfil."
    });
  }

  if (bestSystem.gankIndex > 30) {
    alerts.push({
      type: "danger",
      message: `Sistema líder (${bestSystem.name}) está com pressão de gank alta. Prioriza janelas tranquilas e dock frequente.`
    });
  }

  if (state.logisticsCost > 6) {
    alerts.push({
      type: "warn",
      message: "Custo logístico elevado. Reduzir 1-2% de frete aumenta muito o ISK líquido semanal."
    });
  }

  if (snapshot.bestIndustry.marginPct < 8) {
    alerts.push({
      type: "warn",
      message:
        "Margem industrial baixa. Troca item ou espera janela melhor de mercado antes de escalar runs."
    });
  }

  if (snapshot.marketConfidence < 0.6) {
    alerts.push({
      type: "warn",
      message: "Cobertura de mercado parcial. Conecta EVE SSO para melhorar precisão dos lucros."
    });
  }

  if (state.supportShip === "porpoise") {
    alerts.push({
      type: "good",
      message: "Porpoise ativa: bursts e compressão estão a puxar teu ISK/h para cima em high-sec."
    });
  }

  if (!skillRows.length) {
    alerts.push({
      type: "good",
      message: "Skills core em teto operacional. Próximo ganho vem de escala e timing de mercado."
    });
  }

  if (target1B) {
    if (target1B.acceleratedDays > 180) {
      alerts.push({
        type: "danger",
        message: `ETA para 1B ainda longo (${formatDays(
          target1B.acceleratedDays
        )}). Precisas subir throughput e margem simultaneamente.`
      });
    } else {
      alerts.push({
        type: "good",
        message: `Ritmo para 1B saudável: ${formatDays(target1B.acceleratedDays)} no cenário acelerado.`
      });
    }
  }

  return alerts.slice(0, 6);
}

function renderAlerts(alerts) {
  const list = document.getElementById("alerts-list");
  list.innerHTML = alerts
    .map((alert) => `<li class="alert ${alert.type}">${alert.message}</li>`)
    .join("");
}

function ensureScenarioSkillOptions(skills) {
  const skillSelect = document.getElementById("scenario-skill");
  const currentValue = skillSelect.value || SKILL_KEYS[0];
  skillSelect.innerHTML = SKILL_KEYS.map(
    (key) => `<option value="${key}">${SKILL_LABELS[key]} (atual ${skills[key]})</option>`
  ).join("");
  skillSelect.value = SKILL_KEYS.includes(currentValue) ? currentValue : SKILL_KEYS[0];
  updateScenarioTargetOptions(skills);
}

function updateScenarioTargetOptions(skills) {
  const skillSelect = document.getElementById("scenario-skill");
  const targetSelect = document.getElementById("scenario-target");
  const selectedSkill = skillSelect.value;
  const currentLevel = skills[selectedSkill];
  const targetLevels = [];
  for (let level = currentLevel + 1; level <= 5; level += 1) {
    targetLevels.push(level);
  }

  targetSelect.innerHTML = targetLevels.length
    ? targetLevels.map((level) => `<option value="${level}">${level}</option>`).join("")
    : `<option value="${currentLevel}">${currentLevel}</option>`;
}

function runScenario(state, baseSnapshot) {
  const skillKey = document.getElementById("scenario-skill").value;
  const targetLevel = parseNumber(document.getElementById("scenario-target").value, state.skills[skillKey]);
  const currentLevel = state.skills[skillKey];
  const resultNode = document.getElementById("scenario-result");

  if (targetLevel <= currentLevel) {
    resultNode.textContent = "Este upgrade já está no nível atual. Escolhe um alvo acima do teu nível.";
    return;
  }

  const simulatedState = structuredClone(state);
  simulatedState.skills[skillKey] = targetLevel;
  const simulatedSnapshot = computeSnapshot(simulatedState);
  const deltaDaily = simulatedSnapshot.totalDaily - baseSnapshot.totalDaily;
  const trainHours = trainingHoursBetween(skillKey, currentLevel, targetLevel);
  const roiPerHour = trainHours > 0 ? deltaDaily / trainHours : 0;
  const paybackDays = deltaDaily > 0 ? (trainHours / 24) / (deltaDaily / Math.max(baseSnapshot.totalDaily, 1)) : Infinity;
  const base1B = baseSnapshot.wealthTargets.find((target) => target.label === "1B");
  const sim1B = simulatedSnapshot.wealthTargets.find((target) => target.label === "1B");

  resultNode.textContent = `${SKILL_LABELS[skillKey]} ${currentLevel} -> ${targetLevel}: +${formatISK(
    deltaDaily
  )}/dia, treino estimado ${trainHours.toFixed(0)}h, ROI ${formatISK(roiPerHour)}/hora de treino, payback ~${Number.isFinite(
    paybackDays
  ) ? paybackDays.toFixed(1) : "N/A"} dias, ETA 1B ${base1B ? formatDays(base1B.acceleratedDays) : "N/A"} -> ${
    sim1B ? formatDays(sim1B.acceleratedDays) : "N/A"
  }.`;
}

function renderDashboard() {
  const state = readStateFromInputs();
  updateSkillBadges(state.skills);
  saveState(state);

  const snapshot = computeSnapshot(state);
  const skillRoi = computeSkillROI(state, snapshot);
  const alerts = generateAlerts(snapshot, state, skillRoi);

  renderHero(snapshot);
  renderActions(snapshot, skillRoi);
  renderFleetSummary(snapshot);
  renderPlex(snapshot);
  renderWealthTargets(snapshot);
  renderOreTable(snapshot.ores);
  renderSystems(snapshot.systems);
  renderIndustry(snapshot.industry);
  renderSkillROI(skillRoi);
  renderPlan(snapshot, skillRoi, state);
  renderAlerts(alerts);
  ensureScenarioSkillOptions(state.skills);

  return { state, snapshot };
}

function bindEvents() {
  const allInputs = [
    ...INPUT_IDS.map((id) => document.getElementById(id)),
    ...SKILL_KEYS.map((key) => document.getElementById(`skill-${key}`))
  ].filter(Boolean);

  allInputs.forEach((input) => {
    input.addEventListener("input", () => {
      renderDashboard();
    });
    input.addEventListener("change", () => {
      renderDashboard();
    });
  });

  document.getElementById("refresh-advice").addEventListener("click", () => {
    renderDashboard();
  });

  const refreshLiveButton = document.getElementById("refresh-live");
  if (refreshLiveButton) {
    refreshLiveButton.addEventListener("click", () => {
      loadLiveSnapshot(true);
    });
  }

  const logoutLiveButton = document.getElementById("logout-live");
  if (logoutLiveButton) {
    logoutLiveButton.addEventListener("click", async () => {
      if (!hasLiveBackend()) {
        return;
      }
      await fetch("/auth/eve/logout", { method: "POST" });
      liveCache.snapshot = null;
      liveCache.oreOverrides = {};
      loadLiveSnapshot(false);
    });
  }

  document.getElementById("scenario-skill").addEventListener("change", () => {
    const state = readStateFromInputs();
    updateScenarioTargetOptions(state.skills);
  });

  document.getElementById("simulate-btn").addEventListener("click", () => {
    const state = readStateFromInputs();
    const snapshot = computeSnapshot(state);
    runScenario(state, snapshot);
  });
}

function init() {
  const savedState = loadState();
  writeStateToInputs(savedState);
  updateSkillBadges(savedState.skills);
  ensureScenarioSkillOptions(savedState.skills);
  bindEvents();
  renderDashboard();
  startLivePolling();
}

init();
