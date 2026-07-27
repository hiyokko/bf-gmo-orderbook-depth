import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSpreadComparison } from "../src/spread-application.mjs";

test("spread application saves a dry-run report without posting", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spread-comparison-"));
  const outputPath = path.join(directory, "latest.json");
  let webhookCalls = 0;

  try {
    const result = await runSpreadComparison({
      dryRun: true,
      outputPath,
      fetchedAt: new Date("2026-07-27T00:00:00.000Z"),
      collectImpl: async () => fixture(),
      fetchImpl: async () => {
        webhookCalls += 1;
        throw new Error("Slack must not be called");
      },
    });
    const saved = JSON.parse(await readFile(outputPath, "utf8"));

    assert.equal(webhookCalls, 0);
    assert.equal(saved.slack.requested, false);
    assert.deepEqual(saved.listings.spot, ["BTC", "POL"]);
    assert.match(result.slackText, /POL/);
    assert.doesNotMatch(result.slackText, /取得時刻|API応答時刻/);
    assert.doesNotMatch(result.slackText, /ERR/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("spread application preserves a report when Slack rejects a post", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spread-comparison-"));
  const outputPath = path.join(directory, "latest.json");

  try {
    await assert.rejects(
      runSpreadComparison({
        outputPath,
        webhookUrl: "https://hooks.slack.com/services/T111/B222/secret",
        collectImpl: async () => fixture(),
        fetchImpl: async () => ({
          ok: false,
          status: 500,
          text: async () => "server_error",
        }),
      }),
      /Slack webhook failed/,
    );
    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(saved.slack.requested, true);
    assert.equal(saved.slack.posted, false);
    assert.match(saved.slack.error, /HTTP 500/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("spread application posts each comparison table as a separate message", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spread-comparison-"));
  const outputPath = path.join(directory, "latest.json");
  const postedBodies = [];

  try {
    const result = await runSpreadComparison({
      outputPath,
      webhookUrl: "https://hooks.slack.com/services/T111/B222/secret",
      collectImpl: async () => fixture(),
      fetchImpl: async (_url, options) => {
        postedBodies.push(JSON.parse(options.body));
        return {
          ok: true,
          status: 200,
          text: async () => "ok",
        };
      },
    });

    assert.equal(result.report.slack.posted, true);
    assert.equal(result.report.slack.messageCount, 4);
    assert.equal(postedBodies.length, 4);
    assert.ok(postedBodies.every(({ text }) => text.length < 4_000));
    assert.ok(postedBodies.every(({ text }) => (text.match(/```/g) || []).length === 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function fixture() {
  return {
    listings: {
      spot: ["BTC", "POL"],
      leverage: ["BTC"],
    },
    quotes: {
      spot: {
        sbivc: { BTC: { bid: 100, ask: 102 } },
      },
      leverage: {
        sbivc: { BTC: { bid: 100, ask: 101 } },
      },
    },
    errors: {
      spot: {},
      leverage: {},
    },
  };
}
