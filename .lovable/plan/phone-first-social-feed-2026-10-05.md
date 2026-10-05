# Phone-first social feed

## Goal
Add a shareable `?view=feed` experience to every public coordinator calendar, with mobile-first event cards, infinite loading, existing event details, and the current sponsorship system woven into the feed.

## Public calendar
- Add `feed` to the public calendar’s validated view options and view switcher.
- Keep the existing calendar as the default at 768px and above; show Feed by default below 768px when no explicit view is in the URL.
- Build a focused feed component with 20-event pages, an intersection observer, loading skeletons, and a stable empty state.
- Query only that coordinator’s approved, public, not-ended events in start-time order. Reuse existing image enrichment and event detail links.
- Use 16:9 landscape cards with lazy images, a strong contrast overlay, branded/category fallbacks, a small category label, a three-line title, and calendar-timezone date/range formatting.
- Preserve both loaded-page count and scroll position per calendar when visitors open an event and return.
- Center the column with phone-edge gutters and a sensible landscape/tablet/desktop maximum width; honor reduced-motion preferences.

## Sponsor delivery and tracking
- Reuse `get_campaign_sponsors_for_calendar` and the existing `/api/ad/i/*` and `/api/ad/c/*` endpoints. No advertiser contacts, billing fields, or direct campaign-table reads reach the browser.
- Load the eligible campaigns in the database’s existing specificity order. Select two fairly from candidates at the same priority using a per-feed-load rotation; higher-specificity campaigns remain ahead of lower-specificity ones.
- Render the same selected advertiser pair after events 3, 6, 9, and so on. With 0–2 events, render one break at the top. Render nothing when no campaign qualifies.
- Observe ad cards in the browser and request each advertiser’s impression pixel once per feed load, even when the same advertiser appears in later breaks. Keep clicks on the existing protected redirect and add `rel="sponsored noopener noreferrer"`.
- Add a distinct `feed` tracking surface. This requires the one migration below because both stats tables and both recording functions currently reject any surface except `site` or `embed`.

## Embedded calendar
- Add Feed to the existing server-rendered, host-style-isolated embed fragment.
- Use the same event/ad card rhythm and the same campaign eligibility. Keep all values escaped and all URLs validated.
- The embed is intentionally static, cacheable HTML with no JavaScript. It will therefore use 20-item URL pagination with a clear “Load more” link rather than injecting an infinite-scroll script into third-party sites. This preserves its current no-JavaScript, indexable, safely scoped behavior and avoids taking over the host page’s scroll.
- Emit one lazy impression pixel per selected advertiser in the first rendered ad break only, preventing repeat counts inside one embed load.

## Database migration
Create `supabase/migrations/20261005231000_social_feed_ad_surface.sql` to:
- allow `feed` in `sponsor_ad_stats.surface` and `sponsor_campaign_stats.surface` checks;
- allow `feed` in `record_ad_event` and `record_campaign_ad_event` validation;
- widen the existing public campaign-selection function’s safe result cap so the feed can rotate fairly across all currently eligible campaigns while preserving the existing specificity ordering;
- retain the existing grants and security-definer protections exactly.

No tables, columns, RLS policies, or public data access will be added or weakened.

## Tests and documentation
- Extend calendar and embed browser coverage for `view=feed`, public/upcoming filtering, card links, image/fallback rendering, ad cadence, no-placeholder behavior, tracked links, one impression pixel per advertiser, and embed pagination/escaping.
- Add focused feed fixtures for 0, 2, and 7+ upcoming events without changing production data.
- Verify the live preview at approximately 390×844 and 844×390 for all three event-count cases, plus a centered wider layout. Do not trigger tracking writes during browser checks; intercept pixels/clicks where needed.
- Add `docs/SOCIAL_FEED.md` describing layout, selection/rotation, placement, tracking, embed behavior, the static-embed pagination decision, and known limits.
- Record the feed/embed structural decisions in `AGENTS.md`.
