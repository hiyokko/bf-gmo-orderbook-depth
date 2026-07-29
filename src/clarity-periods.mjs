import { CLARITY_HISTORY_SERIES } from "./config.mjs";

export const CLARITY_CHART_PERIODS = CLARITY_HISTORY_SERIES;

export function createClarityPeriodSnapshots(snapshot) {
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  if (history.length < 2) {
    throw new Error("CLARITY chart periods require at least two history points");
  }

  const latestTimestamp = history.at(-1).timestamp;
  return CLARITY_CHART_PERIODS.map((period) => {
    const detailedHistory = snapshot.periodHistories?.[period.id];
    const selected = Array.isArray(detailedHistory)
      && detailedHistory.length >= 2
      ? [...detailedHistory]
      : selectFromAllHistory(history, period, latestTimestamp);

    return {
      ...period,
      snapshot: {
        ...snapshot,
        history: selected.length >= 2 ? selected : history.slice(-2),
      },
    };
  });
}

function selectFromAllHistory(history, period, latestTimestamp) {
  if (period.durationSeconds === null) return [...history];
  return history.filter(
    (point) => point.timestamp >= latestTimestamp - period.durationSeconds,
  );
}
