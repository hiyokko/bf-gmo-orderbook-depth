import {
  CLARITY_LEGISLATION,
  RUNTIME_DEFAULTS,
} from "./config.mjs";

const SENATE_CALENDAR_PATTERN =
  /^Placed on Senate Legislative Calendar under General Orders\. Calendar No\. (\d+)\.$/;
const HOUSE_PASSED_PATTERN =
  /On passage Passed by the Yeas and Nays:/;

export async function fetchClarityLegislationStatus({
  fetchImpl = globalThis.fetch,
  timeoutMs = CLARITY_LEGISLATION.timeoutMs,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable");
  }

  let response;
  try {
    response = await fetchImpl(CLARITY_LEGISLATION.billStatusUrl, {
      headers: {
        accept: "application/xml,text/xml",
        "user-agent": RUNTIME_DEFAULTS.userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`GovInfo bill status failed: ${toError(error).message}`);
  }
  if (!response.ok) {
    throw new Error(`GovInfo bill status failed: HTTP ${response.status}`);
  }
  return parseClarityLegislationStatus(await response.text());
}

export function parseClarityLegislationStatus(xml) {
  const bill = extractBlock(xml, "bill");
  const actions = extractBlock(bill, "actions");
  const latestAction = extractBlock(actions, "item");
  const latestActionDate = extractText(latestAction, "actionDate");
  const latestActionText = extractText(latestAction, "text");
  const calendarMatch = latestActionText.match(SENATE_CALENDAR_PATTERN);
  const housePassed = HOUSE_PASSED_PATTERN.test(actions);

  if (!calendarMatch || !housePassed || !isIsoDate(latestActionDate)) {
    return null;
  }

  return {
    stage: "senate_calendar",
    latestActionDate,
    latestActionText,
    calendarNumber: calendarMatch[1],
    sourceUrl: CLARITY_LEGISLATION.sourceUrl,
    summaryJa: `上院の立法カレンダー（General Orders）に掲載。Calendar No. ${
      calendarMatch[1]
    }。`,
  };
}

function extractBlock(xml, tagName) {
  const match = String(xml).match(
    new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"),
  );
  return match?.[1] || "";
}

function extractText(xml, tagName) {
  return decodeXml(extractBlock(xml, tagName).replace(/<[^>]*>/g, "").trim());
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
