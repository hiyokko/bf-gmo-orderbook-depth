import { workbookSessionLabel } from "./bpj-vct-comparison.mjs";

export function createBpjVctSlackText(comparison, fetchedAt = new Date()) {
  if (!Array.isArray(comparison) || comparison.length === 0) {
    throw new Error("BPJ/VCT comparison rows are required");
  }
  const headers = ["symbol", "売", "買"];
  const values = comparison.map((row) => [
    row.symbol,
    formatPercent(row.sellPercent, row.status),
    formatPercent(row.buyPercent, row.status),
  ]);
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...values.map((row) => row[index].length),
  ));
  const table = [
    headers.map((value, index) => value.padStart(widths[index])).join(" | "),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...values.map((row) => row
      .map((value, index) => value.padStart(widths[index]))
      .join(" | ")),
  ];

  return [
    "*BPJ / VCT 価格乖離チェック*",
    `販売所・BPJ基準 · ${workbookSessionLabel(fetchedAt)}`,
    "```",
    ...table,
    "```",
  ].join("\n");
}

function formatPercent(value, status) {
  if (status !== "ok" || !Number.isFinite(value)) return "-";
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  return `${normalized.toFixed(3)}%`;
}
