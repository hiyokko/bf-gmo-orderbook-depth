import { CLARITY_MARKET } from "./config.mjs";

const LEVELS = [..."▁▂▃▄▅▆▇█"];

export function createClarityTextChart(snapshot, {
  width = CLARITY_MARKET.sparklineWidth,
} = {}) {
  const points = downsample(snapshot.history, width);
  const probabilities = points.map((point) => point.probability);
  const sparkline = probabilities.map(toLevel).join("");
  const first = points[0];
  const last = points.at(-1);
  const minimum = Math.min(...probabilities) * 100;
  const maximum = Math.max(...probabilities) * 100;

  return [
    sparkline,
    `${formatDate(first.timestamp)} → ${formatDate(last.timestamp)}`,
    `range ${minimum.toFixed(1)}%–${maximum.toFixed(1)}% | current ${
      (snapshot.yesProbability * 100).toFixed(1)
    }%`,
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

function toLevel(probability) {
  const normalized = Math.min(1, Math.max(0, Number(probability)));
  const index = Math.min(
    LEVELS.length - 1,
    Math.floor(normalized * LEVELS.length),
  );
  return LEVELS[index];
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
