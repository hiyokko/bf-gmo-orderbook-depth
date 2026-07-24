import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runOrderbookDepth } from "../src/application.mjs";

test("application creates a dry-run report without calling Slack", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "orderbook-depth-"));
  const outputPath = path.join(temporaryDirectory, "latest.json");
  const requestedUrls = [];

  try {
    const result = await runOrderbookDepth({
      dryRun: true,
      outputPath,
      fetchedAt: new Date("2026-07-23T03:00:00.000Z"),
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        if (url.includes("bitflyer")) {
          return jsonResponse({
            asks: levels(10_100_000),
            bids: levels(10_000_000),
          });
        }
        return jsonResponse({
          status: 0,
          responsetime: "2026-07-23T03:00:00Z",
          data: {
            asks: levels(10_100_000),
            bids: levels(10_000_000),
          },
        });
      },
    });

    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(requestedUrls.length, 2);
    assert.equal(result.report.slack.requested, false);
    assert.equal(saved.exchanges.length, 2);
    assert.deepEqual(saved.displayOrder.askBuy, [3, 1, 0.5, 0.3, 0.1]);
    assert.doesNotMatch(result.slackText, /取得時刻|API応答時刻/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("application preserves a failure report when Slack rejects the request", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "orderbook-depth-"));
  const outputPath = path.join(temporaryDirectory, "latest.json");

  try {
    await assert.rejects(
      runOrderbookDepth({
        dryRun: false,
        webhookUrl: "https://hooks.slack.com/services/T111/B222/secret",
        outputPath,
        fetchedAt: new Date("2026-07-23T03:00:00.000Z"),
        fetchImpl: async (url) => {
          if (url.includes("hooks.slack.com")) {
            return {
              ok: false,
              status: 500,
              text: async () => "server_error",
            };
          }
          if (url.includes("bitflyer")) {
            return jsonResponse({
              asks: levels(10_100_000),
              bids: levels(10_000_000),
            });
          }
          return jsonResponse({
            status: 0,
            data: {
              asks: levels(10_100_000),
              bids: levels(10_000_000),
            },
          });
        },
      }),
      /Slack webhook failed/,
    );

    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(saved.slack.requested, true);
    assert.equal(saved.slack.posted, false);
    assert.match(saved.slack.error, /HTTP 500/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

function levels(price) {
  return [{ price, size: 5 }];
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
