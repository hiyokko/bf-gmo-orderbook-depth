export function calculateChangeMetrics(history, seconds = null) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const latest = history.at(-1);
  const reference = seconds === null
    ? history[0]
    : findReference(history, latest.timestamp - seconds);
  if (!reference) return null;

  const probabilityChange = latest.probability - reference.probability;
  return {
    probabilityChange,
    pointChange: probabilityChange * 100,
    rateChange: reference.probability === 0
      ? null
      : probabilityChange / reference.probability * 100,
  };
}

function findReference(history, cutoff) {
  return [...history].reverse().find(
    (point) => point.timestamp <= cutoff,
  ) || null;
}
