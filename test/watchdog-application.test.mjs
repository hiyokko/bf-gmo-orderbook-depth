import test from "node:test";
import assert from "node:assert/strict";
import {
  hasRecoveryFailures,
  recoverReports,
} from "../src/watchdog-application.mjs";
import {
  SPREAD_WATCHDOG_TITLE_PREFIX,
  WATCHDOG_TITLE_PREFIX,
  parseWatchdogTarget,
} from "../src/watchdog.mjs";

const TARGET = parseWatchdogTarget("2026-07-23T08:00:00.000Z");
const REPORTS = [
  {
    id: "orderbookDepth",
    label: "Orderbook depth",
    workflow: "orderbook-depth.yml",
    titlePrefix: WATCHDOG_TITLE_PREFIX,
  },
  {
    id: "spreadComparison",
    label: "Spread comparison",
    workflow: "spread-comparison.yml",
    titlePrefix: SPREAD_WATCHDOG_TITLE_PREFIX,
  },
];

test("unified watchdog dispatches each missing report independently", async () => {
  const dispatches = [];
  const github = {
    async listWorkflowRuns() {
      return [];
    },
    async dispatchWorkflow(workflow, options) {
      dispatches.push({ workflow, options });
      return { workflow, ...options };
    },
  };

  const results = await recoverReports({
    github,
    reports: REPORTS,
    target: TARGET,
    ref: "main",
  });

  assert.deepEqual(results.map((result) => result.status), [
    "dispatched",
    "dispatched",
  ]);
  assert.deepEqual(dispatches.map(({ workflow }) => workflow), [
    "orderbook-depth.yml",
    "spread-comparison.yml",
  ]);
  assert.equal(hasRecoveryFailures(results), false);
});

test("one report failure does not block recovery of the other", async () => {
  const github = {
    async listWorkflowRuns(workflow) {
      if (workflow === "orderbook-depth.yml") {
        throw new Error("orderbook history unavailable");
      }
      return [];
    },
    async dispatchWorkflow(workflow, options) {
      return { workflow, ...options };
    },
  };

  const results = await recoverReports({
    github,
    reports: REPORTS,
    target: TARGET,
    ref: "main",
  });

  assert.equal(results[0].status, "failed");
  assert.match(results[0].error, /history unavailable/);
  assert.equal(results[1].status, "dispatched");
  assert.equal(hasRecoveryFailures(results), true);
});
