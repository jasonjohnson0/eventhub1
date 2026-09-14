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

Last verified: 2026-09-14, against commit `8a04b15`.

---

## ✅ Live

Confirmed working end to end (not just scaffolded) as of the commit above.

| Feature | Where | Notes |
|---|---|---|
| Calendar views: Month, Week, Day, List, Agenda, Photo, Summary | `src/components/CalendarViews/*`, `src/routes/c.$slug.tsx` (`VIEWS` const) | 7 views on the public coordinator page. **Not** "Map" — that's a separate standalone `/map` route, not one of these tabs. |
| Recurring events (RRULE) | `src/lib/series.functions.ts` | Timezone-aware occurrence computation, capped at `MAX_OCCURRENCES`, "this/future/all" delete scoping. |
| Virtual / hybrid event format | `event-modal.tsx`, `events.$id.manage.tsx` (`EventFormatEditor`) | In-person / virtual / hybrid + provider link (Zoom/Meet/YouTube/other). |
| RSVP (going/interested/declined) + waitlist | `events.$id.manage.tsx`, `attendee.functions.ts` | Waitlist auto-promotion on a cancellation. |
| Free ticketing (tiers, QR, check-in) | `monetization.functions.ts`, `ticket-manager.tsx` | Full path works when `price_cents === 0`: purchase auto-confirms, QR generates, desk + mobile check-in scan it. |
| QR check-in, desktop + mobile | `events.$id.checkin.tsx`, `events.$id.checkin-mobile.tsx` | |
| iCal export (one-way) | `distribution.functions.ts`, `api/public/ical.$token.ts` | Per-coordinator feed URL + per-event `.ics` download. One-way subscribe only — see "Not built" for two-way sync. |
| Email reminders + announcements | `communications.functions.ts` | Scheduled reminders, one-off broadcast to RSVP'd attendees, per-send delivery/open/click tracking. |
| Venue management | `venues.functions.ts`, `venue-manager.tsx` | Scoped to the creating coordinator. |
| Cross-coordinator venue autosuggest ("master list") | `venues.functions.ts` (`searchVenuesPublic`), wired into `event-modal.tsx` | No auth required; every coordinator's venues suggest to every other coordinator. |
| Organizer management | `organizers.functions.ts`, `organizer-manager.tsx` | Labelled "Organizers & speakers" in the UI — see "Not built" re: speaker-specific workflows. |
| Embeddable calendar + WordPress plugin | `api/embed.$slug.ts`, `wordpress-plugin/` | Scoped styles, tracked sponsor links, view/date params rewritten to the host site. |
| Sponsor ad tracking | `ad-stats.functions.ts`, `api/ad.i.$slotId.ts`, `api/ad.c.$slotId.ts` | Impression pixel (lazy-loaded) + click redirect, bot-filtered. |
| Multi-tenant coordinator model + OAuth sign-in | `auth.tsx` (`signInWithOAuth`), coordinator-scoped RLS throughout | Google + Apple OAuth confirmed live (`auth.tsx:124`). |
| Coordinator ownership self-service (delete calendar, change address, edit/delete own events) | `onboarding.functions.ts`, `events.functions.ts`, `settings.tsx`, `events.$id.manage.tsx` | Gated on ownership, not the platform `admin` role — see commit `8a04b15`. |
| CSV export (RSVP list) | `attendee.functions.ts` (`exportRsvpList`), downloaded from `settings.tsx` | Per-event RSVP list as CSV. **Was incorrectly listed as "still needed" in an earlier pass — it's live.** |
| Stripe billing — **coordinator subscriptions** | `api/stripe.webhook.ts`, `annual-plan.functions.ts` | Real, working integration for the platform charging coordinators their monthly fee. **This is not the same thing as ticket-buyer payment processing** (see "Not built") — don't let "Stripe is live" get read as "payments are live." |
| Per-invitation email delivery tracking | `communications.functions.ts` (`sent_at`, `opened_at`, `clicked_at`, `rsvp_status`) | Live for invitations specifically. See "Partial" for the gap. |
| MCP server (AI-agent tool access) | `src/routes/mcp.ts`, `.lovable/CLAUDE-HANDOFF.md` §1 | 5 tools (`list_events`, `get_event`, `create_event`, `update_event`, `list_venues`), OAuth-protected, RLS-enforced. Not a REST API, but is a live external-integration surface — see "Not built" re: REST API. |

