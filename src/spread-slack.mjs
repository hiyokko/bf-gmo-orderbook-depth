const STATUS_TEXT = Object.freeze({
  error: "ERR",
  invalid: "ERR",
  unavailable: "-",
});

export function createSpreadSlackText(comparison, errors = {}) {
  return createSpreadSlackMessages(comparison, errors).join("\n\n");
}

export function createSpreadSlackMessages(comparison, errors = {}) {
  const sections = [
    formatSection("現物スプレッド", comparison?.spot, "spread"),
    formatSection(
      "現物スプレッド（%）",
      comparison?.spot,
      "spreadPercent",
      { percentDigits: 2 },
    ),
    formatSection("レバレッジスプレッド", comparison?.leverage, "spread"),
    formatSection("レバレッジスプレッド（%）", comparison?.leverage, "spreadPercent"),
  ];
  const errorLines = formatErrorLines(errors);
  const hasError = hasErrorCells(comparison);
  const legend = [
    hasError
      ? "`-` = 対象外または公式公開レートなし / `ERR` = 取得・応答エラー"
      : "`-` = 対象外または公式公開レートなし",
    ...(errorLines.length > 0 ? ["", "*取得エラー*", ...errorLines] : []),
  ].join("\n");
  const messages = sections.map((section, index) => [
    ...(index === 0
      ? [
          "*暗号資産 販売所スプレッド比較*",
          "",
        ]
      : []),
    section,
    ...(index === sections.length - 1 ? ["", legend] : []),
  ].join("\n"));

  for (const message of messages) {
    if (message.length > 4_000) {
      throw new Error(`Slack spread section exceeds 4,000 characters (${message.length})`);
    }
  }
  return messages;
}

export function formatSpreadNumber(value) {
  if (!Number.isFinite(value)) return "ERR";
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1_000
    ? 0
    : (absolute >= 1 ? 3 : (absolute >= 0.01 ? 4 : 8));
  return new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatSection(title, market, metric, options = {}) {
  if (!market || !Array.isArray(market.venues) || !Array.isArray(market.rows)) {
    throw new Error(`Comparison section is missing: ${title}`);
  }
  const headers = ["symbol", ...market.venues.map((venue) => venue.label)];
  const values = market.rows.map((row) => [
    row.symbol,
    ...market.venues.map(
      (venue) => formatCell(row.cells?.[venue.id], metric, options),
    ),
  ]);
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...values.map((row) => row[index].length),
  ));
  const lines = [
    headers.map((value, index) => padStart(value, widths[index])).join(" | "),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...values.map((row) => row
      .map((value, index) => padStart(value, widths[index]))
      .join(" | ")),
  ];

  return [`*${title}*`, "```", ...lines, "```"].join("\n");
}

function formatCell(cell, metric, { percentDigits = 4 } = {}) {
  if (cell?.status !== "ok") return STATUS_TEXT[cell?.status] || "ERR";
  if (metric === "spreadPercent") {
    return `${cell.spreadPercent.toFixed(percentDigits)}%`;
  }
  return formatSpreadNumber(cell.spread);
}

function formatErrorLines(errors) {
  const lines = [];
  for (const market of ["spot", "leverage"]) {
    for (const [venue, message] of Object.entries(errors?.[market] || {})) {
      if (message) lines.push(`• ${market}/${venue}: ${message}`);
    }
  }
  return lines;
}

function hasErrorCells(comparison) {
  return ["spot", "leverage"].some((market) => (
    comparison?.[market]?.rows?.some((row) => (
      Object.values(row.cells || {}).some(
        (cell) => cell?.status === "error" || cell?.status === "invalid",
      )
    ))
  ));
}

function padStart(value, width) {
  return `${" ".repeat(Math.max(0, width - value.length))}${value}`;
}
