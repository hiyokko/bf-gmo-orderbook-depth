import { publicWorkflowRun } from "./github-actions.mjs";
import {
  classifyTargetRuns,
  decideRecovery,
  workflowDispatchInputs,
} from "./watchdog.mjs";

export async function recoverReports({
  github,
  reports,
  target,
  dryRun = false,
  ref = "main",
} = {}) {
  const tasks = reports.map(async (report) => {
    try {
      return await recoverReport({
        github,
        report,
        target,
        dryRun,
        ref,
      });
    } catch (error) {
      return {
        id: report.id,
        label: report.label,
        workflow: report.workflow,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return Promise.all(tasks);
}

export function hasRecoveryFailures(results = []) {
  return results.some((result) => result.status === "failed");
}

async function recoverReport({
  github,
  report,
  target,
  dryRun,
  ref,
}) {
  const runs = await github.listWorkflowRuns(report.workflow);
  const classification = classifyTargetRuns(runs, target, {
    titlePrefix: report.titlePrefix,
  });
  const decision = decideRecovery(classification, { dryRun });
  const baseResult = {
    id: report.id,
    label: report.label,
    workflow: report.workflow,
  };

  if (decision.action === "skip") {
    return {
      ...baseResult,
      status: "skipped",
      reason: decision.reason,
      run: publicWorkflowRun(decision.run),
    };
  }

  const inputs = workflowDispatchInputs(target);
  const unsuccessfulRuns = classification.unsuccessful.map(publicWorkflowRun);

  if (decision.action === "dry_run") {
    return {
      ...baseResult,
      status: "dry_run",
      wouldDispatch: true,
      inputs,
      unsuccessfulRuns,
    };
  }

  const dispatch = await github.dispatchWorkflow(report.workflow, {
    ref,
    inputs,
  });
  return {
    ...baseResult,
    status: "dispatched",
    dispatch,
    unsuccessfulRuns,
  };
}