---

## ⚠️ Partial / needs a caveat

Real code exists, but it doesn't do the whole job the name implies. Don't
mark these fully "Live" or fully "Not built" — say what's actually there.

| Feature | What's actually there | What's missing |
|---|---|---|
| Multi-day events | You can set `start_time`/`end_time` days apart; nothing rejects it. | `MonthView.tsx` buckets an event under its `start_time` date only (`new Date(e.start_time).toDateString()`) — a 3-day event shows once, on day one, not as a spanning bar or repeated across its days. No dedicated multi-day rendering anywhere. |
| Timezone handling | Recurring-series RRULE math is timezone-aware (`series.functions.ts` stores + computes against a `timezone` field). | No per-event timezone display/conversion for one-off events — no "shown in your local time" UI. The earlier "M4" fix addressed one specific late-night-event bug, not a general timezone-conversion feature. |
| Paid ticketing | Full tier/pricing/early-bird schema and "Buy" UI exist (`monetization.functions.ts`, `ticket-manager.tsx`); inventory (`quantity_sold`) really decrements. | `purchaseTicket()` never calls Stripe. It literally returns `"Purchase pending — Stripe charge would happen here"` and marks the purchase confirmed/pending with no money moving. Paid tickets are UI/schema-complete, payment execution is a stub. |
| Email logs | Per-invitation send/open/click/RSVP tracking is real and surfaced on the event-manage page. | No unified log across *all* email types (announcements + reminders aren't tracked the same way invitations are). |
| External API access | `/mcp` gives AI agents live, OAuth-protected, RLS-enforced tool access today. | No general-purpose public REST CRUD API. Don't read "MCP exists" as "REST API exists" — they're different integration surfaces for different consumers. |

---

## ❌ Not built

Confirmed absent — no matching code found anywhere in `src/lib`, `src/routes`,
or `src/components` as of the commit above.

- **Timeline view** — not one of the 7 calendar views.
- **Slack / Discord notifications** — the only hits for these strings are a bot-detection regex (filtering link-preview crawlers out of view counts), not outbound messages.
- **Private events** — no `is_private` field or equivalent anywhere; every event on a coordinator's calendar is public to that calendar's visitors.
- **Google / Outlook two-way sync** — only one-way iCal subscribe exists (see "Live"). No OAuth-based two-way calendar sync.
- **Speaker-specific workflows** — "speaker" only appears as UI copy on the generic Organizer feature ("Organizers & speakers"). No per-session speaker assignment, speaker bio pages, or schedule-track structure distinct from Organizers.
- **General-purpose REST API** — see "Partial" above re: MCP being a different, already-live surface.
- **Outbound webhooks (general) / Zapier** — no outbound webhook system beyond the inbound Stripe webhook handler.
- **SMS reminders** — no SMS/Twilio integration anywhere.
- **Ticket-buyer payment processing (Stripe charge execution, PayPal, Square, refunds, tax)** — see "Partial" above. The *coordinator subscription* Stripe integration is real and live; *attendee ticket payment* is a named stub with zero charge execution.

---

## Revision history

- **2026-09-14** — First verified pass. Corrected several inaccuracies from an
  earlier chat-generated cross-reference: multi-day events and full timezone
  support were incorrectly marked Live (moved to Partial/Not built); CSV
  export was incorrectly marked as still needed (it's Live); "Free ticketing"
  was stated without the paid-ticketing-is-a-stub caveat; "Payment
  processing" needed the subscription-vs-ticket-payment distinction; the 7th
  calendar view was misnamed "Map" instead of "Summary."
