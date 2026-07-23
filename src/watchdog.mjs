const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_HOURS_JST = Object.freeze([1, 9, 17]);
const ACTIVE_RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
  "requested",
]);

export const ORDERBOOK_WORKFLOW = "orderbook-depth.yml";
export const WATCHDOG_TITLE_PREFIX = "Orderbook depth watchdog ";

export function latestScheduleTarget(now = Date.now()) {
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs)) return null;

  const jstDayStart = Math.floor((nowMs + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
  const candidates = [];

  for (const dayOffset of [1, 0]) {
    for (const hour of SCHEDULE_HOURS_JST) {
      const boundaryMs = jstDayStart - dayOffset * DAY_MS + hour * HOUR_MS;
      if (boundaryMs <= nowMs) candidates.push(createTarget(boundaryMs));
    }
  }

  return candidates.sort((left, right) => right.boundaryMs - left.boundaryMs)[0] ?? null;
}

export function selectWatchdogTarget(now = Date.now(), {
  minLagMinutes = 20,
  maxLagMinutes = 360,
} = {}) {
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs)) return null;

  const target = latestScheduleTarget(nowMs);
  if (!target) return null;

  const minLagMs = Math.max(0, Number(minLagMinutes) || 0) * 60 * 1000;
  const maxLagMs = Math.max(minLagMs, (Number(maxLagMinutes) || 0) * 60 * 1000);
  const lagMs = nowMs - target.boundaryMs;
  const result = {
    ...target,
    lagMinutes: Math.floor(lagMs / 60000),
  };

  if (lagMs < minLagMs) return { ...result, skipReason: "too_early" };
  if (lagMs > maxLagMs) return { ...result, skipReason: "too_old" };
  return result;
}

export function parseWatchdogTarget(value) {
  const boundaryMs = Date.parse(String(value || ""));
  if (!Number.isFinite(boundaryMs)) {
    throw new Error("watchdog_target must be a valid ISO timestamp");
  }

  const jstDate = new Date(boundaryMs + JST_OFFSET_MS);
  const valid = SCHEDULE_HOURS_JST.includes(jstDate.getUTCHours())
    && jstDate.getUTCMinutes() === 0
    && jstDate.getUTCSeconds() === 0
    && jstDate.getUTCMilliseconds() === 0;
  if (!valid) {
    throw new Error("watchdog_target must match a configured JST 01:00, 09:00, or 17:00 boundary");
  }

  return createTarget(boundaryMs);
}

export function watchdogRunTitle(target) {
  return `${WATCHDOG_TITLE_PREFIX}${target.executionBoundaryAt}`;
}

export function workflowDispatchInputs(target) {
  return {
    post_to_slack: "true",
    watchdog_target: target.executionBoundaryAt,
  };
}

export function classifyTargetRuns(runs = [], target, {
  currentRunId = "",
} = {}) {
  const currentId = String(currentRunId || "");
  const relevant = runs
    .filter((run) => String(run?.id ?? "") !== currentId)
    .filter((run) => runMatchesTarget(run, target))
    .sort((left, right) => runTimestamp(right) - runTimestamp(left));

  return {
    successful: relevant.filter(
      (run) => run.status === "completed" && run.conclusion === "success",
    ),
    active: relevant.filter((run) => ACTIVE_RUN_STATUSES.has(String(run.status || ""))),
    unsuccessful: relevant.filter(
      (run) => run.status === "completed" && run.conclusion !== "success",
    ),
  };
}

export async function fetchWorkflowRuns({
  repository,
  token,
  fetchImpl = globalThis.fetch,
  apiUrl = "https://api.github.com",
} = {}) {
  validateGitHubRequest({ repository, token, fetchImpl });
  const response = await fetchImpl(
    `${apiUrl}/repos/${repository}/actions/workflows/${encodeURIComponent(ORDERBOOK_WORKFLOW)}/runs?per_page=100`,
    {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(await githubError(response, "Failed to list orderbook workflow runs"));
  }
  const body = await response.json();
  return Array.isArray(body.workflow_runs) ? body.workflow_runs : [];
}

export async function dispatchOrderbookWorkflow(target, {
  repository,
  ref = "main",
  token,
  fetchImpl = globalThis.fetch,
  apiUrl = "https://api.github.com",
} = {}) {
  validateGitHubRequest({ repository, token, fetchImpl });
  const response = await fetchImpl(
    `${apiUrl}/repos/${repository}/actions/workflows/${encodeURIComponent(ORDERBOOK_WORKFLOW)}/dispatches`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: workflowDispatchInputs(target),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(await githubError(response, `Failed to dispatch ${ORDERBOOK_WORKFLOW}`));
  }

  return {
    repository,
    ref,
    workflow: ORDERBOOK_WORKFLOW,
    inputs: workflowDispatchInputs(target),
  };
}

export function publicRun(run = {}) {
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

function createTarget(boundaryMs) {
  return {
    label: formatJstBoundary(boundaryMs),
    boundaryMs,
    nextBoundaryMs: boundaryMs + 8 * HOUR_MS,
    executionBoundaryAt: new Date(boundaryMs).toISOString(),
  };
}

function formatJstBoundary(boundaryMs) {
  const date = new Date(boundaryMs + JST_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00 JST`;
}

function runMatchesTarget(run, target) {
  if (!run || !target) return false;
  if (
    run.event === "workflow_dispatch"
    && run.display_title === watchdogRunTitle(target)
  ) {
    return true;
  }
  if (run.event !== "schedule") return false;

  const timestamp = runTimestamp(run);
  return timestamp >= target.boundaryMs && timestamp < target.nextBoundaryMs;
}

function runTimestamp(run) {
  const timestamp = Date.parse(run?.created_at || run?.run_started_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function validateGitHubRequest({ repository, token, fetchImpl }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repository || ""))) {
    throw new Error("GITHUB_REPOSITORY is missing or invalid");
  }
  if (!String(token || "").trim()) {
    throw new Error("GITHUB_TOKEN is missing");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${String(token).trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bf-gmo-orderbook-depth-watchdog",
  };
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
