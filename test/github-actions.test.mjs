import test from "node:test";
import assert from "node:assert/strict";
import { createGitHubActionsClient } from "../src/github-actions.mjs";

test("GitHub Actions client lists workflow runs with scoped authentication", async () => {
  const requests = [];
  const client = createGitHubActionsClient({
    repository: "hiyokko/bf-gmo-orderbook-depth",
    token: "test-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ workflow_runs: [{ id: 1 }] }),
      };
    },
  });

  const runs = await client.listWorkflowRuns("orderbook-depth.yml");
  assert.deepEqual(runs, [{ id: 1 }]);
  assert.match(requests[0].url, /orderbook-depth\.yml\/runs\?per_page=100$/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
});

test("GitHub Actions client dispatches a workflow with explicit inputs", async () => {
  let request;
  const client = createGitHubActionsClient({
    repository: "hiyokko/bf-gmo-orderbook-depth",
    token: "test-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    },
  });

  const result = await client.dispatchWorkflow("orderbook-depth.yml", {
    ref: "main",
    inputs: { post_to_slack: "true" },
  });

  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    ref: "main",
    inputs: { post_to_slack: "true" },
  });
  assert.equal(result.workflow, "orderbook-depth.yml");
});

test("GitHub Actions client rejects invalid repository and token configuration", () => {
  assert.throws(
    () => createGitHubActionsClient({ repository: "invalid", token: "token" }),
    /GITHUB_REPOSITORY/,
  );
  assert.throws(
    () => createGitHubActionsClient({ repository: "owner/repo", token: "" }),
    /GITHUB_TOKEN/,
  );
});
