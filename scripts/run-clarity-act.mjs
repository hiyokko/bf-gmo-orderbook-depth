import path from "node:path";
import { fileURLToPath } from "node:url";
import { runClarityReport } from "../src/clarity-application.mjs";
import { loadEnvFile } from "../src/env.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  await main();
} catch (error) {
  console.error(`CLARITY Act report failed: ${
    error instanceof Error ? error.message : String(error)
  }`);
  process.exitCode = 1;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputPath = path.join(repositoryRoot, "output", "clarity-latest.json");
  if (!options.dryRun) await loadEnvFile(path.join(repositoryRoot, ".env"));

  const result = await runClarityReport({
    dryRun: options.dryRun,
    webhookUrl: process.env.SLACK_WEBHOOK_URL?.trim(),
    outputPath,
  });
  console.log(`Snapshot saved: ${result.outputPath}`);
  console.log(
    `CLARITY Act YES: ${(result.report.market.yesProbability * 100).toFixed(1)}%`,
  );
  console.log(
    options.dryRun
      ? "Slack: dry-run (not posted)"
      : `Slack: ${result.report.slack.posted ? "posted (ok)" : "failed"}`,
  );
}

function parseArguments(argumentsList) {
  const supported = new Set(["--dry-run"]);
  const unknown = argumentsList.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  }
  return { dryRun: argumentsList.includes("--dry-run") };
}
