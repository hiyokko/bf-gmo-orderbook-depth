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
        label: "YES probability",
        data: values,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.16)",
        borderWidth: 3,
        pointRadius: values.map((_, index) => (
          index === values.length - 1 ? 6 : 0
        )),
        pointBackgroundColor: "#2563eb",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 3,
        pointHitRadius: 8,
        fill: true,
        tension: 0,
      }],
    },
    options: {
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `CLARITY Act — ${periodLabel}`,
          align: "start",
          color: "#111827",
          font: { size: 22, weight: "bold" },
          padding: { bottom: 4 },
        },
        subtitle: {
          display: true,
          text: `YES probability | Current ${currentPercent}%`,
          align: "start",
          color: "#4b5563",
          font: { size: 15 },
          padding: { bottom: 18 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            autoSkip: false,
            color: "#6b7280",
            maxRotation: 0,
          },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: "#e5e7eb" },
          ticks: {
            color: "#6b7280",
            stepSize: 20,
          },
          title: {
            display: true,
            text: "Probability (%)",
            color: "#6b7280",
          },
        },
      },
    },
  };
  const url = new URL(CLARITY_QUICKCHART.endpoint);
  url.searchParams.set("chart", JSON.stringify(chart));
  url.searchParams.set("width", String(CLARITY_QUICKCHART.width));
  url.searchParams.set("height", String(CLARITY_QUICKCHART.height));
  url.searchParams.set(
    "devicePixelRatio",
    String(CLARITY_QUICKCHART.devicePixelRatio),
  );
  url.searchParams.set("backgroundColor", "#ffffff");
  url.searchParams.set("version", "4");
  url.searchParams.set("format", "png");

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
