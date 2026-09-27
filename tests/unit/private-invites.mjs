// src/lib/private-invites.ts: the workflow rules on top of the RLS boundary --
// who may accept which invite, and which guest-list transitions a coordinator
// may make. Imports the real module. The accept rules are checked
// exhaustively over every invite state x caller relationship.
// Run: node tests/unit/private-invites.mjs
import { acceptDecision, coordinatorTransition, maskEmail, normalizeEmails } from "../../src/lib/private-invites.ts";
import { privateInviteTemplate } from "../../src/lib/email-templates.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

// ---- normalizeEmails ------------------------------------------------------------
{
  const r = normalizeEmails([" Pat@Example.com ", "pat@example.com", "not-an-email", "", "sam@x.org", "a@b"]);
  check("emails are trimmed, lowercased and de-duplicated", JSON.stringify(r.valid) === '["pat@example.com","sam@x.org"]', JSON.stringify(r));
  check("invalid lines are reported back, blanks ignored", JSON.stringify(r.invalid) === '["not-an-email","a@b"]', JSON.stringify(r.invalid));
}

// ---- maskEmail --------------------------------------------------------------------
check("maskEmail keeps the domain and first letter only", maskEmail("someone.else@example.com") === "s••••••@example.com", maskEmail("someone.else@example.com"));
check("maskEmail never returns the local part", !maskEmail("ab@x.com").includes("ab@"), maskEmail("ab@x.com"));

// ---- acceptDecision: exhaustive -----------------------------------------------------
const ME = "u-me", OTHER = "u-other";
const statuses = ["pending", "requested", "accepted", "declined", "revoked"];
const inviteShapes = [
  { label: "emailed to me", email: "me@x.com", user_id: null },
  { label: "emailed to someone else", email: "them@x.com", user_id: null },
  { label: "bound to me", email: "me@x.com", user_id: ME },
  { label: "bound to someone else", email: "them@x.com", user_id: OTHER },
];
const callers = [
  { label: "me", id: ME, email: "Me@X.com" },
  { label: "me with no email", id: ME, email: null },
];
let exhaustiveOk = true;
const table = [];
let combos = 0;
for (const status of statuses)
  for (const shape of inviteShapes)
    for (const caller of callers) {
      // Impossible in the database (CHECK event_invites_accepted_has_user).
      if (status === "accepted" && shape.user_id === null) continue;
      combos++;
      const d = acceptDecision({ status, email: shape.email, user_id: shape.user_id }, caller);
      // Independent statement of the rule:
      //  - an ACCEPTED invite is settled by account identity alone: only the
      //    account it's bound to may "accept" it again (idempotent);
      //  - otherwise allowed iff not revoked, not bound to another account,
      //    and (if emailed) the caller's email matches -- binding to the
      //    caller's own user_id doesn't waive the email check before accept.
      const boundToOther = shape.user_id !== null && shape.user_id !== caller.id;
      const emailOk = !shape.email || (caller.email ?? "").toLowerCase() === shape.email;
      const expected = status === "accepted" ? shape.user_id === caller.id : status !== "revoked" && !boundToOther && emailOk;
      if (d.ok !== expected) exhaustiveOk = false;
      table.push(`${status}/${shape.label}/${caller.label}=${d.ok ? "ok" : d.reason}`);
    }
check(`acceptDecision matches the rule for all ${combos} possible state x invite x caller combinations`, exhaustiveOk && combos === 36, table.join("\n"));
check("revoked is refused even for the rightful recipient", acceptDecision({ status: "revoked", email: "me@x.com", user_id: ME }, { id: ME, email: "me@x.com" }).reason === "revoked");
check("an invite accepted by someone else reports 'claimed'", acceptDecision({ status: "accepted", email: "them@x.com", user_id: OTHER }, { id: ME, email: "them@x.com" }).reason === "claimed");
check("re-accepting your own accepted invite is an idempotent success",
  JSON.stringify(acceptDecision({ status: "accepted", email: "me@x.com", user_id: ME }, { id: ME, email: "me@x.com" })) === '{"ok":true,"alreadyAccepted":true}');
const wrong = acceptDecision({ status: "pending", email: "them@x.com", user_id: null }, { id: ME, email: "me@x.com" });
check("wrong account gets a masked hint of the invited address", wrong.reason === "wrong_account" && wrong.hint === maskEmail("them@x.com") && !wrong.hint.includes("them@"), JSON.stringify(wrong));
check("email match is case-insensitive", acceptDecision({ status: "pending", email: "me@x.com", user_id: null }, { id: ME, email: "ME@X.COM" }).ok);

// ---- coordinatorTransition --------------------------------------------------------------
const T = (s, a, e = true) => coordinatorTransition(s, a, e);
check("approve: only from requested -> accepted", T("requested", "approve").next === "accepted" && statuses.filter((s) => s !== "requested").every((s) => "error" in T(s, "approve")));
check("an emailed (pending) invite can't be approved on the guest's behalf", "error" in T("pending", "approve"));
check("decline: requested or pending -> declined", T("requested", "decline").next === "declined" && T("pending", "decline").next === "declined" && "error" in T("accepted", "decline"));
check("revoke: from anything but revoked", statuses.filter((s) => s !== "revoked").every((s) => T(s, "revoke").next === "revoked") && "error" in T("revoked", "revoke"));
check("resend: issues a new token and resets to pending", T("declined", "resend").next === "pending" && T("declined", "resend").newToken === true);
check("resend: not for an accepted guest", "error" in T("accepted", "resend"));
check("resend: not without an email address", "error" in T("revoked", "resend", false));

// ---- invite email -------------------------------------------------------------------------
{
  const tpl = privateInviteTemplate({
    event: { id: "e", title: "Board <Retreat>", start_time: "2026-09-19T23:00:00Z", location: "Lake House", timezone: "America/Chicago" },
    acceptUrl: "https://events.example/private-invite/TOKEN123",
    message: "See you <there>",
    fromName: "Pat & Co",
  });
  check("invite email: subject names the event", tpl.subject === "Private invitation: Board <Retreat>");
  check("invite email: html and text carry the accept link", tpl.html.includes("/private-invite/TOKEN123") && tpl.text.includes("/private-invite/TOKEN123"));
  check("invite email: event-local time with zone", /6:00\s?PM CDT/.test(tpl.text), tpl.text);
  check("invite email: html escapes title, note and sender", tpl.html.includes("Board &lt;Retreat&gt;") && tpl.html.includes("See you &lt;there&gt;") && tpl.html.includes("Pat &amp; Co") && !tpl.html.includes("<Retreat>"));
  check("invite email: says to sign in with this address", /sign in .*with this email address/i.test(tpl.html));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
