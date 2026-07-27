import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { postToSlack } from "./slack.mjs";
import { createSpreadComparison } from "./spread-comparison.mjs";
import {
  createSpreadSlackMessages,
  createSpreadSlackText,
} from "./spread-slack.mjs";
import { collectSpreadSources } from "./spread-sources.mjs";

export async function runSpreadComparison({
  dryRun = false,
  webhookUrl,
  outputPath,
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date(),
  collectImpl = collectSpreadSources,
  disabledVenues = [],
} = {}) {
  if (!outputPath) throw new Error("Output path is required");
  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    throw new Error("Fetched time must be a valid Date");
  }

  const collected = await collectImpl({ fetchImpl, disabledVenues });
  const comparison = createSpreadComparison(collected);
  const slackMessages = createSpreadSlackMessages(comparison, collected.errors);
  const slackText = createSpreadSlackText(comparison, collected.errors);
  const slack = {
    requested: !dryRun,
    posted: false,
    response: null,
    messageCount: slackMessages.length,
    error: null,
  };

  let postError = null;
  if (!dryRun) {
    try {
      slack.response = [];
      for (const message of slackMessages) {
        slack.response.push(await postToSlack(message, webhookUrl, { fetchImpl }));
      }
      slack.posted = true;
    } catch (error) {
      postError = error instanceof Error ? error : new Error(String(error));
      slack.error = postError.message;
    }
  }

  const report = {
    fetchedAt: fetchedAt.toISOString(),
    basis: {
      symbols: "SBIVC公式サービス概要の現在取扱銘柄",
      spread: "ask - bid",
      mid: "(ask + bid) / 2",
      spreadPercent: "(ask - bid) / mid * 100",
    },
    listings: collected.listings,
    disabledVenues,
    errors: collected.errors,
    slack,
    comparison,
  };
  await saveJson(report, outputPath);
  if (postError) throw postError;

  return { report, slackText, slackMessages, outputPath };
}

async function saveJson(report, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
