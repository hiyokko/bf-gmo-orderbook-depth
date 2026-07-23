import test from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "../src/env.mjs";

test("env parser handles comments, quotes, and valid variable names", () => {
  assert.deepEqual(parseEnv(`
    # comment
    PLAIN=value
    DOUBLE="two words"
    SINGLE='three words'
    1INVALID=ignored
  `), [
    ["PLAIN", "value"],
    ["DOUBLE", "two words"],
    ["SINGLE", "three words"],
  ]);
});
