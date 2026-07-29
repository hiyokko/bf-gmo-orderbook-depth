import { CLARITY_MARKET } from "./config.mjs";

const VERTICAL_BLOCKS = [..." ▁▂▃▄▅▆▇█"];

export function createClarityTextChart(snapshot, {
  width = CLARITY_MARKET.chartWidth,
  height = CLARITY_MARKET.chartHeight,
} = {}) {
  const chartWidth = Math.max(8, Math.trunc(Number(width) || 8));
  const chartHeight = Math.max(4, Math.trunc(Number(height) || 4));
  const points = downsample(snapshot.history, chartWidth);
  const probabilities = points.map((point) => point.probability);
  const first = points[0];
  const last = points.at(-1);
  const rows = Array.from({ length: chartHeight }, (_, rowIndex) => {
    const axisPercent = Math.round(
      (chartHeight - rowIndex) / chartHeight * 100,
    );
    const cells = probabilities.map((probability) => (
      toAreaCell(probability, rowIndex, chartHeight)
    )).join("");
    return `${String(axisPercent).padStart(3)}% ┤${cells}`;
  });
  const axisPrefix = "     ";
  const startDate = formatShortDate(first.timestamp);
  const endDate = formatShortDate(last.timestamp);
  const dateGap = Math.max(
    1,
    chartWidth - startDate.length - endDate.length,
  );

  return [
    ...rows,
    `  0% └${"─".repeat(chartWidth)}`,
    `${axisPrefix}${startDate}${" ".repeat(dateGap)}${endDate}`,
  ].join("\n");
}

export function downsample(points, maxPoints) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const limit = Math.max(2, Math.trunc(Number(maxPoints) || 2));
  if (points.length <= limit) return [...points];

  const selected = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round(index * (points.length - 1) / (limit - 1));
    selected.push(points[sourceIndex]);
  }
  return selected;
}

function toAreaCell(probability, rowIndex, height) {
  const normalized = Math.min(1, Math.max(0, Number(probability)));
  const filledHeight = normalized * height;
  const rowBottom = height - rowIndex - 1;
  const fraction = filledHeight - rowBottom;
  if (fraction <= 0) return VERTICAL_BLOCKS[0];
  if (fraction >= 1) return VERTICAL_BLOCKS.at(-1);
  return VERTICAL_BLOCKS[Math.ceil(fraction * 8)];
}

function formatShortDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
