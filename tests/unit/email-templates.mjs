// src/lib/email-templates.ts: reminder/invitation/update/refund emails state
// the event's time in the EVENT's zone, labelled. Before the gap-closure fix
// they formatted with no zone -- i.e. the server's -- so on Vercel (UTC) a
// 6 PM Chicago reminder read "11:00 PM". Every template is rendered under
// three different server zones and must produce identical text.
// Run: node tests/unit/email-templates.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  invitationTemplate,
  reminderTemplate,
  rsvpConfirmationTemplate,
  ticketRefundTemplate,
  updateTemplate,
} from "../../src/lib/email-templates.ts";

const chicago = { id: "e1", title: "Harvest Festival", start_time: "2026-09-19T23:00:00Z", location: "Main St", timezone: "America/Chicago" };
const phoenix = { id: "e2", title: "Desert Night", start_time: "2026-07-11T01:00:00Z", location: null, timezone: "America/Phoenix" };
const kolkata = { id: "e3", title: "Morning Talk", start_time: "2026-06-01T03:30:00Z", location: null, timezone: "Asia/Kolkata" };
const noZone = { id: "e4", title: "Legacy", start_time: "2026-09-19T23:00:00Z", location: null };

function render() {
  return {
    reminder: reminderTemplate({ event: chicago, when: "1d" }).text,
    reminderHtml: reminderTemplate({ event: chicago, when: "1h" }).html,
    invite: invitationTemplate({ event: chicago, invitationUrl: "https://x/i/t" }).text,
    rsvp: rsvpConfirmationTemplate({ event: phoenix, status: "going" }).text,
    update: updateTemplate({ event: kolkata, message: "Room change" }).html,
    refund: ticketRefundTemplate({ event: chicago, amountCents: 1500, reason: "event_cancelled" }).html,
    legacy: reminderTemplate({ event: noZone, when: "1d" }).text,
  };
}

if (process.env.EMAIL_CHILD) {
  console.log(JSON.stringify(render()));
  process.exit(0);
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

const self = fileURLToPath(import.meta.url);
const runIn = (TZ) =>
  JSON.parse(execFileSync(process.execPath, [self], { env: { ...process.env, TZ, EMAIL_CHILD: "1" }, encoding: "utf8" }));
const servers = { UTC: runIn("UTC"), "Asia/Tokyo": runIn("Asia/Tokyo"), "America/Los_Angeles": runIn("America/Los_Angeles") };

const r = servers.UTC;
check("reminder text: the event's own local time, labelled", r.reminder.includes("Saturday, September 19 at 6:00 PM CDT") || r.reminder.includes("Saturday, September 19, 6:00 PM CDT"), r.reminder);
check("reminder never shows the UTC wall time (11:00 PM)", !r.reminder.includes("11:00"), r.reminder);
check("reminder html carries the same labelled time", /6:00\s?PM CDT/.test(r.reminderHtml), r.reminderHtml.slice(0, 300));
check("invitation: labelled event-local time", /6:00\s?PM CDT/.test(r.invite), r.invite);
check("RSVP confirmation for an Arizona event says MST (no DST) in July", /6:00\s?PM MST/.test(r.rsvp), r.rsvp);
check("update email for a +05:30 zone shows 9:00 AM local", /9:00\s?AM GMT\+5:30/.test(r.update), r.update);
check("refund email: labelled event-local time", /6:00\s?PM CDT/.test(r.refund), r.refund.slice(0, 400));
check("a caller that omits the zone gets an explicit UTC label, not an unlabelled server-zone time", /11:00\s?PM UTC/.test(r.legacy), r.legacy);
check("identical output whether the server runs in UTC, Tokyo or Los Angeles",
  JSON.stringify(servers.UTC) === JSON.stringify(servers["Asia/Tokyo"]) &&
  JSON.stringify(servers.UTC) === JSON.stringify(servers["America/Los_Angeles"]),
  JSON.stringify(servers, null, 1).slice(0, 800));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
