import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSpread,
  createSpreadComparison,
} from "../src/spread-comparison.mjs";
import {
  createSpreadSlackMessages,
  createSpreadSlackText,
} from "../src/spread-slack.mjs";

test("spread is ask minus bid and percent uses the quote mid", () => {
  assert.deepEqual(calculateSpread({ bid: 90, ask: 110 }), {
    bid: 90,
    ask: 110,
    mid: 100,
    spread: 20,
    spreadPercent: 20,
  });
});

test("comparison follows the current SBIVC listing and distinguishes unavailable from errors", () => {
  const comparison = createSpreadComparison({
    listings: {
      spot: ["BTC", "POL", "JPYSC"],
      leverage: ["BTC", "DAI"],
    },
    quotes: {
      spot: {
        sbivc: { BTC: { bid: 100, ask: 102 } },
        bf: { BTC: { bid: 99, ask: 103 } },
      },
      leverage: {
        sbivc: { BTC: { bid: 100, ask: 101 } },
      },
    },
    errors: {
      spot: { cc: "unavailable" },
      leverage: {},
    },
  });

  assert.deepEqual(comparison.spot.rows.map((row) => row.symbol), ["BTC", "POL", "JPYSC"]);
  assert.deepEqual(
    comparison.spot.venues.map((venue) => venue.label),
    ["SBI VC", "bF", "CC", "GMO", "bb", "OKJ"],
  );
  assert.equal(comparison.spot.rows[0].cells.sbivc.spread, 2);
  assert.equal(comparison.spot.rows[1].cells.bf.status, "unavailable");
  assert.equal(comparison.spot.rows[2].cells.cc.status, "error");
  assert.deepEqual(comparison.leverage.rows.map((row) => row.symbol), ["BTC", "DAI"]);
  assert.deepEqual(
    comparison.leverage.venues.map((venue) => venue.label),
    ["SBI VC", "bF", "GMO", "SBI FX", "RW", "FXTF"],
  );
});

test("Slack output contains all four aligned comparison tables", () => {
  const comparison = createSpreadComparison({
    listings: {
      spot: ["BTC", "JPYSC"],
      leverage: ["BTC"],
    },
    quotes: {
      spot: {
        sbivc: { BTC: { bid: 10_000_000, ask: 10_100_000 } },
      },
      leverage: {
        sbivc: { BTC: { bid: 10_000_000, ask: 10_010_000 } },
      },
    },
    errors: {
      spot: { cc: "HTTP 500" },
      leverage: {},
    },
  });
  const text = createSpreadSlackText(comparison, {
    spot: { cc: "HTTP 500" },
    leverage: {},
  });

  assert.match(text, /\*現物スプレッド\*/);
  assert.match(text, /\*現物スプレッド（%）\*/);
  assert.match(text, /\*レバレッジスプレッド\*/);
  assert.match(text, /\*レバレッジスプレッド（%）\*/);
  assert.match(text, /100,000/);
  assert.match(text, /1\.00%/);
  assert.match(text, /0\.1000%/);
  assert.match(text, /JPYSC/);
  assert.match(text, /ERR/);
  assert.match(text, /取得エラー/);
  assert.doesNotMatch(text, /spread = 買値/);

  const codeBlocks = [...text.matchAll(/```([\s\S]*?)```/g)].map((match) => match[1]);
  assert.equal(codeBlocks.length, 4);
  for (const block of codeBlocks) {
    const separatorCounts = block
      .split("\n")
      .filter((line) => line.includes("|"))
      .map((line) => line.split("|").length);
    assert.equal(new Set(separatorCounts).size, 1);
  }

  const messages = createSpreadSlackMessages(comparison, {
    spot: { cc: "HTTP 500" },
    leverage: {},
  });
  assert.equal(messages.length, 4);
  assert.match(
    messages[0],
    /^\*暗号資産 スプレッド比較\*\n\n\*現物スプレッド\*/,
  );
  assert.ok(messages.every((message) => message.length < 4_000));
  assert.ok(messages.every((message) => (message.match(/```/g) || []).length === 2));
});

test("invalid crossed or non-positive quotes are rejected", () => {
  assert.throws(
    () => calculateSpread({ bid: 101, ask: 100 }),
    /ask >= bid/,
  );
  assert.throws(
    () => calculateSpread({ bid: 0, ask: 100 }),
    /positive bid\/ask/,
  );
});
