# EventHub — Feature Roadmap

**This is the canonical, shared feature-status doc for EventHub.** It exists so
any AI assistant working on this repo (Claude, Grok, or others) — and any human
— can check feature status without re-deriving it from scratch or trusting a
chat summary. Nothing in here is a promise from memory: every status below was
confirmed by reading the actual code, not inferred from a prior roadmap.

**Ground rule for anyone editing this file:** don't mark something Live,
Partial, or Not Built from memory or from what a previous summary claimed.
Grep the code, cite the file (and line, if it's a specific claim), and update
this doc in the same commit as whatever you verified. If you can't verify a
claim right now, leave it as `NEEDS VERIFICATION` rather than guessing — a
wrong "already live" here sends the next person chasing a feature that isn't
there, which is exactly what happened to produce this doc's first draft
(see "Revision history" at the bottom).

Last verified: 2026-09-14, against commit `a8d7c9d` (spec 03 done) + this pass's private-events work. Specs for everything below that isn't Live: `docs/specs/`. Overnight mailbox: `TEAMWORK.md` (repo root).

---

## ✅ Live

Confirmed working end to end (not just scaffolded) as of the commit above.

| Feature | Where | Notes |
|---|---|---|
| Calendar views: Month, Week, Day, List, Agenda, Photo, Summary | `src/components/CalendarViews/*`, `src/routes/c.$slug.tsx` (`VIEWS` const) | 7 views on the public coordinator page. **Not** "Map" — that's a separate standalone `/map` route, not one of these tabs. |
| Recurring events (RRULE) | `src/lib/series.functions.ts` | Timezone-aware occurrence computation, capped at `MAX_OCCURRENCES`, "this/future/all" delete scoping. |
| Virtual / hybrid event format | `event-modal.tsx`, `events.$id.manage.tsx` (`EventFormatEditor`) | In-person / virtual / hybrid + provider link (Zoom/Meet/YouTube/other). |
| RSVP (going/interested/declined) + waitlist | `events.$id.manage.tsx`, `attendee.functions.ts` | Waitlist auto-promotion on a cancellation. |
| Ticketing — free and paid | `monetization.functions.ts`, `ticket-manager.tsx`, `events.$id.tsx`, `api/stripe.webhook.ts` | **Paid tickets are real now** (commit `bd1164a`+): `createTicketCheckout` reserves a race-safe 30-min hold (`reserve_ticket`, row-locked) and starts a real Stripe Checkout Session; the webhook confirms via `metadata.kind = "ticket_purchase"` (discriminated from the annual-plan subscription handler), releases expired holds, and handles out-of-band refunds. Both the manage-page `TicketManager` and the public `/events/$id` "Buy ticket" button go through this — the public button is no longer wired to RSVP. Coordinator-initiated refunds (`refundTicketPurchase`) and automatic refunds on event cancel/removal (`autoRefundConfirmedTickets`) both call Stripe for real and email the buyer. **v1 uses the platform's own Stripe account for every coordinator — there is no per-coordinator Stripe Connect, so ticket revenue lands in the platform's Stripe, not the coordinator's.** That's a real payout/business decision, not an implementation detail — see `TEAMWORK.md`, needs Jason's explicit sign-off before this runs with real (non-test-mode) cards. |
| QR check-in, desktop + mobile | `events.$id.checkin.tsx`, `events.$id.checkin-mobile.tsx` | `check_in_ticket` now requires `status = 'confirmed'` (migration `20260914044713`) — a pending/cancelled/refunded ticket no longer scans successfully. |
| iCal export (one-way) | `distribution.functions.ts`, `api/public/ical.$token.ts` | Per-coordinator feed URL + per-event `.ics` download. One-way subscribe only — see "Not built" for two-way sync. |
| Venue management | `venues.functions.ts`, `venue-manager.tsx` | Scoped to the creating coordinator. |
| Cross-coordinator venue autosuggest ("master list") | `venues.functions.ts` (`searchVenuesPublic`), wired into `event-modal.tsx` | No auth required; every coordinator's venues suggest to every other coordinator. |
| Organizer management | `organizers.functions.ts`, `organizer-manager.tsx` | Labelled "Organizers & speakers" in the UI — see "Not built" re: speaker-specific workflows. |
| Multi-day event rendering | `src/queries/events.ts` (`occupiesDates`/`occupiesDay`/`isMultiDay`), every view: `CalendarViews/{Month,Day,List,Agenda}View.tsx`, `views/{Week,Summary,Photo}View.tsx`, `api/embed.$slug.ts` | A multi-day event shows on every day it occupies, not just its start date, in every public view — spanning bar in Month, an all-day lane in Week, one row with a date range (not one row per day) in List/Agenda/Summary/Photo, "Day X of Y" in Day view. Embed's own hand-built HTML renderer (no React, no JS) shows a repeated chip per occupied day with a "→ continuation" marker instead of a true CSS-spanning bar — different technique, same requirement, chosen because the fragment has to stay crawlable/indexable with scripts off. Real note for anyone touching this: `src/components/CalendarViews/WeekView.tsx` is **dead code** — no route imports it; `src/views/WeekView.tsx` is the one actually used by `c.$slug.tsx`/`events.tsx`. A third, independent Month/Week/Day implementation (with drag-to-reschedule) lives inline in `_authenticated/calendar.tsx` for the coordinator's own private calendar — out of this feature's scope, not yet given the same treatment. |
| Timezone display (one-off events) | `events.timezone` column + `events_default_timezone()` trigger (migration `20260914061655`), `src/lib/timezone.ts`, `event-modal.tsx`, `events.$id.manage.tsx`, `events.$id.tsx`, every calendar view, `api/embed.$slug.ts` | Every one-off event now carries its own IANA `timezone`, defaulting to the creating coordinator's `coordinator_profiles.timezone` (per-event picker overrides it — a coordinator running an out-of-town event isn't stuck in home-zone). Display always labels the **event's own zone** (`6:00 PM CDT`), never silently converts to the viewer — `/events/$id` adds a secondary "your time" line only when the viewer's browser zone actually differs. Month/Week chips stay in the event's zone with no abbreviation (no room). `datetime-local` inputs are composed with the picked zone via DST-safe wall-time↔instant conversion (`zonedWallTimeToInstant`/`instantToWallTimeInput`), snapping forward and warning on a spring-forward gap. `series.functions.ts`'s recurring-series create form now defaults its own timezone picker to the coordinator's profile zone instead of silently reading the browser's `Intl` zone. **Deliberately out of scope this pass:** the iCal feed (`api/public/ical.$token.ts`) still emits bare UTC instants, no `VTIMEZONE`/`TZID` — correct and unambiguous, just not zone-labeled, and not in spec 03's acceptance criteria; the coordinator's own private calendar (`_authenticated/calendar.tsx`, the same third independent implementation flagged under multi-day rendering above) and the "also happening nearby" cross-promotion widget on `/c/$slug` were not touched. |
| Embeddable calendar + WordPress plugin | `api/embed.$slug.ts`, `wordpress-plugin/` | Scoped styles, tracked sponsor links, view/date params rewritten to the host site. |
| Sponsor ad tracking | `ad-stats.functions.ts`, `api/ad.i.$slotId.ts`, `api/ad.c.$slotId.ts` | Impression pixel (lazy-loaded) + click redirect, bot-filtered. |
| Multi-tenant coordinator model + OAuth sign-in | `auth.tsx` (`signInWithOAuth`), coordinator-scoped RLS throughout | Google + Apple OAuth confirmed live (`auth.tsx:124`). |
| Coordinator ownership self-service (delete calendar, change address, edit/delete own events) | `onboarding.functions.ts`, `events.functions.ts`, `settings.tsx`, `events.$id.manage.tsx` | Gated on ownership, not the platform `admin` role — see commit `8a04b15`. |
| CSV export (RSVP list) | `attendee.functions.ts` (`exportRsvpList`), downloaded from `settings.tsx` | Per-event RSVP list as CSV. **Was incorrectly listed as "still needed" in an earlier pass — it's live.** |
| Stripe billing — **coordinator subscriptions** | `api/stripe.webhook.ts`, `annual-plan.functions.ts` | Real, working integration for the platform charging coordinators their monthly fee. **This is not the same thing as ticket-buyer payment processing** (see "Not built") — don't let "Stripe is live" get read as "payments are live." |
| Per-invitation email delivery tracking | `communications.functions.ts` (`sent_at`, `opened_at`, `clicked_at`, `rsvp_status`) | Live for invitations specifically. See "Partial" for the gap. |
| MCP server (AI-agent tool access) | `src/routes/mcp.ts`, `.lovable/CLAUDE-HANDOFF.md` §1 | 5 tools (`list_events`, `get_event`, `create_event`, `update_event`, `list_venues`), OAuth-protected, RLS-enforced. Not a REST API, but is a live external-integration surface — see "Not built" re: REST API. |
| Private (unlisted) events | `events.visibility` column (migration `20260914070315`), `event-modal.tsx`, `events.$id.manage.tsx`, every listing surface | Per-event `public`/`unlisted` toggle, coordinator-only (never on `/submit-event`). **Unlisted is a listing filter, not an ACL** — RLS still lets anyone SELECT an approved-but-unlisted row by id, same as before this spec; every listing surface (public coordinator page, embed, iCal, platform-wide search/map/category-counts, `/events`, MCP `list_events`) filters `visibility = 'public'` in application code or the RPC itself, while a direct `/events/$id` link (or MCP `get_event` by the owner) still opens it — a quiet "Unlisted event" chip marks it, not a scare banner. Manage page: an "Unlisted" badge, a "Make public"/"Make unlisted" toggle that flips instantly when there are 0 RSVPs and confirms first otherwise (going public always confirms when RSVPs exist; going unlisted always confirms). MCP `get_event` additionally checks ownership before returning an unlisted row, since RLS alone doesn't gate it — "don't leak unlisted events to a generic agent token." |

