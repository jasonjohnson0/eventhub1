# Social feed

The public coordinator calendar supports `?view=feed`. On screens below 768px it becomes the default when the URL does not name a view; larger screens retain the month calendar default.

## Layout and loading

- Upcoming approved, public events are ordered by start time and revealed 20 at a time.
- Each card is a landscape link to the existing event details page. It uses the event image when available and a category fallback otherwise.
- Dates and times are formatted in the event/calendar timezone. Multi-day events show a complete range.
- The browser session stores the loaded count and scroll position for each calendar so Back returns to the same feed location.

## Advertising

The feed uses `get_campaign_sponsors_for_calendar` and the existing tracked click and impression endpoints. It never reads campaign contacts, billing, or private rows.

Eligible campaigns remain ordered by specificity: calendar, geographic, then network. When more campaigns share the highest available priority, their order is rotated per feed load before selecting two. The same selected advertisers repeat after every three events. With zero, one, or two events, one ad break appears above the events. No eligible campaign means no ad break or placeholder.

An impression is requested only when an ad becomes visible, and only once per advertiser per feed load even if that advertiser appears in multiple breaks. Clicks use the existing server-side destination lookup. Both use the `feed` reporting surface.

## Embed behavior

The existing embed is a server-rendered HTML fragment with scoped defensive CSS. It intentionally contains no JavaScript so it remains indexable, works when scripts are blocked, and cannot take over a host page's scrolling.

Feed mode is available at `/api/embed/{slug}?view=feed`. It uses the same cards and ad cadence, but reveals events through 20-item URL pages with a **Load more events** link. Only the first occurrence of each advertiser includes an impression pixel, preventing duplicate counts within one embed page load.

## Limits

- The public page currently receives the calendar's existing server-loaded event set (up to 400) and paginates that set in the browser.
- Fair rotation occurs among campaigns at the highest available specificity; lower-priority campaigns do not displace a more specific eligible campaign.