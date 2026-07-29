export function createClaritySlackPayload(snapshot, textChart) {
  const currentPercent = snapshot.yesProbability * 100;
  const change24h = calculateChange(snapshot.history, 24 * 60 * 60);
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
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*YES probability*\n\`${currentPercent.toFixed(1)}%\``,
          },
          {
            type: "mrkdwn",
            text: `*24h change*\n\`${formatChange(change24h)}\``,
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
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*YES probability history*\n\`\`\`\n${textChart}\n\`\`\``,
        },
      },
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

export function calculateChange(history, seconds) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const latest = history.at(-1);
  const cutoff = latest.timestamp - seconds;
  const reference = [...history].reverse().find(
    (point) => point.timestamp <= cutoff,
  );
  return reference ? latest.probability - reference.probability : null;
}

function formatChange(change) {
  if (change === null) return "—";
  const pointChange = change * 100;
  const direction = pointChange > 0 ? "▲" : pointChange < 0 ? "▼" : "→";
  return `${direction} ${Math.abs(pointChange).toFixed(1)} pt`;
}

function escapeSlack(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
