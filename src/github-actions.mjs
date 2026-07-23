import { RUNTIME_DEFAULTS } from "./config.mjs";

export function createGitHubActionsClient({
  repository,
  token,
  fetchImpl = globalThis.fetch,
  apiUrl = RUNTIME_DEFAULTS.githubApiUrl,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  validateClientOptions({ repository, token, fetchImpl, apiUrl, timeoutMs });

  async function request(route, options = {}) {
    const response = await fetchImpl(`${apiUrl}/repos/${repository}${route}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": RUNTIME_DEFAULTS.githubApiVersion,
        "User-Agent": `${RUNTIME_DEFAULTS.userAgent}-watchdog`,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(await githubError(response, options.errorPrefix || "GitHub API request failed"));
    }
    return response;
  }

  return Object.freeze({
    async listWorkflowRuns(workflowFile, { perPage = 100 } = {}) {
      const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(perPage) || 100)));
      const response = await request(
        `/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=${pageSize}`,
        { errorPrefix: `Failed to list ${workflowFile} runs` },
      );
      const body = await response.json();
      return Array.isArray(body.workflow_runs) ? body.workflow_runs : [];
    },

    async dispatchWorkflow(workflowFile, {
      ref = "main",
      inputs = {},
    } = {}) {
      await request(
        `/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref, inputs }),
          errorPrefix: `Failed to dispatch ${workflowFile}`,
        },
      );
      return {
        repository,
        ref,
        workflow: workflowFile,
        inputs,
      };
    },
  });
}

export function publicWorkflowRun(run = {}) {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    title: run.display_title,
    createdAt: run.created_at,
    url: run.html_url,
  };
}

function validateClientOptions({
  repository,
  token,
  fetchImpl,
  apiUrl,
  timeoutMs,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ""))) {
    throw new Error("GITHUB_REPOSITORY is missing or invalid");
  }
  if (!String(token || "").trim()) {
    throw new Error("GITHUB_TOKEN is missing");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }
  try {
    const url = new URL(apiUrl);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error("GITHUB_API_URL must be a valid HTTPS URL");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("GitHub API timeout must be a positive number");
  }
}

async function githubError(response, prefix) {
  let detail = "";
  try {
    const body = await response.json();
    if (body?.message) detail = `: ${body.message}`;
  } catch {
    detail = "";
  }
  return `${prefix} (HTTP ${response.status})${detail}`;
}
