import { createGitHubActionsClient } from "../src/github-actions.mjs";
import { waitForTargetSuccess } from "../src/report-order.mjs";
import {
  SPREAD_COMPARISON_WORKFLOW,
  SPREAD_WATCHDOG_TITLE_PREFIX,
  resolveRunTarget,
} from "../src/watchdog.mjs";

const eventName = String(process.env.EVENT_NAME || "");
const watchdogTarget = String(process.env.WATCHDOG_TARGET || "").trim();

if (eventName !== "schedule" && !watchdogTarget) {
  console.log(JSON.stringify({
    skipped: true,
    reason: "manual_clarity_run",
  }, null, 2));
} else {
  const target = resolveRunTarget({ eventName, watchdogTarget });
  if (!target) throw new Error("Could not resolve the spread dependency target");

  const github = createGitHubActionsClient({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
  });
  const result = await waitForTargetSuccess({
    listRuns: () => github.listWorkflowRuns(SPREAD_COMPARISON_WORKFLOW),
    target,
    titlePrefix: SPREAD_WATCHDOG_TITLE_PREFIX,
    dependencyLabel: "spread report",
    timeoutMs: readPositiveNumber("SPREAD_WAIT_TIMEOUT_MS", 480_000),
    pollIntervalMs: readPositiveNumber("SPREAD_POLL_INTERVAL_MS", 10_000),
  });

  console.log(JSON.stringify({
    dependency: "spreadComparison",
    status: "completed",
    ...result,
  }, null, 2));
}

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
