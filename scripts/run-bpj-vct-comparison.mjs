import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBpjVctComparison } from "../src/bpj-vct-application.mjs";
import { loadEnvFile } from "../src/env.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  await main();
} catch (error) {
  console.error(`BPJ/VCT comparison failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputPath = path.join(repositoryRoot, "output", "bpj-vct-latest.json");
  if (!options.dryRun) await loadEnvFile(path.join(repositoryRoot, ".env"));

  const result = await runBpjVctComparison({
    dryRun: options.dryRun,
    webhookUrl: process.env.SLACK_WEBHOOK_URL?.trim(),
    outputPath,
  });
  console.log(`Snapshot saved: ${result.outputPath}`);
  console.log(`BITPOINT dealer quotes: ${result.report.sourceQuoteCounts.bpj}`);
  console.log(`SBI VC dealer quotes: ${result.report.sourceQuoteCounts.vct}`);
  console.log(options.dryRun ? "Slack: dry-run (not posted)" : "Slack: posted (ok)");
}

function parseArguments(argumentsList) {
  const supported = new Set(["--dry-run"]);
  const unknown = argumentsList.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  return { dryRun: argumentsList.includes("--dry-run") };
}
