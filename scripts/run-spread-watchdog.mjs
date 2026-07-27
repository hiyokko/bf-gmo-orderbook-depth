import {
  createGitHubActionsClient,
  publicWorkflowRun,
} from "../src/github-actions.mjs";
import {
  SPREAD_COMPARISON_WORKFLOW,
  SPREAD_WATCHDOG_TITLE_PREFIX,
  classifyTargetRuns,
  decideRecovery,
  selectWatchdogTarget,
  workflowDispatchInputs,
} from "../src/watchdog.mjs";

const target = selectWatchdogTarget(Date.now(), {
  minLagMinutes: readNumberEnv("WATCHDOG_MIN_LAG_MINUTES", 20),
  maxLagMinutes: readNumberEnv("WATCHDOG_MAX_LAG_MINUTES", 360),
});

if (!target) {
  console.log(JSON.stringify({ skipped: true, reason: "no_watchdog_target" }, null, 2));
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
  const runs = await github.listWorkflowRuns(SPREAD_COMPARISON_WORKFLOW);
  const classification = classifyTargetRuns(runs, target, {
    titlePrefix: SPREAD_WATCHDOG_TITLE_PREFIX,
  });
  const decision = decideRecovery(classification, {
    dryRun: readBooleanEnv("WATCHDOG_DRY_RUN"),
  });

  if (decision.action === "skip") {
    console.log(JSON.stringify({
      skipped: true,
      reason: decision.reason,
      target,
      run: publicWorkflowRun(decision.run),
    }, null, 2));
  } else if (decision.action === "dry_run") {
    console.log(JSON.stringify({
      dryRun: true,
      wouldDispatch: true,
      target,
      inputs: workflowDispatchInputs(target),
      unsuccessfulRuns: classification.unsuccessful.map(publicWorkflowRun),
    }, null, 2));
  } else {
    const dispatch = await github.dispatchWorkflow(SPREAD_COMPARISON_WORKFLOW, {
      ref: process.env.GITHUB_REF_NAME || "main",
      inputs: workflowDispatchInputs(target),
    });
    console.log(JSON.stringify({
      watchdog: true,
      dispatched: true,
      target,
      dispatch,
      unsuccessfulRuns: classification.unsuccessful.map(publicWorkflowRun),
    }, null, 2));
  }
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readBooleanEnv(name) {
  return /^(1|true|yes)$/i.test(String(process.env[name] || ""));
}
