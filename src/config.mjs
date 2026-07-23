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
});

export const RUNTIME_DEFAULTS = Object.freeze({
  requestTimeoutMs: 15_000,
  githubApiUrl: "https://api.github.com",
  githubApiVersion: "2022-11-28",
  userAgent: "bf-gmo-orderbook-depth/1.0",
});
