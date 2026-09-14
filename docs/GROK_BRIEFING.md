# Briefing packet for Grok — spec these 12 features

Grok has **no access to this repository** — no read, no clone, nothing. Every
fact below is something Claude verified directly against the actual code so
Grok isn't guessing at what already exists. Don't assume anything about the
implementation beyond what's stated here; if a spec needs to know something
this doc doesn't cover, say so explicitly rather than assuming a default —
Claude will check and fill it in rather than have Grok invent it.

**What comes back:** one write-up per feature, in the order below, covering:
1. **Scope** — what's in, what's explicitly out.
2. **User-facing flow** — every step, including error/edge cases.
3. **Data model implications** — new columns/tables you think are needed
   (rough is fine, Claude finalizes the actual migration) — check against
   "Existing schema" below first so you're not inventing a field that's
   already there.
4. **Judgment calls, flagged explicitly** — anything that's a product
   decision rather than an implementation detail (e.g. "can a coordinator
   un-private an event after RSVPs exist?"). Don't silently decide these —
   call them out as open questions if you don't have a strong opinion.
5. **Acceptance criteria** — what "done" looks like, testable.

No code. Plain spec writing only — Claude implements against these.

---

## Stack & constraints (applies to every feature below)

- **Frontend/backend:** TanStack Start (React + server functions), TypeScript.
- **Database:** Supabase Postgres, RLS on every table, `SECURITY DEFINER`
  functions for cross-tenant reads.
- **Multi-tenant model:** every coordinator has their own calendar
  (`coordinator_profiles`, keyed by `coordinator_id` = their auth user id).
  Events, venues, organizers, tickets etc. all scope to a `coordinator_id`.
- **Payments already in place:** Stripe is integrated for **coordinator
  subscription billing only** (the platform charging coordinators their
  monthly fee) — this is a separate, working integration from anything to do
  with ticket-buyer payments. Don't assume Stripe wiring for one implies it
  for the other.
- **Email:** already provider-agnostic — `platform_config` has an
  `email_provider` enum (lovable/sendgrid/postmark/mailgun/none) and stores
  the API key/from-address per provider. New email features should use this
  existing send path, not invent a new one.
- **No existing general API-key or webhook-config pattern.** The only outbound
  webhook today is Stripe's own inbound handler; there's no coordinator-facing
  "paste your webhook URL here" UI anywhere yet. Anything needing that is
  greenfield — say what the settings UI for it should look like.
- **Currency/timezone defaults:** `coordinator_profiles` already has a
  `currency` and a `timezone` column (coordinator-level defaults) — these
  exist today. Individual **events** do NOT have their own timezone or
  currency column right now.

---

## 1. Paid ticketing (finish what's stubbed)

**Current state:** Ticket tiers already have a full schema — name, price
in cents, early-bird pricing + a valid-from/until window, quantity
available/sold. Purchases already get their own row (quantity, amount,
status, a `stripe_charge_id` column that exists but is never populated, a
`qr_token`, check-in count). The purchase flow **never calls Stripe** — it
just inserts the purchase row as "confirmed" or "pending" and literally
returns the string "Purchase pending — Stripe charge would happen here." QR
generation and check-in scanning already work for the free-ticket path
(price = 0).

**Spec this:** the actual charge execution. Checkout Session vs. embedded
Payment Element (state a preference), what happens to `quantity_sold` if a
payment fails after the row is inserted (currently it decrements
optimistically — is that still safe with a real async charge?), refund
policy (does a coordinator canceling an event auto-refund? is refund
self-service for a buyer, or coordinator-approved?), and whether this uses
the *coordinator's own* Stripe account (Stripe Connect, matching how
subscription billing already distinguishes "custom Stripe key" vs. platform
key) or the platform's Stripe account for everyone.

---

## 2. Multi-day event rendering

**Current state:** An event's `start_time`/`end_time` can already be set
days apart — nothing rejects it at the data layer. But the month/week views
only show the event on its **start date**, nowhere else. A 3-day festival
currently appears once, on day one, and is invisible on days two and three.

**Spec this:** how a multi-day event should render in each of the 7 calendar
views (Month, Week, Day, List, Agenda, Photo, Summary) — a spanning bar in
Month/Week (like a typical calendar app), and what "appearing on a day" means
for List/Agenda (repeated entry per day? one entry with a date range shown?).
Also cover: does a multi-day event's RSVP/ticket/check-in apply once for the
whole run, or per-day? (Today's data model has one `events` row per date
range, not per day — flag whether that's sufficient or whether multi-day
needs per-day sessions, which would be a bigger data model change.)

---

## 3. Timezone display for one-off events

**Current state:** Recurring series already store and compute against an
explicit `timezone` field. A regular one-off event does not have its own
timezone — only the coordinator's profile does (`coordinator_profiles.timezone`,
already exists). There's no "shown in your local time" conversion anywhere in
the UI today; a fresh bug fix (not a feature) addressed one specific
late-night-event display bug, nothing more.

**Spec this:** should an event inherit the coordinator's profile timezone by
default (simplest), or does the create/edit form need its own per-event
timezone picker (needed if a coordinator ever runs an event outside their own
timezone)? And separately: should the calendar convert displayed times to
*the viewer's* browser timezone, or always show the event's own timezone
with a label (e.g. "6:00 PM CST")? These produce very different UX — pick one
and justify it, or flag as an open question if you want Claude/the product
owner to decide.

