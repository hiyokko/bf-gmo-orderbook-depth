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

test("CLARITY application saves a QuickChart preview without posting in dry-run", async () => {
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
    assert.equal(result.report.quickChart.included, true);
    assert.equal(result.report.quickChart.verified, null);
    assert.match(result.report.quickChart.url, /^https:\/\/quickchart\.io\//);
    assert.equal(result.report.charts.length, 3);
    assert.deepEqual(
      result.report.charts.map(({ id }) => id),
      ["all", "month", "week"],
    );
    assert.ok(result.report.charts.every(({ included }) => included));
    assert.match(saved.textChart, /^100% ┤/);
    assert.match(saved.textChart, /  0% └/);
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
      fetchImpl: async (url, options) => {
        if (String(url).startsWith("https://quickchart.io/")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "image/png" }),
            body: null,
          };
        }
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
    assert.equal(postedPayload.blocks.length, 9);
    assert.equal(postedPayload.blocks[0].type, "header");
    assert.deepEqual(
      postedPayload.blocks.slice(5, 8).map(({ type }) => type),
      ["image", "image", "image"],
    );
    assert.equal(result.report.quickChart.verified, true);
    assert.ok(result.report.charts.every(({ verified }) => verified));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLARITY application falls back to text when QuickChart is unavailable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "clarity-report-"));
  const outputPath = path.join(directory, "latest.json");
  let postedPayload;
  try {
    const result = await runClarityReport({
      outputPath,
      webhookUrl: "https://hooks.slack.com/services/T111/B222/secret",
      fetchMarketImpl: async () => SNAPSHOT,
      fetchImpl: async (url, options) => {
        if (String(url).startsWith("https://quickchart.io/")) {
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            body: null,
          };
        }
        postedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () => "ok",
        };
      },
    });

    assert.equal(result.report.slack.posted, true);
    assert.equal(result.report.quickChart.verified, false);
    assert.match(result.report.quickChart.error, /HTTP 503/);
    assert.deepEqual(
      postedPayload.blocks.slice(5, 8).map(({ type }) => type),
      ["section", "section", "section"],
    );
    assert.match(
      postedPayload.blocks[5].text.text,
      /^\*All history\*/m,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
