# Phase 1b — Sponsorships (scoped, geographic, network-wide)

## Goal
Let a business sponsor one event, one or several calendars, the whole network, or a geographic area (a center ZIP plus a radius, and/or a list of ZIPs). They buy it themselves, pay through Stripe, and see their ad on matching event pages, calendar pages and embeds. View and click counts use the existing ad endpoints.

## Approach in one paragraph
We keep today's per-event slot model (`sponsored_slots` -> `sponsors` -> `sponsor_creatives`) exactly as it is and add a **campaign** layer on top of it. A campaign has a scope, targeting rules, a date window, a creative and a payment. One set of server-side functions works out which campaigns match an event or calendar at render time. Event-slot sponsorships keep working unchanged and appear in the same admin list as "event" campaigns.

## Schema changes (additive only)

New enum `sponsor_scope`: `event`, `calendars`, `network`, `geo`.
New enum `campaign_status`: `draft`, `pending_payment`, `pending_review`, `active`, `paused`, `ended`, `refunded`, `rejected`.

New tables (each with GRANTs, RLS on, and explicit policies):
- `sponsor_campaigns`
  - `id`, `buyer_user_id` (auth user), `scope`, `status`
  - `starts_on date`, `ends_on date`, `tz text` (IANA, validated by the existing timezone trigger pattern)
  - `price_cents`, `currency`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `refunded_at`
  - `contact_name`, `contact_email` (private)
  - `slot_id uuid null` -> `sponsored_slots` (only for `event` scope, which links to the legacy slot)
