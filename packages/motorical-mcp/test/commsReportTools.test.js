// The reporting reads of the Communications MCP (M3-6): five read:comms tools. They answer "how did it go?" without ever putting a recipient
// address, an IP or a user agent in the chat, and without letting an agent quote an open rate without its caveat.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createDelegatedClient } from "../src/delegatedClient.js";
import { SERVERS, TOOL_ROUTES, HOSTED_ONLY_TOOLS } from "../src/servers.js";
import { TOOLS } from "../src/registry.js";
import { COMMS_REPORT_TOOLS } from "../src/commsReportTools.js";
import { TOOL_SCOPES, SERVER_TOOLS } from "@motorical/scope-catalog";
import { FULL_EMAIL } from "../src/commsMask.js";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const signer = { key: privateKey.export({ type: "pkcs8", format: "pem" }), kid: "k1" };
const server = SERVERS.find((s) => s.key === "communications");
const W1 = "33333333-3333-4333-8333-333333333333";
const CAMP = "88888888-8888-4888-8888-888888888888";
const claims = (scopes = ["read:comms"]) => ({ grantId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", scopes, motorBlockIds: [] });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ok = (data, extra = {}) => json(200, { success: true, data, ...extra });
const BASE = "http://comms.test/api";
const NAMES = ["comms_get_campaign_report", "comms_get_campaign_links", "comms_get_campaign_timeline", "comms_list_campaign_events", "comms_get_analytics_overview"];

const make = (table, scopes) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.slice(BASE.length);
    calls.push({ method: init.method, path });
    const hit = Object.entries(table).find(([k]) => k === `${init.method} ${path}` || (k.endsWith("*") && `${init.method} ${path}`.startsWith(k.slice(0, -1))));
    if (!hit) throw new Error(`unexpected call: ${init.method} ${path}`);
    return typeof hit[1] === "function" ? hit[1](init, path) : hit[1];
  };
  return { client: createDelegatedClient({ claims: claims(scopes), server, signer, apiBaseUrl: "http://backend.test", commsBaseUrl: BASE, fetchImpl }), calls };
};

const BASIS = "One row per recipient. Apple Mail Privacy Protection and Gmail image-proxy fetches look like real opens and are included.";
const report = (over = {}) => ({
  campaign_id: CAMP, basis: BASIS, audience: { snapshot_total: 120, snapshot_version: 3 }, recipients: 120,
  funnel: { handed_off: 120, accepted: 119, delivered: 118, opened: 60, clicked: 12 }, outcomes: { bounced: 2, failed: 0, complained: 0 },
  engagement: { opens_total: 90, opens_unique: 64, opens_unique_excluding_scanners: 60, clicks_total: 20, clicks_unique: 12 },
  rates: { delivery_rate: 98, bounce_rate: 2, open_rate: 51, click_rate: 10, denominators: { delivery_rate: "handed_off", bounce_rate: "handed_off", open_rate: "delivered", click_rate: "delivered" } },
  sync: { synced: true, outcomes_pending: 0, latest_handoff_at: "2026-10-27T10:00:00.000Z", lag_seconds: null, as_of: "2026-10-27T12:00:00.000Z" },
  notes: [], status: "sent", pacing: { state: "finished" }, ...over,
});
const byName = (n) => TOOLS.find((t) => t.name === n);

describe("registration", () => {
  test("five tools, all read:comms, read-only, hosted-only, in the catalogue and the registry", () => {
    assert.deepEqual(COMMS_REPORT_TOOLS.map((t) => t.tool).sort(), [...NAMES].sort());
    for (const n of NAMES) {
      assert.ok(SERVER_TOOLS.communications.includes(n), n); assert.ok(byName(n), n); assert.ok(HOSTED_ONLY_TOOLS.includes(n), n); assert.ok(TOOL_ROUTES[n], n);
      assert.deepEqual(TOOL_SCOPES[n], ["read:comms"], n);
      const a = byName(n).annotations; assert.equal(a.readOnlyHint, true, n); assert.equal(a.destructiveHint, false, n);
    }
  });
  test("the events tool caps the page at 50 and has no redact, address or ip input", () => {
    const props = Object.keys(byName("comms_list_campaign_events").inputSchema);
    assert.ok(!props.some((p) => /redact|email|address|ip/i.test(p)), props.join());
    assert.equal(byName("comms_list_campaign_events").inputSchema.pageSize.safeParse(51).success, false);
    assert.equal(byName("comms_list_campaign_events").inputSchema.pageSize.safeParse(50).success, true);
  });
});