---

## 4. Private events

**Current state:** No `is_private` column or equivalent exists anywhere.
Every event on a coordinator's calendar is visible to anyone who can see that
calendar today.

**Spec this:** what "private" actually restricts — invisible to public
`/c/$slug` and the embed, but still linkable directly (unlisted)? Or fully
access-gated (requires being invited/signed in)? Does a private event still
count toward the coordinator's public event totals/analytics? Can it be
submitted via the public `/submit-event` flow at all, or only created
directly by the coordinator? Flag the un-privating question above too.

---

## 5. Timeline view

**Current state:** 7 views exist today: Month, Week, Day, List, Agenda,
Photo, Summary. No Timeline/Gantt-style view.

**Spec this:** what a Timeline view actually shows that List/Agenda don't —
concretely, is this a horizontal date-axis view (useful for multi-day events
from #2 — consider spec'ing these together), or a different grouping (e.g.
by venue, by organizer)? Say which, and mock the layout in words if it helps.

---

## 6. Speaker workflows

**Current state:** There's a generic `organizers` table (name, title, bio,
credentials, photo, social links) scoped to a coordinator, currently labeled
"Organizers & speakers" in the UI and assignable to events (multiple per
event, up to a configured max). There is no distinct speaker concept, no
per-session assignment, and no schedule-track structure.

**Spec this:** does "speaker" need to be a genuinely separate entity from
Organizer, or is it the same entity with an added role/type field
(Organizer vs. Speaker vs. both) plus a session-assignment layer on top for
multi-day/multi-track events? What does a speaker's public page (if any) show
beyond what an organizer's does today?

---

## 7. Unified email logs

**Current state:** Per-invitation email tracking already exists and works —
sent/opened/clicked timestamps plus RSVP status, one row per invitation, and
it's already surfaced to the coordinator on the event page. Broadcast
announcements and scheduled reminders are sent through the same underlying
provider-agnostic mailer but are **not** logged the same granular way today.

**Spec this:** what a unified log view should show across all three email
types (invitations/announcements/reminders) in one place — filters, what
counts as a "failure" worth surfacing, whether bounces/complaints need
handling (depends on what the configured provider — SendGrid/Postmark/Mailgun
— reports back, which may need a webhook Claude will have to check per
provider).

---

## 8. Slack/Discord coordinator notifications

**Current state:** Nothing exists. Not even a settings field to paste a
webhook URL into.

**Spec this:** which events trigger a notification (new public submission
awaiting review? new RSVP? a ticket sale, once #1 is real?) — probably
configurable per coordinator, so spec what that settings UI looks like
(one URL field? separate Slack vs. Discord fields? a toggle per event type?).
Message format/content per notification type.

---

## 9. General REST API

**Current state:** No public REST CRUD API exists. There *is* a separate,
already-live MCP (Model Context Protocol) server at `/mcp` with 5 tools
(list/get/create/update events, list venues), OAuth-protected, scoped to the
signed-in user's own data via RLS. A REST API would be a different,
additional surface for different consumers (server-to-server integrations
vs. MCP's AI-agent tool-use model) — don't spec this as "just expose MCP as
REST," they serve different purposes.

**Spec this:** auth model (API keys per coordinator vs. OAuth), what
resources are exposed and at what CRUD depth, rate limiting policy, and
whether it needs versioning from day one.

---

## 10. Outbound webhooks (general) + Zapier

**Current state:** Nothing exists beyond the Stripe *inbound* webhook
handler (that's the platform receiving events from Stripe, not the reverse).
No coordinator-facing outbound webhook config anywhere.

**Spec this — depends on #9's auth/signing decisions being made first**,
so note that dependency explicitly if you write this one before #9 is spec'd.
Cover: what events a coordinator can subscribe a webhook to, payload shape,
retry/backoff policy on delivery failure, and signing (HMAC secret, like
Stripe's own webhooks do) so a receiver can verify authenticity. Zapier
specifically usually means either "expose the general webhook system" or "a
dedicated Zapier app in their marketplace" — say which you're spec'ing.

---

## 11. Google/Outlook two-way sync

**Current state:** Only one-way iCal subscribe exists today (a coordinator's
calendar as an `.ics` feed URL, and a per-event `.ics` download). No OAuth
integration with Google Calendar or Microsoft Graph, no two-way sync of any
kind.

**Spec this:** what "two-way" actually means here — does a change made in
Google Calendar write back into EventHub, or is this "EventHub pushes changes
out via the Google/Microsoft APIs instead of a static iCal feed" (one-way,
just push instead of pull)? True two-way sync needs conflict resolution
(what wins if both sides edit the same event) — spec that explicitly if you
mean true two-way, or say clearly if you mean the simpler push-only version.

---

## 12. SMS reminders

**Current state:** No SMS/phone integration anywhere — no phone number
field being collected from attendees today, no Twilio or equivalent wired
up.

**Spec this:** where the phone number gets collected (RSVP form? account
settings?) and consent/opt-out handling — **this needs explicit TCPA-aware
consent language and an opt-out path before any SMS goes out in the US**,
so treat consent flow as part of the spec, not an afterthought. Also cover
what triggers an SMS (same reminder schedule as email, or a shorter
"starting soon" nudge specifically) and provider (Twilio is the default
assumption unless you have a reason to spec otherwise).
