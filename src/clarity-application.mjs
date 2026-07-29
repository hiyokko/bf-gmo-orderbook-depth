import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClarityTextChart } from "./clarity-chart.mjs";
import {
  createClarityQuickChartUrl,
  verifyQuickChartImage,
} from "./clarity-quickchart.mjs";
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
  const quickChart = {
    url: null,
    verified: null,
    included: false,
    error: null,
  };
  let imageUrl = null;
  try {
    quickChart.url = createClarityQuickChartUrl(snapshot);
    imageUrl = quickChart.url;
  } catch (error) {
    quickChart.error = toError(error).message;
  }

  if (!dryRun && imageUrl) {
    try {
      await verifyQuickChartImage(imageUrl, { fetchImpl });
      quickChart.verified = true;
    } catch (error) {
      quickChart.verified = false;
      quickChart.error = toError(error).message;
      imageUrl = null;
    }
  }
  quickChart.included = Boolean(imageUrl);
  const slackPayload = createClaritySlackPayload(snapshot, textChart, {
    imageUrl,
  });
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
    quickChart,
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

function toError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
