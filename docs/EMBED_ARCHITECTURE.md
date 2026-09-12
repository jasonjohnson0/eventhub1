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

1. ~~**Sponsor creative and its public read path.**~~ Done —
   `supabase/migrations/20260905120000_sponsor_creatives.sql`.
2. ~~**Render sponsors in EventHub itself**~~ Done — `src/routes/events.$id.tsx`.
3. ~~**A public page per coordinator**~~ Done — `src/routes/c.$slug.tsx`. This is
   the canonical URL for a calendar, and what the embed mirrors.
4. ~~**Sponsor creative entry UI**~~ Done —
   `src/components/sponsor-creative-editor.tsx`.
5. ~~**The embed endpoint**~~ Done — `src/routes/api/embed.$slug.ts`.
6. ~~**The WordPress plugin**~~ Done — `wordpress-plugin/eventhub-calendar/`.
7. ~~**Impression and click counting** for anonymous visitors~~ Done —
   `supabase/migrations/20260912100000_sponsor_ad_stats.sql`,
   `src/lib/ad-tracking.server.ts`, `src/routes/api/ad.{i,c}.$slotId.ts`.
8. ~~**Billing enforcement**~~ Done —
   `supabase/migrations/20260912110000_billing_enforcement.sql`.

## Counting ads on someone else's website

`click_tracking` could not be reused: it is about events, and its `user_id` is
`NOT NULL` with an INSERT policy of `user_id = auth.uid()`, so it cannot
represent a logged-out visitor — nearly everyone who sees an ad on a customer's
site.

`sponsor_ad_stats` keys on (slot, kind, surface, day, visitor) with a hit
counter, so **unique viewers is a row count and total views is a sum** from one
table, and growth is bounded by unique daily visitors rather than page views.
Both numbers are shown to a coordinator side by side: totals flatter, uniques
are what an advertiser will believe against their own analytics.

Four decisions worth not re-litigating:

- **The pixel counts, not the render.** The fragment is served with
  `s-maxage=300`; counting at render time counts once per cache fill and misses
  everyone the CDN served in between — worst on the calendars that are most
  popular.
- **The pixel is `loading="lazy"`.** An ad nobody scrolled to is not billed as
  one somebody saw. A smaller verifiable number is worth more than a larger
  disputed one.
- **The click destination comes from the slot, never the URL.** A
  `/api/ad/c/<slot>?to=<url>` design is an open redirect wearing our own domain,
  which is precisely what makes one valuable to a phisher.
- **The visitor key rotates daily.** A salted HMAC of address and user agent
  that includes the date: enough to separate two visitors within a day, useless
  for following anyone across days. No cookie, no stored address, nothing
  requiring a consent banner on a customer's site.

Crawlers, prefetches and link unfurlers are excluded, and per-visitor hits are
capped, because numbers a coordinator cannot defend are numbers they cannot
sell against.

## Who pays, and what "enforcement" means

- Having ads *switched on* does not earn the free month — having a sponsor who
  paid does. Otherwise the toggle is just a way to opt out of paying.
- A new coordinator gets a 60-day window first. Selling a first sponsorship
  takes longer than a signup flow.
- **Owing money never switches a calendar off.** These calendars are embedded on
  other people's websites: breaking one punishes the coordinator's visitors and
  their web host's client, neither of whom owe us anything, and it makes the
  product unsafe to embed — which is the whole proposition. Non-payment is
  recorded and made unmissable in the dashboard, not enforced by sabotage.

Assessment only closes months that are already over, and is idempotent on
`(coordinator_id, period_month)`, so a retry, an overlapping run or a double
click cannot bill a month twice.

## The Supabase footgun has a second half

The table half is below. The function half cost a live misconfiguration:

`REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` is **not sufficient**. Supabase's
default privileges grant `EXECUTE` on every new function in `public` to `anon`
and `authenticated` *directly*, not through `PUBLIC`, so that revoke removes a
grant which was never the one standing. On the live database `anon` could
execute `record_ad_event` and `assess_all_coordinator_billing` — anyone could
have inflated an advertiser's numbers or written billing rows for every
coordinator — while a local replay said otherwise, because the test harness
mirrored Supabase's default privileges for tables but not for functions.

Always name the roles: `REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC, anon,
authenticated;` — and assert it with `has_function_privilege`, not by reading
the migration.

## Style isolation, and its limit

The fragment cannot use shadow DOM: the only server-side form is declarative
shadow DOM, and putting the calendar inside one risks the indexability the
endpoint exists for. So it competes on the host's terms — an
`all: revert !important` reset scoped to `.ehx`, and every declaration marked
important, since among important declarations the more specific selector wins
and `.ehx *` outranks a bare `div`.

This was not theoretical. The first version scoped its styles normally and
rendered entirely red inside a theme using `div, a, p { color: red !important }`.

A theme using `!important` at higher specificity than `.ehx` can still
interfere. That is inherent to rendering into markup we do not control.

## URL shape, and why it is not cosmetic

`/c/<slug>` is the URL an organizer prints, mails and hands to a customer, and
the one the embed's "see the full calendar" link points at. It has to be the URL
that actually renders.

It briefly was not. Defaulting the search params in `validateSearch` made the
router rewrite `/c/acme` to `/c/acme?view=month&q=&on=` before it would render,
so the promoted URL answered 307 and one calendar presented as several URLs to a
search engine. Defaults are resolved in the component instead; the params stay
optional; the bare URL stays bare.

Three rules follow, and the route holds to all three:

- **Nothing at its default appears in a generated link.** `view=month`, an empty
  `q`, an empty `on` are dropped. Otherwise one click on "Month" pins `?q=&on=`
  to every URL a visitor copies from then on.
- **Every variant declares a canonical pointing at the bare URL.** Seven views
  times every month an organizer schedules is a large number of URLs showing one
  calendar in different shapes. They should accumulate into one ranking page
  rather than compete. Individual events rank on their own `/events/<id>`.
- **Junk is dropped, not carried.** A shared `?view=bogus` link renders, and the
  first click discards the bogus value instead of threading it through the site.

`siteOrigin()` in `src/lib/site-url.ts` is the one place the absolute origin
comes from. Set `PUBLIC_SITE_URL` on the deployment; without it the canonical
degrades to a relative URL (still correct) and the embed falls back to the host
it was reached on.

## Deploying: push to `main`, and only `main`

The Vercel project is git-connected with `main` as the production branch, so a
push to `main` deploys to production. Pushing the same commit to a second branch
moments later does not: GitHub sends a webhook per ref, Vercel attributes the
build to the branch it saw last, and a commit that reached `main` first can end
up built as a *preview* while production stays on the previous commit. If a
feature branch needs syncing, push it **before** `main`, or promote the preview
in the dashboard afterwards.

## A Supabase footgun worth remembering

Supabase ships default privileges granting `anon` SELECT on every new table in
`public`. Omitting a grant therefore does **not** deny access — it leaves anon
holding table-level SELECT with only RLS in the way, one policy edit from a
leak. Tables holding anything commercially sensitive should `REVOKE ALL ... FROM
anon` explicitly, as `sponsor_creatives` does.
