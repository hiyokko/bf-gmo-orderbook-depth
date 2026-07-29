import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClarityTextChart } from "./clarity-chart.mjs";
import {
  createClarityQuickChartUrl,
  verifyQuickChartImage,
} from "./clarity-quickchart.mjs";
import { calculateChangeMetrics } from "./clarity-metrics.mjs";
import { createClarityPeriodSnapshots } from "./clarity-periods.mjs";
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
  const charts = createClarityPeriodSnapshots(snapshot).map((period) => (
    createChart(period)
  ));
  if (!dryRun) {
    await Promise.all(charts.map(
      (chart) => verifyChart(chart, { fetchImpl }),
    ));
  }
  const slackPayload = createClaritySlackPayload(snapshot, charts);
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
    textChart: charts[0].textChart,
    quickChart: toLegacyQuickChart(charts[0]),
    charts: charts.map(toReportChart),
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

function createChart(period) {
  const chart = {
    id: period.id,
    label: period.label,
    textChart: createClarityTextChart(period.snapshot),
    changeMetrics: calculateChangeMetrics(period.snapshot.history),
    imageUrl: null,
    verified: null,
    included: false,
    error: null,
  };
  try {
    chart.imageUrl = createClarityQuickChartUrl(period.snapshot, {
      maxPoints: period.chartPoints,
      periodLabel: period.label,
    });
    chart.included = true;
  } catch (error) {
    chart.error = toError(error).message;
  }
  return chart;
}

async function verifyChart(chart, { fetchImpl }) {
  if (!chart.imageUrl) return;
  try {
    await verifyQuickChartImage(chart.imageUrl, { fetchImpl });
    chart.verified = true;
  } catch (error) {
    chart.verified = false;
    chart.included = false;
    chart.error = toError(error).message;
    chart.imageUrl = null;
  }
}

function toReportChart(chart) {
  return {
    id: chart.id,
    label: chart.label,
    textChart: chart.textChart,
    changeMetrics: chart.changeMetrics,
    imageUrl: chart.imageUrl,
    verified: chart.verified,
    included: chart.included,
    error: chart.error,
  };
}

function toLegacyQuickChart(chart) {
  return {
    url: chart.imageUrl,
    verified: chart.verified,
    included: chart.included,
    error: chart.error,
  };
}