describe("comms_get_campaign_report", () => {
  test("consents and unsubscribes are said per campaign with the delivered denominator, and the scanner caveat", async () => {
    const withConsent = report({ consent: { click_consent_enabled_now: true, recorded_total: 5, by_source: { campaign_click: 4, link_confirmation: 1 }, denominator: { delivered: 118 } }, unsubscribes: { people: 2, of_delivered: 118 } });
    const { client } = make({ [`GET /campaigns/${CAMP}/report`]: ok(withConsent) });
    const plain = (await client.commsGetCampaignReport({ workspaceId: W1, id: CAMP })).plain.join(" | ");
    assert.match(plain, /5 people were recorded as consenting.*1 pressed the confirm button, 4 by clicking a link.*out of 118 delivered/);
    assert.match(plain, /Click counts as consent is ON/); assert.match(plain, /scanners are not filtered/);
    assert.match(plain, /2 unsubscribed from this campaign, out of 118 delivered/);
  });
  test("with open tracking off the open numbers are null and the sentence says unknown, not zero", async () => {
    const off = report({ open_tracking: { enabled: false, note: "x" } });
    const { client } = make({ [`GET /campaigns/${CAMP}/report`]: ok(off) });
    const r = await client.commsGetCampaignReport({ workspaceId: W1, id: CAMP });
    assert.equal(r.data.engagement.opens_unique, null); assert.equal(r.data.rates.open_rate, null); assert.equal(r.data.funnel.opened, null);
    assert.match(r.plain.join(" "), /unknown \(null\), not zero/);
  });
  test("returns the report with its basis, the data-as-of time, and plain sentences with the denominators written out", async () => {
    const { client, calls } = make({ [`GET /campaigns/${CAMP}/report`]: ok(report()) });
    const r = await client.commsGetCampaignReport({ workspaceId: W1, id: CAMP });
    assert.equal(calls[0].path, `/campaigns/${CAMP}/report`);
    assert.equal(r.data.basis, BASIS); assert.equal(r.dataAsOf, "2026-10-27T12:00:00.000Z"); assert.equal(r.sent, true);
    const plain = r.plain.join(" | ");
    assert.match(plain, /118 of 120 handed off were delivered/); assert.match(plain, /60 of 118 delivered opened/);
    assert.match(plain, /estimate/i); assert.match(plain, /12 of 118 delivered clicked/);
  });
  test("a campaign that has not sent says there is no data yet, never zero rates", async () => {
    const empty = report({ status: "draft", recipients: 0, funnel: { handed_off: 0, accepted: 0, delivered: 0, opened: 0, clicked: 0 }, outcomes: { bounced: 0, failed: 0, complained: 0 }, rates: { delivery_rate: 0, bounce_rate: 0, open_rate: 0, click_rate: 0 } });
    const { client } = make({ [`GET /campaigns/${CAMP}/report`]: ok(empty) });
    const r = await client.commsGetCampaignReport({ workspaceId: W1, id: CAMP });
    assert.equal(r.sent, false); assert.match(r.plain.join(" "), /no data yet/i); assert.doesNotMatch(r.plain.join(" "), /\b0%/);
  });
  test("outcomes still syncing are reported as such", async () => {
    const { client } = make({ [`GET /campaigns/${CAMP}/report`]: ok(report({ sync: { synced: false, outcomes_pending: 7, latest_handoff_at: "2026-10-27T10:00:00.000Z", lag_seconds: 600, as_of: "2026-10-27T12:00:00.000Z" } })) });
    assert.match((await client.commsGetCampaignReport({ workspaceId: W1, id: CAMP })).plain.join(" "), /7 .*still waiting|still syncing/i);
  });
  test("a bad id is refused before any network call; read:comms is required", async () => {
    const { client, calls } = make({});
    await assert.rejects(() => client.commsGetCampaignReport({ workspaceId: W1, id: "nope" }), (e) => e.data.code === "INVALID_ID");
    const bare = make({}, ["read:analytics"]);
    await assert.rejects(() => bare.client.commsGetCampaignReport({ workspaceId: W1, id: CAMP }));
    assert.equal(calls.length + bare.calls.length, 0);
  });
});

describe("comms_get_campaign_links", () => {
  test("keeps origin and path, scrubs the query string and fragment, and says so", async () => {
    const rows = [{ url: "https://shop.example/sale?utm=a&token=SECRET&email=jane@example.com#top", total_clicks: 9, unique_clicks: 5 }, { url: "https://shop.example/", total_clicks: 2, unique_clicks: 2 }];
    const { client } = make({ [`GET /campaigns/${CAMP}/click-breakdown`]: ok(rows) });
    const r = await client.commsGetCampaignLinks({ workspaceId: W1, id: CAMP });
    assert.equal(r.data[0].url, "https://shop.example/sale?..."); assert.equal(r.data[0].total_clicks, 9); assert.equal(r.data[1].url, "https://shop.example/");
    assert.doesNotMatch(JSON.stringify(r), /SECRET|jane/); assert.match(r.note, /query/i);
  });
});

