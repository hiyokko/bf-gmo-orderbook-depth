const DAY_SECONDS = 24 * 60 * 60;

export const CLARITY_CHART_PERIODS = Object.freeze([
  Object.freeze({
    id: "all",
    label: "All history",
    durationSeconds: null,
  }),
  Object.freeze({
    id: "month",
    label: "Last 1 month",
    durationSeconds: 30 * DAY_SECONDS,
  }),
  Object.freeze({
    id: "week",
    label: "Last 1 week",
    durationSeconds: 7 * DAY_SECONDS,
  }),
]);

export function createClarityPeriodSnapshots(snapshot) {
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  if (history.length < 2) {
    throw new Error("CLARITY chart periods require at least two history points");
  }

  const latestTimestamp = history.at(-1).timestamp;
  return CLARITY_CHART_PERIODS.map((period) => {
    const selected = period.durationSeconds === null
      ? [...history]
      : history.filter(
        (point) => point.timestamp >= latestTimestamp - period.durationSeconds,
      );

    return {
      ...period,
      snapshot: {
        ...snapshot,
        history: selected.length >= 2 ? selected : history.slice(-2),
      },
    };
  });
}
