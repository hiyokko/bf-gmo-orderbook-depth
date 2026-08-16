import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBpjVctComparison } from "./bpj-vct-comparison.mjs";
import { createBpjVctSlackText } from "./bpj-vct-slack.mjs";
import { collectBpjVctSources } from "./bpj-vct-sources.mjs";
import { postToSlack } from "./slack.mjs";

export async function runBpjVctComparison({
  dryRun = false,
  webhookUrl,
  outputPath,
  fetchImpl = globalThis.fetch,
  fetchedAt = new Date(),
  collectImpl = collectBpjVctSources,
} = {}) {
  if (!outputPath) throw new Error("Output path is required");
  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    throw new Error("Fetched time must be a valid Date");
  }

  const sources = await collectImpl({ fetchImpl });
  const comparison = createBpjVctComparison(sources);
  const slackText = createBpjVctSlackText(comparison, fetchedAt);
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

  const report = {
    fetchedAt: fetchedAt.toISOString(),
    basis: {
      market: "dealer",
      sellPercent: "(VCT bid - BPJ bid) / BPJ bid * 100",
      buyPercent: "(VCT ask - BPJ ask) / BPJ ask * 100",
    },
    sourceUpdatedAt: {
      bpj: sources.bpj.updatedAt,
      vct: sources.vct.updatedAt,
    },
    sourceQuoteCounts: {
      bpj: Object.keys(sources.bpj.quotes).length,
      vct: Object.keys(sources.vct.quotes).length,
    },
    slack,
    comparison,
  };
  await saveJson(report, outputPath);
  if (postError) throw postError;
  return { report, slackText, outputPath };
}

async function saveJson(report, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
