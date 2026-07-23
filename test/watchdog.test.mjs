import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyTargetRuns,
  parseWatchdogTarget,
  selectWatchdogTarget,
  watchdogRunTitle,
  workflowDispatchInputs,
} from "../src/watchdog.mjs";

test("watchdog targets the latest 17:00 JST slot after the grace period", () => {
  const target = selectWatchdogTarget(
    new Date("2026-07-23T08:27:00.000Z").getTime(),
    { minLagMinutes: 20, maxLagMinutes: 360 },
  );

  assert.equal(target.label, "2026-07-23 17:00 JST");
  assert.equal(target.executionBoundaryAt, "2026-07-23T08:00:00.000Z");
  assert.equal(target.lagMinutes, 27);
  assert.equal(target.skipReason, undefined);
});

test("watchdog waits for the minimum lag and ignores overly old slots", () => {
  const early = selectWatchdogTarget(
    new Date("2026-07-23T08:10:00.000Z").getTime(),
    { minLagMinutes: 20, maxLagMinutes: 360 },
  );
  const old = selectWatchdogTarget(
    new Date("2026-07-23T15:30:00.000Z").getTime(),
    { minLagMinutes: 20, maxLagMinutes: 360 },
  );

  assert.equal(early.skipReason, "too_early");
  assert.equal(old.label, "2026-07-23 17:00 JST");
  assert.equal(old.skipReason, "too_old");
});

test("watchdog resolves the previous day's 01:00 JST slot", () => {
  const target = selectWatchdogTarget(
    new Date("2026-07-22T16:27:00.000Z").getTime(),
    { minLagMinutes: 20, maxLagMinutes: 360 },
  );

  assert.equal(target.label, "2026-07-23 01:00 JST");
  assert.equal(target.executionBoundaryAt, "2026-07-22T16:00:00.000Z");
});

test("target classification accepts scheduled and marked watchdog runs only", () => {
  const target = parseWatchdogTarget("2026-07-23T08:00:00.000Z");
  const result = classifyTargetRuns([
    {
      id: 1,
      event: "schedule",
      status: "completed",
      conclusion: "success",
      created_at: "2026-07-23T08:04:00.000Z",
    },
    {
      id: 2,
      event: "workflow_dispatch",
      display_title: watchdogRunTitle(target),
      status: "queued",
      conclusion: null,
      created_at: "2026-07-23T08:28:00.000Z",
    },
    {
      id: 3,
      event: "workflow_dispatch",
      display_title: "Orderbook depth",
      status: "completed",
      conclusion: "success",
      created_at: "2026-07-23T08:05:00.000Z",
    },
    {
      id: 4,
      event: "schedule",
      status: "completed",
      conclusion: "failure",
      created_at: "2026-07-23T00:04:00.000Z",
    },
  ], target);

  assert.deepEqual(result.successful.map((run) => run.id), [1]);
  assert.deepEqual(result.active.map((run) => run.id), [2]);
  assert.deepEqual(result.unsuccessful, []);
});

test("current run is excluded from duplicate-completion checks", () => {
  const target = parseWatchdogTarget("2026-07-23T08:00:00.000Z");
  const result = classifyTargetRuns([
    {
      id: 55,
      event: "workflow_dispatch",
      display_title: watchdogRunTitle(target),
      status: "in_progress",
      conclusion: null,
      created_at: "2026-07-23T08:27:00.000Z",
    },
  ], target, { currentRunId: "55" });

  assert.deepEqual(result.active, []);
});

test("watchdog dispatch enables Slack and carries a non-secret slot marker", () => {
  const target = parseWatchdogTarget("2026-07-23T08:00:00.000Z");

  assert.deepEqual(workflowDispatchInputs(target), {
    post_to_slack: "true",
    watchdog_target: "2026-07-23T08:00:00.000Z",
  });
});

test("watchdog rejects timestamps outside configured schedule boundaries", () => {
  assert.throws(
    () => parseWatchdogTarget("2026-07-23T08:30:00.000Z"),
    /must match a configured JST/,
  );
});
