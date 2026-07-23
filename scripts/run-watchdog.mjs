import {
  classifyTargetRuns,
  dispatchOrderbookWorkflow,
  fetchWorkflowRuns,
  publicRun,
  selectWatchdogTarget,
  workflowDispatchInputs,
} from "../src/watchdog.mjs";

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
  const request = {
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
  };
  const runs = await fetchWorkflowRuns(request);
  const classification = classifyTargetRuns(runs, target);
  const successful = classification.successful[0];
  const active = classification.active[0];

  if (successful) {
    console.log(JSON.stringify({
      skipped: true,
      reason: "target_already_completed",
      target,
      run: publicRun(successful),
    }, null, 2));
  } else if (active) {
    console.log(JSON.stringify({
      skipped: true,
      reason: "target_run_active",
      target,
      run: publicRun(active),
    }, null, 2));
  } else if (readBooleanEnv("WATCHDOG_DRY_RUN")) {
    console.log(JSON.stringify({
      dryRun: true,
      wouldDispatch: true,
      target,
      inputs: workflowDispatchInputs(target),
      unsuccessfulRuns: classification.unsuccessful.map(publicRun),
    }, null, 2));
  } else {
    const dispatch = await dispatchOrderbookWorkflow(target, {
      ...request,
      ref: process.env.GITHUB_REF_NAME || "main",
    });
    console.log(JSON.stringify({
      watchdog: true,
      dispatched: true,
      target,
      dispatch,
      unsuccessfulRuns: classification.unsuccessful.map(publicRun),
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
