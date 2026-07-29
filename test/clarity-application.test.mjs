import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runClarityReport } from "../src/clarity-application.mjs";

const SNAPSHOT = {
  eventId: "158505",
  marketId: "1163699",
  title: "Clarity Act (H.R.3633) signed into law in 2026?",
  sourceUrl: "https://polymarket.com/ja/event/clarity-act-signed-into-law-in-2026",
  fetchedAt: "2026-07-29T12:00:00.000Z",
  yesProbability: 0.295,
  yesTokenId: "123456789",
  active: true,
  closed: false,
  endDate: "2027-01-01T05:00:00Z",
  volume: 2_926_230.91,
  liquidity: 50_810.53,
  history: [
    { timestamp: 1_785_153_600, probability: 0.42 },
    { timestamp: 1_785_240_000, probability: 0.37 },
    { timestamp: 1_785_326_400, probability: 0.295 },
  ],
};

test("CLARITY application saves JSON-only chart report without posting in dry-run", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "clarity-report-"));
  const outputPath = path.join(directory, "latest.json");
  try {
    const result = await runClarityReport({
      dryRun: true,
      outputPath,
      fetchedAt: new Date("2026-07-29T12:00:00.000Z"),
      fetchMarketImpl: async () => SNAPSHOT,
      fetchImpl: async () => {
        throw new Error("Slack must not be called");
      },
    });
    const saved = JSON.parse(await readFile(outputPath, "utf8"));

    assert.equal(result.report.slack.requested, false);
    assert.match(saved.textChart, /current 29\.5%/);
    assert.doesNotMatch(JSON.stringify(saved), /quickchart|image_url/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLARITY application posts Block Kit payload through the existing webhook", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "clarity-report-"));
  const outputPath = path.join(directory, "latest.json");
  let postedPayload;
  try {
    const result = await runClarityReport({
      outputPath,
      webhookUrl: "https://hooks.slack.com/services/T111/B222/secret",
      fetchMarketImpl: async () => SNAPSHOT,
      fetchImpl: async (_url, options) => {
        postedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () => "ok",
        };
      },
    });

    assert.equal(result.report.slack.posted, true);
    assert.match(postedPayload.text, /YES 29\.5%/);
    assert.equal(postedPayload.blocks.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