---

## ⚠️ Partial / needs a caveat

Real code exists, but it doesn't do the whole job the name implies. Don't
mark these fully "Live" or fully "Not built" — say what's actually there.

| Feature | What's actually there | What's missing |
|---|---|---|
| Email reminders + announcements | Invitations really send via `sendPlatformEmails` (`communications.functions.ts:62`). Announcements and reminders only insert `user_notifications` (`:194`, `:229`) — they never call the mailer. A `user_notifications_pending_idx` exists; no worker drains it. Spec: `docs/specs/07-unified-email-logs.md`. | Reminders/announcements are in-app rows, not email. Don't read "invitations send" as "all three types send." |
| Email logs | Per-invitation send/open/click/RSVP tracking is real and surfaced on the event-manage page. | No unified log across invitations + announcements + reminders. Announcements/reminders aren't emailed (see row above). |
| External API access | `/mcp` gives AI agents live, OAuth-protected, RLS-enforced tool access today. | No general-purpose public REST CRUD API. Don't read "MCP exists" as "REST API exists" — they're different integration surfaces for different consumers. |

---

## ❌ Not built

Confirmed absent — no matching code found anywhere in `src/lib`, `src/routes`,
or `src/components` as of the commit above.

- **Timeline view** — not one of the 7 calendar views.
- **Slack / Discord notifications** — the only hits for these strings are a bot-detection regex (filtering link-preview crawlers out of view counts), not outbound messages.
- **Google / Outlook two-way sync** — only one-way iCal subscribe exists (see "Live"). No OAuth-based two-way calendar sync.
- **Speaker-specific workflows** — "speaker" only appears as UI copy on the generic Organizer feature ("Organizers & speakers"). No per-session speaker assignment, speaker bio pages, or schedule-track structure distinct from Organizers.
- **General-purpose REST API** — see "Partial" above re: MCP being a different, already-live surface.
- **Outbound webhooks (general) / Zapier** — no outbound webhook system beyond the inbound Stripe webhook handler.
- **SMS reminders** — no SMS/Twilio integration anywhere.
- **PayPal / Square / tax / invoices / promo codes / cart-of-mixed-events / guest checkout / buyer self-service refunds / per-coordinator Stripe Connect payouts** — explicitly out of paid ticketing v1 (see `docs/specs/01-paid-ticketing.md` §Scope). Stripe Checkout (card payments only, platform account, signed-in buyers, coordinator/auto refunds only) is the whole of what's live.

