import { SPREAD_MARKETS } from "./config.mjs";

export function createSpreadComparison({
  listings,
  quotes,
  errors = {},
} = {}) {
  validateListings(listings);

  return {
    spot: createMarketComparison(
      listings.spot,
      SPREAD_MARKETS.spot,
      quotes?.spot,
      errors?.spot,
    ),
    leverage: createMarketComparison(
      listings.leverage,
      SPREAD_MARKETS.leverage,
      quotes?.leverage,
      errors?.leverage,
    ),
  };
}

export function calculateSpread(quote) {
  const bid = finitePositiveNumber(quote?.bid);
  const ask = finitePositiveNumber(quote?.ask);
  if (bid === null || ask === null || ask < bid) {
    throw new Error("Quote must contain positive bid/ask values with ask >= bid");
  }

  const mid = (ask + bid) / 2;
  const spread = ask - bid;
  return {
    bid,
    ask,
    mid,
    spread,
    spreadPercent: spread / mid * 100,
  };
}

function createMarketComparison(symbols, venues, marketQuotes = {}, marketErrors = {}) {
  const rows = symbols.map((symbol) => {
    const cells = {};
    for (const venue of venues) {
      const sourceError = marketErrors?.[venue.id];
      const quote = marketQuotes?.[venue.id]?.[symbol];
      if (sourceError) {
        cells[venue.id] = { status: "error" };
      } else if (!quote) {
        cells[venue.id] = { status: "unavailable" };
      } else {
        try {
          cells[venue.id] = {
            status: "ok",
            ...calculateSpread(quote),
          };
        } catch {
          cells[venue.id] = { status: "invalid" };
        }
      }
    }
    return { symbol, cells };
  });

  return {
    venues: venues.map(({ id, label }) => ({ id, label })),
    rows,
  };
}

function validateListings(listings) {
  for (const market of ["spot", "leverage"]) {
    const symbols = listings?.[market];
    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw new Error(`SBIVC ${market} listing is missing`);
    }
    if (new Set(symbols).size !== symbols.length) {
      throw new Error(`SBIVC ${market} listing contains duplicates`);
    }
    if (!symbols.every((symbol) => /^[A-Z][A-Z0-9]{1,15}$/.test(symbol))) {
      throw new Error(`SBIVC ${market} listing contains an invalid symbol`);
    }
  }
}

function finitePositiveNumber(value) {
  const number = typeof value === "string"
    ? Number(value.replaceAll(",", ""))
    : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
