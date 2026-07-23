import { fetchSnapshots } from "./orderbook.mjs";
import {
  createSlackText,
  postToSlack,
} from "./slack.mjs";
import {
  createReport,
  formatJst,
  saveReport,
} from "./report.mjs";

export async function runOrderbookDepth({
  dryRun = false,
  webhookUrl,
  outputPath,
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date(),
} = {}) {
  if (!outputPath) throw new Error("Output path is required");
  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    throw new Error("Fetched time must be a valid Date");
  }

  const snapshots = await fetchSnapshots({ fetchImpl });
  const slackText = createSlackText(snapshots, formatJst(fetchedAt));
  const slack = {
    requested: !dryRun,
    posted: false,
    response: null,
    error: null,
  };

  let postError = null;
  if (!dryRun) {
    try {
      slack.response = await postToSlack(slackText, webhookUrl, { fetchImpl });
      slack.posted = true;
    } catch (error) {
      postError = error instanceof Error ? error : new Error(String(error));
      slack.error = postError.message;
    }
  }

  const report = createReport({ snapshots, fetchedAt, slack });
  await saveReport(report, outputPath);
  if (postError) throw postError;

  return {
    report,
    slackText,
    outputPath,
  };
}
