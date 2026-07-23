import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("primary workflow uses the requested JST schedule and hardened permissions", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/orderbook-depth.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cron: "0 1,9,17 \* \* \*"/);
  assert.match(workflow, /timezone: "Asia\/Tokyo"/);
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /SLACK_WEBHOOK_URL: \$\{\{ secrets\.SLACK_WEBHOOK_URL \}\}/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);

  const actionReferences = [...workflow.matchAll(/uses: [^@]+@([a-f0-9]+)/g)];
  assert.ok(actionReferences.length >= 2);
  assert.ok(actionReferences.every(([, sha]) => sha.length === 40));
});

test("watchdog can dispatch recovery runs without receiving the Slack secret", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/orderbook-depth-watchdog.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cron: "7,17,27,37,47,57 \* \* \* \*"/);
  assert.match(workflow, /timezone: "Asia\/Tokyo"/);
  assert.match(workflow, /permissions:\n  actions: write\n  contents: read/);
  assert.match(workflow, /WATCHDOG_DRY_RUN:/);
  assert.doesNotMatch(workflow, /SLACK_WEBHOOK_URL|pull_request:|push:/);

  const actionReferences = [...workflow.matchAll(/uses: [^@]+@([a-f0-9]+)/g)];
  assert.ok(actionReferences.length >= 2);
  assert.ok(actionReferences.every(([, sha]) => sha.length === 40));
});
