# EventHub Calendar for WordPress

Puts a coordinator's calendar on their own website, with the events in the
page's HTML so search engines index them on that domain.

Two pieces:

- **`/api/embed/$slug`** on the EventHub platform — a pre-rendered, cacheable
  HTML fragment.
- **`wordpress-plugin/eventhub-calendar/`** — fetches that fragment server-side,
  caches it, and prints it.

The plugin holds no Supabase credentials, no business logic and no admin surface
beyond one settings field. It fetches one URL and caches the response.

## Why not an iframe or a script tag

Search engines attribute iframed content to the source URL, so the SEO value
would accrue to EventHub rather than to the customer. A client-side widget is
little better: the content is absent from the HTML the customer's server
returns, and ad blockers remove roughly a third of the sponsor impressions the
business model depends on.

Content is indexed as part of a page only when it is in the HTML that page's
server returns. Hence a server-side fetch.

## Install

1. Zip the `eventhub-calendar` folder and upload it under **Plugins → Add New →
   Upload Plugin**, then activate it.
2. Go to **Settings → EventHub Calendar** and set the EventHub URL and, if you
   like, a default calendar slug.
3. Put `[eventhub_calendar]` in a page.

To pin the platform URL so it cannot be changed from the dashboard, add this to
`wp-config.php` instead:

```php
define( 'EVENTHUB_CAL_HOST', 'https://events.yourdomain.com' );
```

## Shortcode

| Example | Renders |
|---|---|
| `[eventhub_calendar]` | The default calendar from settings |
| `[eventhub_calendar slug="riverside"]` | A specific calendar |
| `[eventhub_calendar slug="riverside" view="list"]` | A specific view |
| `[eventhub_calendar slug="riverside" view="month" on="2027-01-01"]` | Anchored to a month |

`view` is one of `month`, `week`, `list`, `agenda`. Anything else falls back to
`month`.

## How navigation works

The fragment's own view and date links are rewritten to point back at the page
they are embedded in, carrying `?ehview=` and `?ehon=`. A visitor pages through
the calendar without ever leaving the site, it works with JavaScript disabled,
and a crawler can walk every month. Only the individual event links lead to
EventHub, where people RSVP and buy tickets.

## Caching

Fragments are cached in a transient for five minutes, matching the `s-maxage`
the endpoint sets. Saving either setting clears the cache.

If the platform is unreachable, someone who can edit posts sees why. A visitor
sees nothing at all — a plumbing error is not their problem.

## What it does not install

No database tables, no cron, no scripts on the front end, no credentials. If you
delete the plugin, the only trace is two rows in `wp_options` and some
transients.

## Verified

`test-wp-plugin.php` runs the shortcode against a stubbed WordPress and a live
embed endpoint: 20 checks covering the rendered fragment, that events are in the
HTML rather than fetched by script, that a hostile event title stays escaped,
the link rewriting in both directions, paging by query string, rejection of a
bogus view and of slugs containing path traversal or a scheme, transient
caching, and both failure paths when the platform is down.

```bash
php test-wp-plugin.php https://events.yourdomain.com
```
