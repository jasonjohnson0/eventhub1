# Embeddable calendars: architecture

Goal: customers embed their calendar on their own website. Everything runs on
the EventHub platform. Sponsor ads render alongside the calendar. The embedded
content is indexable by search engines on the customer's domain. The customer
installs as little as possible.

## The tension, and how it resolves

"Hosted on our platform" and "indexable on the customer's domain" pull against
each other, and two of the obvious approaches cannot deliver both.

An **iframe** is attributed by search engines to the source URL. The SEO value
accrues to EventHub, not to the customer. A **client-side JavaScript widget** is
little better: the content is absent from the HTML the customer's server
returns, so indexing is unreliable, and ad blockers remove roughly a third of
the sponsor impressions the business model depends on.

Content is indexed as part of a page only when it is present in the HTML that
page's server returns. So:

**EventHub serves a pre-rendered HTML fragment. A thin plugin on the customer's
site fetches it server-side, caches it, and prints it into the page.**

That satisfies every requirement at once:

- All rendering, data access and ad selection stay on our servers.
- The customer's site holds no Supabase credentials, no business logic, no admin
  surface. The plugin fetches one URL and caches the response.
- Markup arrives in the customer's HTML, so it is indexed on their domain.
- Ads are server-rendered from the customer's own origin, so ad blockers do not
  strip them and impressions can be counted honestly.

Interactivity degrades gracefully. Month navigation and filters are real links
with query parameters our endpoint honours, so the calendar works with
JavaScript disabled and for crawlers. A small optional script upgrades those
links to in-place updates.

## Two product decisions this depends on

**Canonical URLs.** The same events served on our platform and on many customer
domains is duplicate content, and search engines will pick one winner. This is
fine when each customer embeds their own coordinator's events, since the content
genuinely differs per customer. It breaks if one regional calendar is embedded
by twenty sites. Decide the canonical rule before selling the second embed.

**"Free with sponsors, paid without."** `coordinator_billing_settings` already
models this: `sponsored_enabled` plus `monthly_fee_cents`. That reads as "free
if you allow sponsors, fee if you opt out", which the coordinator controls.
Billing on whether slots actually sold would charge coordinators for our sales
performance. Keep the existing shape.

## Build order

1. **Sponsor creative and its public read path.** Done — see
   `supabase/migrations/20260905120000_sponsor_creatives.sql`.
2. **Render sponsors in EventHub itself**, replacing the hardcoded placeholder,
   so advertisers get what they paid for on our own site first.
3. **The embed endpoint** — server-rendered HTML fragment, cacheable, one per
   calendar, honouring month and filter parameters.
4. **The WordPress plugin** — fetch, cache in a transient, print. Nothing else.
5. **Impression and click counting** that works for anonymous visitors, which
   today's `click_tracking` cannot do (no anon grant; its INSERT policy requires
   `user_id = auth.uid()`).
6. **Billing enforcement** against `coordinator_billing_settings`.

## Known bug blocking step 2

`src/routes/events.$id.tsx:197` selects sold slots with
`status === "sold" || status === "active"`. The `slot_status` enum is
`('available','reserved','paid','expired')`. Neither value exists, so
`activeSponsors` is always empty and a paid sponsorship renders nothing at all,
independently of the missing creative fields. The paid state is `'paid'`.

## A Supabase footgun worth remembering

Supabase ships default privileges granting `anon` SELECT on every new table in
`public`. Omitting a grant therefore does **not** deny access — it leaves anon
holding table-level SELECT with only RLS in the way, one policy edit from a
leak. Tables holding anything commercially sensitive should `REVOKE ALL ... FROM
anon` explicitly, as `sponsor_creatives` does.
