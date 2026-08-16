import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBpjVctComparison } from "../src/bpj-vct-application.mjs";

test("BPJ/VCT application saves a dry-run report without posting", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bpj-vct-"));
  const outputPath = path.join(directory, "latest.json");
  let webhookCalls = 0;
  try {
    const result = await runBpjVctComparison({
      dryRun: true,
      outputPath,
      fetchedAt: new Date("2026-08-16T00:00:00.000Z"),
      collectImpl: async () => fixture(),
      fetchImpl: async () => {
        webhookCalls += 1;
        throw new Error("Slack must not be called");
      },
    });
    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(webhookCalls, 0);
    assert.equal(saved.slack.requested, false);
    assert.equal(saved.sourceQuoteCounts.bpj, 1);
    assert.match(result.slackText, /BTCJPY/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("BPJ/VCT application posts exactly one Slack message", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bpj-vct-"));
  const outputPath = path.join(directory, "latest.json");
  const payloads = [];
  try {
    const result = await runBpjVctComparison({
      outputPath,
      webhookUrl: "https://hooks.slack.com/services/T111/B222/secret",
      collectImpl: async () => fixture(),
      fetchImpl: async (_url, options) => {
        payloads.push(JSON.parse(options.body));
        return { ok: true, status: 200, text: async () => "ok" };
      },
    });
    assert.equal(result.report.slack.posted, true);
    assert.equal(payloads.length, 1);
    assert.match(payloads[0].text, /BPJ \/ VCT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function fixture() {
  return {
    bpj: {
      updatedAt: "2026-08-16T00:00:00.000Z",
      quotes: { BTC: { bid: 100, ask: 110 } },
    },
    vct: {
      updatedAt: "2026-08-16T00:00:00.000Z",
      quotes: { BTC: { bid: 101, ask: 108 } },
    },
  };
}
