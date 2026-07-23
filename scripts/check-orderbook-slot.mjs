import { appendFile } from "node:fs/promises";
import { createGitHubActionsClient, publicWorkflowRun } from "../src/github-actions.mjs";
import {
  ORDERBOOK_WORKFLOW,
  classifyTargetRuns,
  resolveRunTarget,
} from "../src/watchdog.mjs";

const eventName = String(process.env.EVENT_NAME || "");
const watchdogTarget = String(process.env.WATCHDOG_TARGET || "").trim();
const outputPath = String(process.env.GITHUB_OUTPUT || "").trim();

if (!outputPath) {
  throw new Error("GITHUB_OUTPUT is missing");
}

if (eventName !== "schedule" && !watchdogTarget) {
  await writeOutputs(true, "manual_run");
  console.log(JSON.stringify({
    shouldPost: true,
    reason: "manual_run",
  }, null, 2));
} else {
  const target = resolveRunTarget({ eventName, watchdogTarget });
  if (!target) throw new Error("Could not resolve the current orderbook schedule target");

  const github = createGitHubActionsClient({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
  });
  const runs = await github.listWorkflowRuns(ORDERBOOK_WORKFLOW);
  const classification = classifyTargetRuns(runs, target, {
    currentRunId: process.env.GITHUB_RUN_ID,
  });
  const priorSuccess = classification.successful[0];
  const shouldPost = !priorSuccess;
  const reason = shouldPost ? "target_not_completed" : "target_already_completed";

  await writeOutputs(shouldPost, reason);
  console.log(JSON.stringify({
    shouldPost,
    reason,
    target,
    priorSuccess: priorSuccess ? publicWorkflowRun(priorSuccess) : null,
  }, null, 2));
}

async function writeOutputs(shouldPost, reason) {
  await appendFile(
    outputPath,
    `should_post=${shouldPost ? "true" : "false"}\nreason=${reason}\n`,
    "utf8",
  );
}
