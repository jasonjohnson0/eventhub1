=== EventHub Calendar ===
Contributors: eventhub
Tags: events, calendar, shortcode
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed an EventHub calendar with a shortcode. Fetched server-side and cached, so events are in your page's HTML and search engines can index them.

== Description ==

Puts a coordinator's EventHub calendar on their own website, server-side.

The plugin fetches a pre-rendered HTML fragment from `/api/embed/$slug` on
your EventHub instance, caches it in a transient for five minutes, and
prints it. No iframe, no client-side script, no Supabase credentials, and
no admin surface beyond one settings screen.

= Why not an iframe or a script tag =

Search engines attribute iframed content to the source URL, so the SEO
value accrues to EventHub rather than to your site. A client-side widget
is little better: the content is absent from the HTML your server
returns, and ad blockers remove a meaningful share of sponsor impressions.
Content is indexed as part of a page only when it is in the HTML that
page's server returns — hence a server-side fetch.

= What it does not install =

No database tables, no cron, no scripts on the front end, no
credentials. If you delete the plugin, the only trace is two rows in
`wp_options` and some transients.

== Installation ==

1. Upload the plugin under **Plugins → Add New → Upload Plugin**, then activate it.
2. Go to **Settings → EventHub Calendar** and set the EventHub URL and, if you like, a default calendar slug.
3. Put `[eventhub_calendar]` in a page.

To pin the platform URL so it cannot be changed from the dashboard, add
this to `wp-config.php` instead of setting it on the Settings screen:

`define( 'EVENTHUB_CAL_HOST', 'https://events.yourdomain.com' );`

== Shortcode ==

* `[eventhub_calendar]` — the default calendar from Settings
* `[eventhub_calendar slug="riverside"]` — a specific calendar
* `[eventhub_calendar slug="riverside" view="list"]` — a specific view (`month`, `week`, `list`, `agenda`; anything else falls back to `month`)
* `[eventhub_calendar slug="riverside" view="month" on="2027-01-01"]` — anchored to a specific month

A visitor can page through the calendar (view and date links are rewritten
to stay on your site, carrying `?ehview=` and `?ehon=`) without leaving the
page, and this works with JavaScript disabled. Only the individual event
links lead to EventHub, where people RSVP and buy tickets.

== Frequently Asked Questions ==

= Does this plugin need my Supabase or EventHub login credentials? =

No. It only fetches one public URL (`/api/embed/$slug`) and caches the
response. There is nothing to authenticate.

= What happens if EventHub is unreachable? =

A visitor sees nothing — a plumbing error is not their problem. Anyone who
can edit posts (`edit_posts` capability) sees a short notice explaining
why, so it can get fixed.

= How fresh is the calendar? =

Fragments are cached for five minutes, matching the cache header the
endpoint sets. Saving either setting on the EventHub Calendar settings
screen clears the cache immediately.

= What does uninstalling remove? =

Two options (`eventhub_cal_host`, `eventhub_cal_slug`) and the cached
transients. No custom database tables are created.

== Changelog ==

= 1.0.0 =
* Initial release: `[eventhub_calendar]` shortcode, settings screen, transient caching, link rewriting for in-page navigation.