describe("comms_get_campaign_timeline", () => {
  test("masks the recent-activity addresses, passes days, keeps subject and counts", async () => {
    const data = { summary: { totalEmails: 120, deliveryRate: 98, basis: BASIS, period_days: 7 }, dailyBreakdown: { "2026-10-27": { delivered: 118, opened: 60 } }, recentActivity: [{ classification: "opened", toAddress: "jane.doe@example.com", subject: "Autumn", timestamp: "2026-10-27T11:00:00Z" }] };
    const { client, calls } = make({ [`GET /campaigns/${CAMP}/analytics?days=3`]: ok(data) });
    const r = await client.commsGetCampaignTimeline({ workspaceId: W1, id: CAMP, days: 3 });
    assert.equal(calls[0].path, `/campaigns/${CAMP}/analytics?days=3`);
    assert.equal(r.data.recentActivity[0].toAddress, "j***@example.com"); assert.equal(r.data.recentActivity[0].subject, "Autumn");
    assert.doesNotMatch(JSON.stringify(r), FULL_EMAIL); assert.equal(r.data.dailyBreakdown["2026-10-27"].delivered, 118);
  });
  test("days defaults to 7 and is bounded 1 to 30", async () => {
    const { client, calls } = make({ [`GET /campaigns/${CAMP}/analytics*`]: ok({ summary: {}, dailyBreakdown: {}, recentActivity: [] }) });
    await client.commsGetCampaignTimeline({ workspaceId: W1, id: CAMP });
    assert.match(calls[0].path, /days=7$/);
    for (const days of [0, 31, 1.5]) await assert.rejects(() => client.commsGetCampaignTimeline({ workspaceId: W1, id: CAMP, days }), (e) => e.data.code === "INVALID_DAYS");
  });
});

describe("comms_list_campaign_events", () => {
  const item = (over = {}) => ({ id: "e1", type: "clicked", message_id: "m1", contact_id: "c1", occurred_at: "2026-10-27T11:00:00Z", payload: { url: "https://shop.example/a?x=1", ip: "203.0.113.9", userAgent: "Mozilla", ...over } });
  test("always asks for redact=true, strips ip and user agent even if the server sent them, and scrubs addresses and URL queries", async () => {
    const { client, calls } = make({ [`GET /campaigns/${CAMP}/events*`]: ok({ items: [item({ note: "from jane@example.com" })], total: 1, page: 1, pageSize: 50 }) });
    const r = await client.commsListCampaignEvents({ workspaceId: W1, id: CAMP, type: "clicked" });
    assert.match(calls[0].path, /redact=true/); assert.match(calls[0].path, /status=clicked/); assert.match(calls[0].path, /pageSize=50/);
    const s = JSON.stringify(r); assert.doesNotMatch(s, /203\.0\.113\.9|Mozilla|userAgent|"ip"/); assert.doesNotMatch(s, FULL_EMAIL); assert.doesNotMatch(s, /x=1/);
    assert.equal(r.data.items[0].contact_id, "c1"); assert.equal(r.data.total, 1);
  });
  test("an unknown event type, an oversize page and a bad page are refused before the network", async () => {
    const { client, calls } = make({});
    await assert.rejects(() => client.commsListCampaignEvents({ workspaceId: W1, id: CAMP, type: "hacked" }), (e) => e.data.code === "INVALID_TYPE");
    await assert.rejects(() => client.commsListCampaignEvents({ workspaceId: W1, id: CAMP, pageSize: 51 }), (e) => e.data.code === "INVALID_PAGE");
    await assert.rejects(() => client.commsListCampaignEvents({ workspaceId: W1, id: CAMP, page: 0 }), (e) => e.data.code === "INVALID_PAGE");
    assert.equal(calls.length, 0);
  });
  test("an error from the service is scrubbed too", async () => {
    const { client } = make({ [`GET /campaigns/${CAMP}/events*`]: json(500, { success: false, error: "failed for jane@example.com" }) });
    await assert.rejects(() => client.commsListCampaignEvents({ workspaceId: W1, id: CAMP }), (e) => !FULL_EMAIL.test(e.message));
  });
});

describe("comms_get_analytics_overview", () => {
  test("passes days (default 30, 1 to 365), keeps the totals, and carries the open-count caveat", async () => {
    const data = { overview: { delivered: { total_events: 500, campaigns: 4, unique_recipients: 480 } }, top_campaigns: [{ id: CAMP, name: "Autumn", sent: 120, delivered: 118, clicked: 20, unique_clickers: 12, click_rate: 10 }], period_days: 30 };
    const { client, calls } = make({ "GET /analytics/overview*": ok(data) });
    const r = await client.commsGetAnalyticsOverview({ workspaceId: W1 });
    assert.equal(calls[0].path, "/analytics/overview?days=30"); assert.equal(r.data.top_campaigns[0].name, "Autumn"); assert.match(r.note, /estimate/i);
    await client.commsGetAnalyticsOverview({ workspaceId: W1, days: 365 }); assert.equal(calls[1].path, "/analytics/overview?days=365");
    for (const days of [0, 366, 2.5]) await assert.rejects(() => client.commsGetAnalyticsOverview({ workspaceId: W1, days }), (e) => e.data.code === "INVALID_DAYS");
  });
});
