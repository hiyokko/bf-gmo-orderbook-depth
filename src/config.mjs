export const DEPTH_TARGETS = Object.freeze([0.1, 0.3, 0.5, 1, 3]);

export const DISPLAY_TARGETS = Object.freeze({
  askBuy: Object.freeze([...DEPTH_TARGETS].reverse()),
  bidSell: DEPTH_TARGETS,
});

export const ORDERBOOK_SCHEDULE = Object.freeze({
  hoursJst: Object.freeze([1, 9, 17]),
  intervalHours: 8,
  watchdogMinLagMinutes: 20,
  watchdogMaxLagMinutes: 360,
});

export const WORKFLOWS = Object.freeze({
  orderbook: "orderbook-depth.yml",
  spreadComparison: "spread-comparison.yml",
});

export const SPREAD_MARKETS = Object.freeze({
  spot: Object.freeze([
    Object.freeze({ id: "sbivc", label: "SBI VC" }),
    Object.freeze({ id: "bf", label: "bF" }),
    Object.freeze({ id: "cc", label: "CC" }),
    Object.freeze({ id: "bp", label: "BP" }),
    Object.freeze({ id: "gmo", label: "GMO" }),
    Object.freeze({ id: "bb", label: "bb" }),
    Object.freeze({ id: "ct", label: "CT" }),
    Object.freeze({ id: "okj", label: "OKJ" }),
  ]),
  leverage: Object.freeze([
    Object.freeze({ id: "sbivc", label: "SBI VC" }),
    Object.freeze({ id: "bf", label: "bF" }),
    Object.freeze({ id: "gmo", label: "GMO" }),
  ]),
});

export const RUNTIME_DEFAULTS = Object.freeze({
  requestTimeoutMs: 15_000,
  githubApiUrl: "https://api.github.com",
  githubApiVersion: "2022-11-28",
  userAgent: "bf-gmo-orderbook-depth/1.0",
});
