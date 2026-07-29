import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClarityTextChart } from "./clarity-chart.mjs";
import { createClaritySlackPayload } from "./clarity-slack.mjs";
import { fetchClarityMarket } from "./polymarket.mjs";
import { postPayloadToSlack } from "./slack.mjs";

export async function runClarityReport({
  dryRun = false,
  webhookUrl,
  outputPath,
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date(),
  fetchMarketImpl = fetchClarityMarket,
} = {}) {
  if (!outputPath) throw new Error("Output path is required");

  const snapshot = await fetchMarketImpl({ fetchImpl, fetchedAt });
  const textChart = createClarityTextChart(snapshot);
  const slackPayload = createClaritySlackPayload(snapshot, textChart);
  const slack = {
    requested: !dryRun,
    posted: false,
    response: null,
    error: null,
  };

  let postError = null;
  if (!dryRun) {
    try {
      slack.response = await postPayloadToSlack(
        slackPayload,
        webhookUrl,
        { fetchImpl },
      );
      slack.posted = true;
    } catch (error) {
      postError = error instanceof Error ? error : new Error(String(error));
      slack.error = postError.message;
    }
  }

  const report = {
    fetchedAt: fetchedAt.toISOString(),
    market: snapshot,
    textChart,
    slack,
  };
  await saveJson(report, outputPath);
  if (postError) throw postError;
  return { report, slackPayload, outputPath };
}

async function saveJson(report, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
