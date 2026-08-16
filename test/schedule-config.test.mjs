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

test("unified watchdog can recover all reports without receiving the Slack secret", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/report-watchdog.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cron: "7,17,27,37,47,57 \* \* \* \*"/);
  assert.match(workflow, /timezone: "Asia\/Tokyo"/);
  assert.match(workflow, /permissions:\n  actions: write\n  contents: read/);
  assert.match(workflow, /WATCHDOG_DRY_RUN:/);
  assert.match(workflow, /npm run watchdog/);
  assert.doesNotMatch(workflow, /SLACK_WEBHOOK_URL|pull_request:|push:/);

  const actionReferences = [...workflow.matchAll(/uses: [^@]+@([a-f0-9]+)/g)];
  assert.ok(actionReferences.length >= 2);
  assert.ok(actionReferences.every(([, sha]) => sha.length === 40));
});

test("CLARITY Act workflow runs after spread and protects the Slack secret", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/clarity-act.yml", import.meta.url),
    "utf8",
  );
  const watchdogScript = await readFile(
    new URL("../scripts/run-watchdog.mjs", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cron: "0 1,9,17 \* \* \*"/);
  assert.match(workflow, /timezone: "Asia\/Tokyo"/);
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /SLACK_WEBHOOK_URL: \$\{\{ secrets\.SLACK_WEBHOOK_URL \}\}/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  const waitIndex = workflow.indexOf("node scripts/wait-for-spread.mjs");
  const postIndex = workflow.indexOf("npm run clarity\n");
  assert.ok(waitIndex >= 0);
  assert.ok(postIndex > waitIndex);
  assert.match(workflow, /SPREAD_WAIT_TIMEOUT_MS: "480000"/);
  assert.match(watchdogScript, /CLARITY_ACT_WORKFLOW/);

  const actionReferences = [...workflow.matchAll(/uses: [^@]+@([a-f0-9]+)/g)];
  assert.ok(actionReferences.length >= 2);
  assert.ok(actionReferences.every(([, sha]) => sha.length === 40));
});

test("spread comparison workflow uses the same JST slots and protects the Slack secret", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/spread-comparison.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cron: "0 1,9,17 \* \* \*"/);
  assert.match(workflow, /timezone: "Asia\/Tokyo"/);
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /SLACK_WEBHOOK_URL: \$\{\{ secrets\.SLACK_WEBHOOK_URL \}\}/);
  assert.doesNotMatch(workflow, /SPREAD_DISABLED_VENUES/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  const waitIndex = workflow.indexOf("node scripts/wait-for-orderbook.mjs");
  const postIndex = workflow.indexOf("npm run spread\n");
  assert.ok(waitIndex >= 0);
  assert.ok(postIndex > waitIndex);
  assert.match(workflow, /ORDERBOOK_WAIT_TIMEOUT_MS: "360000"/);

  const actionReferences = [...workflow.matchAll(/uses: [^@]+@([a-f0-9]+)/g)];
  assert.ok(actionReferences.length >= 2);
  assert.ok(actionReferences.every(([, sha]) => sha.length === 40));
});

test("BPJ/VCT diagnostic workflow is manual-only and protects the Slack secret", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/bpj-vct-comparison.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/);
  assert.match(workflow, /SLACK_WEBHOOK_URL: \$\{\{ secrets\.SLACK_WEBHOOK_URL \}\}/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  assert.match(workflow, /npm run bpj-vct:dry-run/);

  const actionReferences = [...workflow.matchAll(/uses: [^@]+@([a-f0-9]+)/g)];
  assert.ok(actionReferences.length >= 2);
  assert.ok(actionReferences.every(([, sha]) => sha.length === 40));
});

test("legacy watchdog workflows are removed", async () => {
  for (const file of [
    "../.github/workflows/orderbook-depth-watchdog.yml",
    "../.github/workflows/spread-comparison-watchdog.yml",
  ]) {
    await assert.rejects(
      readFile(new URL(file, import.meta.url), "utf8"),
      { code: "ENOENT" },
    );
  }
});
