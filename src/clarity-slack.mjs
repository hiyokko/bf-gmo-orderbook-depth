import { calculateChangeMetrics } from "./clarity-metrics.mjs";

export function createClaritySlackPayload(snapshot, charts, {
  legislationStatus = null,
} = {}) {
  const currentPercent = snapshot.yesProbability * 100;
  const change24h = calculateChangeMetrics(
    snapshot.history,
    24 * 60 * 60,
  );
  const probabilities = snapshot.history.map(
    (point) => point.probability * 100,
  );
  const minimum = Math.min(...probabilities);
  const maximum = Math.max(...probabilities);
  const summary = `Polymarket CLARITY Act: YES ${currentPercent.toFixed(1)}%`;

  return {
    text: summary,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Polymarket | CLARITY Act",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${snapshot.sourceUrl}|${escapeSlack(snapshot.title)}>`,
        },
      },
      ...(legislationStatus
        ? [createLegislationBlock(legislationStatus)]
        : []),
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*YES probability*\n\`${currentPercent.toFixed(1)}%\``,
          },
          {
            type: "mrkdwn",
            text: `*24h change rate*\n\`${formatChange(change24h)}\``,
          },
          {
            type: "mrkdwn",
            text: `*History range*\n\`${minimum.toFixed(1)}%–${
              maximum.toFixed(1)
            }%\``,
          },
          {
            type: "mrkdwn",
            text: `*Market status*\n\`${snapshot.closed ? "CLOSED" : "OPEN"}\``,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Period change rates*",
        },
        fields: charts.map((chart) => ({
          type: "mrkdwn",
          text: `*${chart.label}*\n\`${formatChange(chart.changeMetrics)}\``,
        })),
      },
      {
        type: "divider",
      },
      ...charts.map(createChartBlock),
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `<${snapshot.sourceUrl}|View market on Polymarket>`,
        }],
      },
    ],
  };
}

function createLegislationBlock(status) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: [
        "*Legislative status — official*",
        "`House ✓`  →  `Senate ● ON CALENDAR`  →  `Later stages ○`",
        `*Current:* ${escapeSlack(status.summaryJa)}`,
        `*Latest action:* \`${status.latestActionDate}\`  ·  <${
          status.sourceUrl
        }|GovInfo / Congress.gov>`,
      ].join("\n"),
    },
  };
}

function createChartBlock(chart) {
  if (chart.imageUrl) {
    return {
      type: "image",
      image_url: chart.imageUrl,
      alt_text: `CLARITY Act YES probability — ${chart.label}`,
      title: {
        type: "plain_text",
        text: chart.label,
        emoji: true,
      },
    };
  }
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${chart.label}*\n\`\`\`\n${chart.textChart}\n\`\`\``,
    },
  };
}

export function calculateChange(history, seconds) {
  return calculateChangeMetrics(history, seconds)?.probabilityChange ?? null;
}

function formatChange(metrics) {
  if (!metrics) return "—";
  const direction = metrics.pointChange > 0
    ? "▲"
    : metrics.pointChange < 0
      ? "▼"
      : "→";
  const pointChange = `${
    metrics.pointChange > 0 ? "+" : ""
  }${metrics.pointChange.toFixed(1)} pt`;
  if (metrics.rateChange === null) {
    return `${direction} ${pointChange}`;
  }
  return `${direction} ${Math.abs(metrics.rateChange).toFixed(1)}% (${
    pointChange
  })`;
}

function escapeSlack(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
