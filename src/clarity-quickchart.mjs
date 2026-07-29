import {
  CLARITY_QUICKCHART,
  RUNTIME_DEFAULTS,
} from "./config.mjs";
import { downsample } from "./clarity-chart.mjs";

export function createClarityQuickChartUrl(snapshot, {
  maxPoints = CLARITY_QUICKCHART.historyPoints,
  periodLabel = "All history",
} = {}) {
  const points = downsample(snapshot.history, maxPoints);
  if (points.length < 2) {
    throw new Error("QuickChart requires at least two history points");
  }

  const tickInterval = Math.max(1, Math.ceil((points.length - 1) / 6));
  const labels = points.map((point, index) => (
    index % tickInterval === 0 || index === points.length - 1
      ? formatDate(point.timestamp)
      : ""
  ));
  for (let index = 0; index < labels.length - 1; index += 1) {
    if (labels[index] && labels[index] === labels[index + 1]) {
      labels[index] = "";
    }
  }
  const values = points.map((point) => (
    Number((point.probability * 100).toFixed(1))
  ));
  const currentPercent = (snapshot.yesProbability * 100).toFixed(1);
  const chart = {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: "#2563eb",
        backgroundColor: "#dbeafe",
        borderWidth: 4,
        pointRadius: 0,
        fill: true,
        tension: 0,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `CLARITY Act — ${periodLabel}`,
          font: { size: 28, weight: "bold" },
        },
        subtitle: {
          display: true,
          text: `YES probability | Current ${currentPercent}%`,
          font: { size: 20 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            font: { size: 18 },
          },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            font: { size: 18 },
          },
          title: {
            display: true,
            text: "Probability (%)",
            font: { size: 18 },
          },
        },
      },
    },
  };
  const url = new URL(CLARITY_QUICKCHART.endpoint);
  url.searchParams.set("c", JSON.stringify(chart));
  url.searchParams.set("w", String(CLARITY_QUICKCHART.width));
  url.searchParams.set("h", String(CLARITY_QUICKCHART.height));
  url.searchParams.set(
    "devicePixelRatio",
    String(CLARITY_QUICKCHART.devicePixelRatio),
  );
  url.searchParams.set("bkg", "#ffffff");
  url.searchParams.set("v", "4");
  url.searchParams.set("f", "png");

  const imageUrl = url.toString();
  if (imageUrl.length > CLARITY_QUICKCHART.maxUrlLength) {
    throw new Error(
      `QuickChart URL exceeds ${CLARITY_QUICKCHART.maxUrlLength} characters`,
    );
  }
  return imageUrl;
}

export async function verifyQuickChartImage(imageUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = RUNTIME_DEFAULTS.requestTimeoutMs,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }

  const response = await fetchImpl(imageUrl, {
    headers: {
      accept: "image/png",
      "user-agent": RUNTIME_DEFAULTS.userAgent,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers?.get?.("content-type") || "";
  if (!response.ok) {
    throw new Error(`QuickChart failed: HTTP ${response.status}`);
  }
  if (!contentType.toLowerCase().startsWith("image/png")) {
    throw new Error(`QuickChart returned unexpected content type: ${
      contentType || "unknown"
    }`);
  }
  await response.body?.cancel?.();
  return {
    status: response.status,
    contentType,
  };
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
