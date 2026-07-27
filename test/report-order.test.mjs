import test from "node:test";
import assert from "node:assert/strict";
import { waitForTargetSuccess } from "../src/report-order.mjs";
import {
  WATCHDOG_TITLE_PREFIX,
  parseWatchdogTarget,
  watchdogRunTitle,
} from "../src/watchdog.mjs";

const TARGET = parseWatchdogTarget("2026-07-23T08:00:00.000Z");

test("spread dependency accepts a successful orderbook run for the same slot", async () => {
  const result = await waitForTargetSuccess({
    listRuns: async () => [{
      id: 10,
      event: "schedule",
      status: "completed",
      conclusion: "success",
      created_at: "2026-07-23T08:04:00.000Z",
      html_url: "https://example.test/runs/10",
    }],
    target: TARGET,
    titlePrefix: WATCHDOG_TITLE_PREFIX,
  });

  assert.equal(result.attempts, 1);
  assert.equal(result.run.id, 10);
});

test("spread dependency polls until the watchdog orderbook run completes", async () => {
  let elapsedMs = 0;
  let attempts = 0;
  const result = await waitForTargetSuccess({
    listRuns: async () => {
      attempts += 1;
      return [{
        id: 20,
        event: "workflow_dispatch",
        display_title: watchdogRunTitle(TARGET),
        status: attempts === 1 ? "in_progress" : "completed",
        conclusion: attempts === 1 ? null : "success",
        created_at: "2026-07-23T08:27:00.000Z",
      }];
    },
    target: TARGET,
    titlePrefix: WATCHDOG_TITLE_PREFIX,
    timeoutMs: 60_000,
    pollIntervalMs: 10_000,
    nowImpl: () => elapsedMs,
    sleepImpl: async (delayMs) => {
      elapsedMs += delayMs;
    },
  });

  assert.equal(result.attempts, 2);
  assert.equal(result.run.id, 20);
});

test("spread dependency times out without a successful orderbook run", async () => {
  let elapsedMs = 0;
  await assert.rejects(
    waitForTargetSuccess({
      listRuns: async () => [],
      target: TARGET,
      titlePrefix: WATCHDOG_TITLE_PREFIX,
      timeoutMs: 20_000,
      pollIntervalMs: 10_000,
      nowImpl: () => elapsedMs,
      sleepImpl: async (delayMs) => {
        elapsedMs += delayMs;
      },
    }),
    /Timed out waiting for the orderbook report/,
  );
});
