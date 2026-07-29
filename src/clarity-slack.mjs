export function createClaritySlackPayload(snapshot, textChart) {
  const currentPercent = snapshot.yesProbability * 100;
  const change24h = calculateChange(snapshot.history, 24 * 60 * 60);
  const changeText = change24h === null
    ? ""
    : `  |  24h ${formatSigned(change24h * 100)}pt`;
  const summary = `Polymarket CLARITY Act: YES ${currentPercent.toFixed(1)}%`;
  const details = [
    "*Polymarket — CLARITY Act*",
    `<${snapshot.sourceUrl}|${escapeSlack(snapshot.title)}>`,
    `*YES ${currentPercent.toFixed(1)}%*${changeText}`,
  ].join("\n");

  return {
    text: summary,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: details,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*YES probability history*\n\`\`\`\n${textChart}\n\`\`\``,
        },
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

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function escapeSlack(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
