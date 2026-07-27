import { publicWorkflowRun } from "./github-actions.mjs";
import { classifyTargetRuns } from "./watchdog.mjs";

export async function waitForTargetSuccess({
  listRuns,
  target,
  titlePrefix,
  timeoutMs = 360_000,
  pollIntervalMs = 10_000,
  nowImpl = Date.now,
  sleepImpl = sleep,
} = {}) {
  if (typeof listRuns !== "function") {
    throw new Error("listRuns must be a function");
  }

  const startedAt = nowImpl();
  let attempts = 0;
  let lastClassification;

  while (true) {
    attempts += 1;
    const runs = await listRuns();
    lastClassification = classifyTargetRuns(runs, target, { titlePrefix });
    const successfulRun = lastClassification.successful[0];

    if (successfulRun) {
      return {
        attempts,
        target,
        run: publicWorkflowRun(successfulRun),
      };
    }

    if (nowImpl() - startedAt >= timeoutMs) {
      const active = lastClassification.active.map(publicWorkflowRun);
      const unsuccessful = lastClassification.unsuccessful.map(publicWorkflowRun);
      throw new Error(
        `Timed out waiting for the orderbook report for ${target.label}`
        + ` (active=${active.length}, unsuccessful=${unsuccessful.length})`,
      );
    }

    await sleepImpl(pollIntervalMs);
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
