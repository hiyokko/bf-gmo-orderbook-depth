import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReport,
  createSlackText,
  fetchSnapshots,
  formatJst,
  postToSlack,
  validateWebhookUrl,
} from "./src/orderbook-depth.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(scriptDirectory, "output");
const outputPath = path.join(outputDirectory, "latest.json");
const envPath = path.join(scriptDirectory, ".env");
const dryRun = process.argv.includes("--dry-run");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument: ${unknownArguments.join(", ")}`);
}

async function loadEnv(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const snapshots = await fetchSnapshots();
const fetchedAt = new Date();
const slackText = createSlackText(snapshots, formatJst(fetchedAt));
const slack = {
  requested: !dryRun,
  posted: false,
  response: null,
  error: null,
};

if (!dryRun) {
  try {
    await loadEnv(envPath);
    const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
    if (!validateWebhookUrl(webhookUrl)) {
      throw new Error("SLACK_WEBHOOK_URL is missing or invalid");
    }
    slack.response = await postToSlack(slackText, webhookUrl);
    slack.posted = true;
  } catch (error) {
    slack.error = error instanceof Error ? error.message : String(error);
  }
}

const report = createReport({ snapshots, fetchedAt, slack });
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Snapshot saved: ${outputPath}`);
console.log(`Fetched at: ${report.fetchedAtJst} JST`);
console.log(dryRun ? "Slack: dry-run (not posted)" : `Slack: ${slack.posted ? "posted (ok)" : "failed"}`);

if (slack.error) {
  throw new Error(slack.error);
}