- `sponsor_campaign_creatives`: one per campaign, same columns and https-only CHECKs as `sponsor_creatives`.
- `sponsor_campaign_calendars (campaign_id, coordinator_id)`: for the `calendars` scope.
- `sponsor_campaign_geo`: `campaign_id`, `center_zip`, `radius_miles` (1–100), `zips text[]`, plus a computed `area geography` (a buffer around the center unioned with the ZIP centroids and their buffers).
- `zip_centroids (zip text pk, lat, lng, geom geography, city, state)`: US ZCTA centroids, seeded once from the Census Gazetteer file. This is public reference data with anon SELECT.
- `sponsor_campaign_stats`: mirrors `sponsor_ad_stats` but keyed on `campaign_id` (`sponsor_ad_stats.slot_id` has a foreign key to slots, so campaign traffic can't go there). Only service_role can write to it.

Policies:
- Buyer: SELECT and UPDATE own campaigns only while they are `draft`, and INSERT with `buyer_user_id = auth.uid()`.
- Admin (`has_role(...,'admin')`): full access.
- Coordinator: SELECT on campaigns that currently target their calendar, through a SECURITY DEFINER view or RPC that projects **no price and no contact columns**.
- Anon: no table access. Only the RPCs below.

New / extended RPCs (SECURITY DEFINER, `search_path = public`, EXECUTE granted to anon and authenticated):
- `get_sponsors_for_event(p_event_id, p_limit)`: combines legacy paid slots (today's `get_public_sponsors`) with active campaigns whose scope matches the event. Returns `ad_key, kind ('slot'|'campaign'), business_name, logo_url, link_url, headline, body` only.
- `get_sponsors_for_calendar(p_coordinator_id, p_limit)`: combines today's `get_public_coordinator_sponsors` with matching campaigns.
- Existing `get_public_sponsors` and `get_public_coordinator_sponsors` stay as they are (they already have callers and tests). The new RPCs call them internally.
- `quote_sponsor_campaign(scope, targeting)`: returns the reach (number of calendars and events in the area) and the price. Server-side, no private data.

## How targeting is resolved at ad-render time
All matching happens in Postgres, inside the RPCs above.

```text
event page  -> get_sponsors_for_event(event)
  exclude immediately if event.visibility <> 'public' AND scope in (network, geo)
  exclude immediately if event.visibility = 'private'  (every scope, no ads at all)
  match if campaign.status='active' AND today (in campaign.tz) between starts_on..ends_on AND:
    event    : campaign.slot_id belongs to this event
    calendars: event.coordinator_id in sponsor_campaign_calendars
    network  : always
    geo      : ST_Intersects(campaign.area, event_locations.geom)
calendar page / embed -> get_sponsors_for_calendar(coordinator)
    calendars: coordinator listed
    network  : always
    geo      : coordinator has >=1 public, approved, upcoming event inside the area
```
- Ordering: event > calendars > geo > network (the most specific first), then by `paid_at`. The server caps the result (see open questions).
- Private events never render the sponsor block. The page component checks this too, in addition to the RPC.
- ZIPs are resolved to coordinates only through `zip_centroids` (server-side). Nominatim is never used for targeting.

## Dates and timezones
Each campaign stores `starts_on`/`ends_on` as calendar dates plus `tz`. The default `tz` is the buyer's browser zone at purchase time. For single-event or single-calendar campaigns it falls back to the target's timezone. A campaign is live from 00:00 on `starts_on` to 23:59:59 on `ends_on` in that zone, computed in SQL with `AT TIME ZONE`.

## Stripe flow
- **Checkout Session** (one-time `payment` mode, inline `price_data`), reusing `getStripe()` in `src/lib/stripe.server.ts`. Checkout handles cards, SCA, receipts and tax-ready fields, which is less code than PaymentIntent plus Elements.
- A server function `createSponsorCheckout(campaignId)` re-quotes the price on the server (the client price is never trusted), sets the campaign to `pending_payment`, and creates the session with `metadata.campaign_id`. It then redirects to Stripe. Success returns to `/sponsor/$id?paid=1`.
- The existing `src/routes/api/stripe.webhook.ts` (signature-verified) gets new handlers:
  - `checkout.session.completed` / `payment_intent.succeeded` -> `paid_at`, status `active` (or `pending_review` if approval is required), and a `billing` row (`status='succeeded'`).
  - `checkout.session.expired` / `payment_intent.payment_failed` -> back to `draft`, `billing` row `failed`, and an email to the buyer.
  - `charge.refunded` -> `refunded_at`, status `refunded`, `billing` updated to `refunded`. The ad stops serving immediately because the RPC only serves `active` campaigns.
- Handlers are idempotent (they key on the session or payment-intent id).
- Admin "Refund" button: calls `stripe.refunds.create` server-side. The webhook then records the refund.

## Routes and components

New:
- `/sponsor` (public landing page): explains the options, links to the sign-up flow, and asks visitors to sign in to buy.
- `/_authenticated/sponsor/new`: wizard with 5 steps: scope -> targeting -> dates -> creative -> review and pay.
  - Targeting step: event picker (public, approved, upcoming events only), multi-select calendar picker, center ZIP + radius slider, ZIP list input, and a live reach/price quote with a Leaflet preview of the area (reusing `map-canvas.tsx`).
  - Creative step: reuses `CreativeForm` from `sponsor-creative-editor.tsx` (extracted so it takes a save callback).
- `/_authenticated/sponsor/$id`: the buyer's campaign page, showing status, dates, creative edit and stats (reuses `sponsor-performance.tsx`).
- `/_authenticated/sponsor`: "My sponsorships" list.
- `src/lib/sponsor-campaigns.functions.ts`: quote, create/update draft, checkout, list mine, admin list/approve/pause/refund, coordinator list.
- Sidebar entry "My sponsorships".

Changed:
- `/admin/sponsorship`: adds a campaigns table (filter by scope/status; approve, pause, refund) next to the existing slot stats and `CloseBillingMonth`. It replaces the "Top sponsors" placeholder with real rankings.
- `events.$id.manage.tsx`: new "Sponsors on this calendar" card for coordinators (read-only, no prices).
- `events.$id.tsx`, `c.$slug.tsx`, `api/embed.$slug.ts`: switch to the new combined RPCs. Ad markup, `rel="sponsored"` and the pixel/click URLs stay the same.
- `ad-tracking.server.ts` and `/api/ad/i|c/$slotId`: accept an ad key (`s_<uuid>` for slots, or `c_<uuid>` for campaigns; a bare uuid is still read as a slot for backward compatibility) and write to the matching stats table. Campaign click redirects look up `link_url` server-side, the same way as today.

## Tests (keep `tests/run.sh` green)
- `tests/db/sponsor-campaigns.py` (following `private-events-access.py`) checks that:
  - anon can't read the campaign tables
  - the RPCs return no price, contact or buyer columns
  - private events get no ads from any scope
  - unlisted events get no network or geo ads
  - geo radius and ZIP-list matching work, including the edge of the radius
  - date windows respect the timezone
  - refunded, paused and expired campaigns drop out
  - legacy slot sponsors still appear
  - the migration is safe to re-run
- The existing DB suites stay unchanged: `coordinator-sponsors.py`, `ad-stats.py`, `billing.py`.
- Unit test for the ad-key parser.
- `tests/support/mock-supabase.mjs`: add the new RPCs. New browser suite `tests/browser/sponsor-wizard.mjs`, and `ad-endpoints.mjs` extended for campaign keys.

## Handoff doc
Rewrite `.lovable/CLAUDE-HANDOFF.md` §0 so it says: the single public origin is https://www.dothantoday.com (apex redirects to www); `sparkle-calendar-co.lovable.app` is the Lovable-hosted address of the same deployment; Vercel is retired; publishing happens from Lovable. The stale Vercel env-var notes are removed. §8 then points at this plan.

## Open questions for Jason
1. **Pricing per scope**: a flat price per scope, or per unit? Suggested defaults: event $25/week, calendar $50/month each, geo priced by the number of calendars reached, network $300/month.
2. **Revenue share**: do coordinators get a cut when a calendar, geo or network campaign runs on their calendar? This changes the `billing` work.
3. **Admin approval** before a campaign goes live, or go live on payment with admins able to pause afterwards?
4. **Max ads per page**: suggested 3 on event pages, 3 on calendar pages, 2 in embeds.
5. **Stripe account**: keep using the platform's own `STRIPE_SECRET_KEY` (as the annual plan does), or switch to Lovable's built-in Stripe payments? The built-in option has to be turned on from the Lovable editor.
6. **Who can buy**: any signed-in user, or only approved sponsor accounts?
7. **Coordinator opt-out**: can a calendar refuse network or geo ads?
