import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env.mjs";
import { runSpreadComparison } from "../src/spread-application.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  await main();
} catch (error) {
  console.error(`Spread comparison failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputPath = path.join(repositoryRoot, "output", "spread-latest.json");
  if (!options.dryRun) await loadEnvFile(path.join(repositoryRoot, ".env"));

  const result = await runSpreadComparison({
    dryRun: options.dryRun,
    webhookUrl: process.env.SLACK_WEBHOOK_URL?.trim(),
    outputPath,
    disabledVenues: parseDisabledVenues(process.env.SPREAD_DISABLED_VENUES),
  });
  console.log(`Snapshot saved: ${result.outputPath}`);
  console.log(`SBIVC spot symbols: ${result.report.listings.spot.length}`);
  console.log(`SBIVC leverage symbols: ${result.report.listings.leverage.length}`);
  if (result.report.disabledVenues.length > 0) {
    console.log(`Disabled venues: ${result.report.disabledVenues.join(", ")}`);
  }
  const sourceErrors = Object.entries(result.report.errors)
    .flatMap(([market, venues]) => Object.entries(venues)
      .filter(([, message]) => Boolean(message))
      .map(([venue, message]) => `${market}/${venue}: ${message}`));
  if (sourceErrors.length > 0) {
    console.warn(`Source errors: ${sourceErrors.join(" | ")}`);
  }
  console.log(
    options.dryRun
      ? "Slack: dry-run (not posted)"
      : `Slack: ${result.report.slack.posted ? "posted (ok)" : "failed"}`,
  );
}

function parseArguments(argumentsList) {
  const supported = new Set(["--dry-run"]);
  const unknown = argumentsList.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  return { dryRun: argumentsList.includes("--dry-run") };
}

function parseDisabledVenues(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((venue) => venue.trim())
      .filter(Boolean),
  )];
}
