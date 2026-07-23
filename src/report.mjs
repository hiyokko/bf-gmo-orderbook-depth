import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEPTH_TARGETS,
  DISPLAY_TARGETS,
} from "./config.mjs";

export function formatJst(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function createReport({ snapshots, fetchedAt, slack }) {
  return {
    fetchedAt: fetchedAt.toISOString(),
    fetchedAtJst: formatJst(fetchedAt),
    targets: [...DEPTH_TARGETS],
    displayOrder: {
      askBuy: [...DISPLAY_TARGETS.askBuy],
      bidSell: [...DISPLAY_TARGETS.bidSell],
    },
    methodology: {
      buy: "asksを価格昇順に累積",
      sell: "bidsを価格降順に累積",
      impactBps: "最良気配に対するVWAPの不利方向への乖離",
      impactPercent: "impactBps / 100",
      excludes: ["取引手数料", "資金調達料", "API取得後の板変動"],
    },
    slack,
    exchanges: snapshots,
  };
}

export async function saveReport(report, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}
