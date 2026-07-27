import { createGitHubActionsClient } from "../src/github-actions.mjs";
import {
  hasRecoveryFailures,
  recoverReports,
} from "../src/watchdog-application.mjs";
import {
  ORDERBOOK_WORKFLOW,
  SPREAD_COMPARISON_WORKFLOW,
  SPREAD_WATCHDOG_TITLE_PREFIX,
  WATCHDOG_TITLE_PREFIX,
  selectWatchdogTarget,
} from "../src/watchdog.mjs";

const REPORTS = Object.freeze([
  Object.freeze({
    id: "orderbookDepth",
    label: "Orderbook depth",
    workflow: ORDERBOOK_WORKFLOW,
    titlePrefix: WATCHDOG_TITLE_PREFIX,
  }),
  Object.freeze({
    id: "spreadComparison",
    label: "Spread comparison",
    workflow: SPREAD_COMPARISON_WORKFLOW,
    titlePrefix: SPREAD_WATCHDOG_TITLE_PREFIX,
  }),
]);

const target = selectWatchdogTarget(Date.now(), {
  minLagMinutes: readNumberEnv("WATCHDOG_MIN_LAG_MINUTES", 20),
  maxLagMinutes: readNumberEnv("WATCHDOG_MAX_LAG_MINUTES", 360),
});

if (!target) {
  console.log(JSON.stringify({
    skipped: true,
    reason: "no_watchdog_target",
  }, null, 2));
} else if (target.skipReason) {
  console.log(JSON.stringify({
    skipped: true,
    reason: target.skipReason,
    target,
  }, null, 2));
} else {
  const github = createGitHubActionsClient({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
  });
  const dryRun = readBooleanEnv("WATCHDOG_DRY_RUN");
  const results = await recoverReports({
    github,
    reports: REPORTS,
    target,
    dryRun,
    ref: process.env.GITHUB_REF_NAME || "main",
  });
  console.log(JSON.stringify({
    watchdog: true,
    dryRun,
    target,
    results,
  }, null, 2));
  if (hasRecoveryFailures(results)) process.exitCode = 1;
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readBooleanEnv(name) {
  return /^(1|true|yes)$/i.test(String(process.env[name] || ""));
}
