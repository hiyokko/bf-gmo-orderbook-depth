import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchClarityLegislationStatus,
  parseClarityLegislationStatus,
} from "../src/clarity-legislation.mjs";

const RECOGNIZED_XML = `
  <billStatus>
    <bill>
      <actions>
        <item>
          <actionDate>2026-06-01</actionDate>
          <text>Placed on Senate Legislative Calendar under General Orders. Calendar No. 423.</text>
        </item>
        <item>
          <actionDate>2025-07-17</actionDate>
          <text>On passage Passed by the Yeas and Nays: 294 - 134 (Roll no. 199).</text>
        </item>
      </actions>
    </bill>
  </billStatus>
`;

test("GovInfo parser recognizes only the allow-listed Senate calendar status", () => {
  const status = parseClarityLegislationStatus(RECOGNIZED_XML);

  assert.equal(status.stage, "senate_calendar");
  assert.equal(status.latestActionDate, "2026-06-01");
  assert.equal(status.calendarNumber, "423");
  assert.match(status.summaryJa, /上院の立法カレンダー/);
});

test("GovInfo parser omits an unknown or incomplete legislative state", () => {
  const unknown = RECOGNIZED_XML.replace(
    "Placed on Senate Legislative Calendar under General Orders. Calendar No. 423.",
    "A new action not yet classified.",
  );
  const withoutHousePassage = RECOGNIZED_XML.replace(
    "On passage Passed by the Yeas and Nays:",
    "House action:",
  );

  assert.equal(parseClarityLegislationStatus(unknown), null);
  assert.equal(parseClarityLegislationStatus(withoutHousePassage), null);
  assert.equal(parseClarityLegislationStatus("<invalid>"), null);
});

test("GovInfo fetch uses the official XML feed without authentication", async () => {
  let requestedUrl;
  const status = await fetchClarityLegislationStatus({
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.equal(options.headers.accept, "application/xml,text/xml");
      return {
        ok: true,
        status: 200,
        text: async () => RECOGNIZED_XML,
      };
    },
  });

  assert.match(requestedUrl, /^https:\/\/www\.govinfo\.gov\/bulkdata\//);
  assert.doesNotMatch(requestedUrl, /api[_-]?key|token/i);
  assert.equal(status.calendarNumber, "423");
});