---

## Revision history

- **2026-09-14 (latest)** — Private (unlisted) events spec 04 implemented (migration `20260914070315_private_events.sql`). Moved "Private events" from Not built → Live. `events.visibility` (`public`/`unlisted`), RLS deliberately left untouched (`status = 'approved' => SELECT` still stands — unlisted is a listing filter, not an ACL, straight from the spec), every listing surface filters it: `fetchEvents` (covers Month/Week/Day/List/Agenda/Summary/Photo, `/c/$slug`, `/events`, the embed), `get_ical_feed_events` and `search_events_nearby` (both `CREATE OR REPLACE`d), `search.functions.ts`'s platform-wide search/category-counts/map-events, the tour page's public "events live, platform-wide" stat, and MCP `list_events`. MCP `get_event` gets an extra ownership check on top of the RLS-permitted row, since RLS alone would let a generic agent token read an unlisted event by UUID. Manage page: Unlisted badge, a toggle that skips the confirm dialog only when there are 0 RSVPs (verified against a real Playwright run, which required fixing an unrelated mock bug along the way — `tests/support/mock-supabase.mjs`'s `event_rsvps` count stub was hardcoded to a fake nonzero total for every event, which would have made the "skip when zero" path untestable and, worse, meant nothing in this suite could ever prove that specific spec 04 UI behavior actually fires). `search_events_nearby`'s own behavior is unverifiable in this sandbox (no PostGIS, same pre-existing gap as its original definition) — documented and tolerated in `tests/db/private-events.py`, not silently skipped.
- **2026-09-14 (earlier)** — Timezone display for one-off events spec 03 implemented (migration `20260914061655_events_timezone.sql`, `src/lib/timezone.ts`). Moved "Timezone handling" from Partial → Live (renamed "Timezone display (one-off events)"). `events.timezone` is a real column now, defaulted via a `BEFORE INSERT` trigger from the coordinator's profile zone (not a static literal — see the migration's own comment on why the column-level `DEFAULT` had to be dropped after the initial backfill, or the trigger's coordinator lookup would never fire for an omitted value). Every display surface labels the event's own zone; `/events/$id` adds a secondary "your time" line only when the viewer is actually elsewhere. `zonedWallTimeToInstant`/`instantToWallTimeInput` (DST-safe, reusing the same `toFloating`/`fromFloating` technique `series.functions.ts` already had for RRULE math — moved into the new shared module so both can use it) replace the old browser-local-only `toLocalInput` helpers in both the create and edit forms. 17 unit checks (`tests/unit/timezone.mjs`) + 9 DB checks (`tests/db/events-timezone.py`) + 10 browser checks (`tests/browser/timezone-display.mjs`) all green, plus every existing suite re-run clean. Deliberately deferred: iCal `VTIMEZONE`/`TZID` (not in spec 03's acceptance criteria), the private coordinator calendar's separate third implementation, and the nearby-events cross-promotion widget's date-only display — see the table row above for specifics.
- **2026-09-14 (earlier)** — Multi-day event rendering spec 02 implemented (commits `f0212f7`, `3c90648`, `ea799bd`, `18e3776`, plus embed work this pass). Moved from Partial → Live. Every public view now shows a multi-day event on every date it occupies, not just its start date. Found mid-implementation: `CalendarViews/WeekView.tsx` (patched first, by analogy with Month/Day/List/Agenda) turned out to be dead code — no route imports it, `src/views/WeekView.tsx` is the real one — caught via the rendered DOM's `data-tsd-source`, not by grep. Also found a third, independent calendar implementation inline in `_authenticated/calendar.tsx` (the coordinator's private calendar, with drag-to-reschedule) that's out of this spec's stated scope. Also resolved a self-contradiction in spec 02's own F2 write-up (stated answer vs. literal recommended rule disagreed on whether a 10pm–1am event spans two days) in favor of the stated answer + acceptance criterion.
- **2026-09-14 (later still)** — Paid ticketing spec 01 implemented (commits `8c86131`, `bd1164a`): moved from Partial → Live in the table above. Real Stripe Checkout, race-safe inventory holds, webhook confirmation discriminated from the subscription handler, coordinator + automatic-on-cancel refunds, check-in now actually gates on `status = 'confirmed'`. Two real bugs found and fixed while building the test coverage (logged in full in `TEAMWORK.md`): the new SQL functions would have been callable by any signed-in user without an explicit `REVOKE ... FROM PUBLIC, anon, authenticated`, and `check_in_ticket` had a latent ambiguous-column bug pre-dating this change. v1 uses the platform's Stripe account for every coordinator, not per-coordinator Connect — flagged as needing explicit sign-off before real (non-test-mode) charges.
- **2026-09-14 (later)** — Grok spec pass against `e7f10bb`. Moved "Email reminders + announcements" from Live → Partial: only invitations call `sendPlatformEmails`; announcements/reminders insert `user_notifications` with no drain worker. Noted public Buy-button is RSVP, not purchase. Specs for all 12 build items landed under `docs/specs/`; mailbox is `TEAMWORK.md` (repo root).
- **2026-09-14** — First verified pass. Corrected several inaccuracies from an
  earlier chat-generated cross-reference: multi-day events and full timezone
  support were incorrectly marked Live (moved to Partial/Not built); CSV
  export was incorrectly marked as still needed (it's Live); "Free ticketing"
  was stated without the paid-ticketing-is-a-stub caveat; "Payment
  processing" needed the subscription-vs-ticket-payment distinction; the 7th
  calendar view was misnamed "Map" instead of "Summary."
