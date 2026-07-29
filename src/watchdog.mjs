import {
  ORDERBOOK_SCHEDULE,
  WORKFLOWS,
} from "./config.mjs";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ACTIVE_RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
  "requested",
]);

export const WATCHDOG_TITLE_PREFIX = "Orderbook depth watchdog ";
export const ORDERBOOK_WORKFLOW = WORKFLOWS.orderbook;
export const SPREAD_WATCHDOG_TITLE_PREFIX = "Spread comparison watchdog ";
export const SPREAD_COMPARISON_WORKFLOW = WORKFLOWS.spreadComparison;
export const CLARITY_WATCHDOG_TITLE_PREFIX = "Polymarket CLARITY Act watchdog ";
export const CLARITY_ACT_WORKFLOW = WORKFLOWS.clarityAct;

export function latestScheduleTarget(now = Date.now()) {
  const nowMs = finiteTimestamp(now);
  if (nowMs === null) return null;

  const jstDayStart = Math.floor((nowMs + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
  const candidates = [];

  for (const dayOffset of [1, 0]) {
    for (const hour of ORDERBOOK_SCHEDULE.hoursJst) {
      const boundaryMs = jstDayStart - dayOffset * DAY_MS + hour * HOUR_MS;
      if (boundaryMs <= nowMs) candidates.push(createTarget(boundaryMs));
    }
  }

  return candidates.sort((left, right) => right.boundaryMs - left.boundaryMs)[0] ?? null;
}

export function selectWatchdogTarget(now = Date.now(), {
  minLagMinutes = ORDERBOOK_SCHEDULE.watchdogMinLagMinutes,
  maxLagMinutes = ORDERBOOK_SCHEDULE.watchdogMaxLagMinutes,
} = {}) {
  const nowMs = finiteTimestamp(now);
  if (nowMs === null) return null;

  const target = latestScheduleTarget(nowMs);
  if (!target) return null;

  const minLagMs = positiveMinutes(minLagMinutes, 0) * 60 * 1000;
  const maxLagMs = Math.max(
    minLagMs,
    positiveMinutes(maxLagMinutes, ORDERBOOK_SCHEDULE.watchdogMaxLagMinutes) * 60 * 1000,
  );
  const lagMs = nowMs - target.boundaryMs;
  const result = {
    ...target,
    lagMinutes: Math.floor(lagMs / 60000),
  };

  if (lagMs < minLagMs) return { ...result, skipReason: "too_early" };
  if (lagMs > maxLagMs) return { ...result, skipReason: "too_old" };
  return result;
}

export function parseWatchdogTarget(value) {
  const boundaryMs = Date.parse(String(value || ""));
  if (!Number.isFinite(boundaryMs)) {
    throw new Error("watchdog_target must be a valid ISO timestamp");
  }

  const jstDate = new Date(boundaryMs + JST_OFFSET_MS);
  const valid = ORDERBOOK_SCHEDULE.hoursJst.includes(jstDate.getUTCHours())
    && jstDate.getUTCMinutes() === 0
    && jstDate.getUTCSeconds() === 0
    && jstDate.getUTCMilliseconds() === 0;
  if (!valid) {
    throw new Error("watchdog_target must match a configured JST 01:00, 09:00, or 17:00 boundary");
  }

  return createTarget(boundaryMs);
}

export function resolveRunTarget({
  eventName,
  watchdogTarget,
  now = Date.now(),
} = {}) {
  if (watchdogTarget) return parseWatchdogTarget(watchdogTarget);
  if (eventName === "schedule") return latestScheduleTarget(now);
  return null;
}

export function watchdogRunTitle(target, {
  titlePrefix = WATCHDOG_TITLE_PREFIX,
} = {}) {
  return `${titlePrefix}${target.executionBoundaryAt}`;
}

export function workflowDispatchInputs(target) {
  return {
    post_to_slack: "true",
    watchdog_target: target.executionBoundaryAt,
  };
}

export function classifyTargetRuns(runs = [], target, {
  currentRunId = "",
  titlePrefix = WATCHDOG_TITLE_PREFIX,
} = {}) {
  const currentId = String(currentRunId || "");
  const relevant = runs
    .filter((run) => String(run?.id ?? "") !== currentId)
    .filter((run) => runMatchesTarget(run, target, titlePrefix))
    .sort((left, right) => runTimestamp(right) - runTimestamp(left));

  return {
    successful: relevant.filter(
      (run) => run.status === "completed" && run.conclusion === "success",
    ),
    active: relevant.filter((run) => ACTIVE_RUN_STATUSES.has(String(run.status || ""))),
    unsuccessful: relevant.filter(
      (run) => run.status === "completed" && run.conclusion !== "success",
    ),
  };
}

export function decideRecovery(classification, {
  dryRun = false,
} = {}) {
  if (classification.successful[0]) {
    return {
      action: "skip",
      reason: "target_already_completed",
      run: classification.successful[0],
    };
  }
  if (classification.active[0]) {
    return {
      action: "skip",
      reason: "target_run_active",
      run: classification.active[0],
    };
  }
  return {
    action: dryRun ? "dry_run" : "dispatch",
    reason: "target_not_completed",
  };
}

function createTarget(boundaryMs) {
  return {
    label: formatJstBoundary(boundaryMs),
    boundaryMs,
    nextBoundaryMs: boundaryMs + ORDERBOOK_SCHEDULE.intervalHours * HOUR_MS,
    executionBoundaryAt: new Date(boundaryMs).toISOString(),
  };
}

function formatJstBoundary(boundaryMs) {
  const date = new Date(boundaryMs + JST_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00 JST`;
}

function runMatchesTarget(run, target, titlePrefix) {
  if (!run || !target) return false;
  if (
    run.event === "workflow_dispatch"
    && run.display_title === watchdogRunTitle(target, { titlePrefix })
  ) {
    return true;
  }
  if (run.event !== "schedule") return false;

  const timestamp = runTimestamp(run);
  return timestamp >= target.boundaryMs && timestamp < target.nextBoundaryMs;
}

function runTimestamp(run) {
  const timestamp = Date.parse(run?.created_at || run?.run_started_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function finiteTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function positiveMinutes(value, fallback) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : fallback;
}
