export const BPJ_VCT_TARGET_SYMBOLS = Object.freeze([
  "BTC", "ETH", "XRP", "BCH", "LTC", "DOT", "LINK", "ADA", "DOGE", "XLM",
  "SOL", "POL", "AVAX", "FLR", "ATOM", "SHIB", "HBAR", "TRX", "TON", "SUI",
]);

export function createBpjVctComparison(collected) {
  if (!collected?.bpj?.quotes || !collected?.vct?.quotes) {
    throw new Error("BPJ/VCT source quotes are missing");
  }

  return BPJ_VCT_TARGET_SYMBOLS.map((symbol) => {
    const bpj = collected.bpj.quotes[symbol];
    const vct = collected.vct.quotes[symbol];
    if (!validQuote(bpj) || !validQuote(vct)) {
      return {
        symbol: `${symbol}JPY`,
        status: "unavailable",
        sellPercent: null,
        buyPercent: null,
      };
    }
    return {
      symbol: `${symbol}JPY`,
      status: "ok",
      sellPercent: ((vct.bid - bpj.bid) / bpj.bid) * 100,
      buyPercent: ((vct.ask - bpj.ask) / bpj.ask) * 100,
    };
  });
}

export function workbookSessionLabel(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Session time must be a valid Date");
  }
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  const hour = jst.getUTCHours();
  const session = hour < 8 ? "NY" : (hour < 17 ? "TYO" : "LDN");
  if (hour < 8) jst.setUTCDate(jst.getUTCDate() - 1);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}${session}`;
}

function validQuote(quote) {
  return Number.isFinite(quote?.bid)
    && Number.isFinite(quote?.ask)
    && quote.bid > 0
    && quote.ask >= quote.bid;
}
