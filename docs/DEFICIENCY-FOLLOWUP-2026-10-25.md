# EventHub deficiency follow-up for Claude

Date: October 25, 2026. Public origin: https://dothantoday.com.

## Executive status

The reported failures were investigated and repaired. The full mock-browser suite and full unit suite pass. Real signed-in preview checks confirmed dashboard panels, pending-review count, and navigation loading states; real public preview checks confirmed ZIP 32446 returns five events and mouse-only submission date/time selection. Latest preview build reports **build OK**.

Nothing was published in this follow-up. No new migrations, schema changes, billing changes, account changes, live submissions, RSVP changes, or ad-tracking writes were made. Prior-turn location backfill is described separately below.

## Original deficiency list — disposition

1. **Sign-in aliases:** `/sign-in`, `/signin`, `/login` redirect to `/auth`; existing aliases were not missing from source. Preview redirect and browser checks passed. A stale published version may still need republishing; production was not deployed here.
2. **Location defaults and fetching:** prior work moved public initial reads to loader/query caching, added an IP-location hint with no-filter fallback, and rejected a 0,0 location default. This follow-up removed coordinate clearing paths that could accidentally reintroduce zero coordinates. Hosted IP headers cannot be proven from localhost.
3. **Empty markets:** existing ladder widens to 50 then 100 miles, then nationwide. Widened results show distances and an explanation. This follow-up corrected the location summary to use the effective radius/count and added an explicit submit-event action alongside widened results.
4. **Dashboard freshness and navigation:** shared, user-scoped query options now prefetch billing, sponsor statistics, and pending reviews; stale five-minute windows were removed. Returning to the page revalidates. Review success invalidates pending reviews and public event queries. Errors in the reminder are visible rather than silently swallowed. The previous page is hidden during path changes, with an accessible loading state; its mounted state is preserved so search-only updates do not close the create-event dialog.
5. **Reset filters:** prior work clears location, category and query together. No needless routing rewrite in this follow-up.
6. **Counts:** public views share one filtered upcoming event set; location summary includes all displayed events rather than only pins. Dashboard category counts and its separate map fetch now exclude ended events and scope to the configured deployment community. Sidebar is explicitly labeled “Upcoming community events.” It is not a ZIP-filtered public sidebar; marker counts may differ when a displayed event has no pin. Do not claim every navigation surface shares a ZIP filter.
7. **Unpinned events:** retained in location results; approval attempts best-effort geocoding. A geocoder miss does not block publication. Venue links/location text are not fabricated.
8. **Radius:** fixed-radius dead end replaced by widening as described above.
9. **Timezones:** existing event/workspace timezone handling preserved. Public event timezone browser suite and timezone/DST unit tests pass. This follow-up caches timezone validation and date/time formatters, removing thousands of expensive repeated formatter constructions without changing formatting rules.
10. **Forgot password:** link exists and was verified. No real password reset email was sent; actual mailbox delivery remains unverified.
11. **Mouse-only date/time:** submission retains native typed inputs and adds in-page calendar/hour/minute pickers using existing controls. Mouse selection writes the date and `19:30`, tested without typing. This avoids browser-owned picker overlays. Permanent browser checks cover both selections and mocked submission readback.
12. **Unsupported save copy:** prior work removed the claim, rather than creating a new bookmark feature.
13. **Community picker:** bare public submission on this deployment resolves Dothan Weekend Events; verified in the real preview. Explicit coordinator-scoped shared links remain supported. The isolated network test deliberately disables the deployment slug and verifies the community picker and submission ownership there.
14. **Town ambiguity:** ZIP remains primary; town-only “Springfield” prompts for state. “Springfield, IL,” a five-digit ZIP, and full street addresses are accepted. A focused unit test asserts those rules.
15. **Moderation:** dashboard reminder shows **37 pending submissions** in the real account at verification time. No automatic approvals or rejections were made. The original report’s 18-count is historical, not current.

## Prior-turn live data correction (not repeated here)

Five existing approved/public Marianna events received `event_locations` rows: Ribbon Cutting – Southern Roots Psychiatry; two First Friday events; Holiday on the Half Shell; Lunch & Learn – Fraud Protection. Three addresses resolved exactly. The Carpenters Table resolved approximately along US-90; Lafayette Landing resolved approximately to Marianna city center. Prior preview check showed five map markers; current ZIP 32446 check shows all five upcoming events. Approximate pins should be reviewed by the coordinator. No events were created or deleted in that backfill.

## Why earlier tests failed

- Mock-browser auth was blocked by the production content-security policy, not missing user sessions. The test runner now isolates environment settings and dependency cache and selects installed Chromium automatically. A fixed loopback connection exception exists **only** in local development test mode; production policy is unchanged.
- Event-detail and timezone tests used obsolete short IDs (`e1`) where public metadata validates UUIDs. They now use the existing UUID fixture, with the same timezone and distinctive RSVP aggregate.
- Sponsor-dialog test had no real slot fixture; an available slot was added to the mock only. No live sponsor inventory was added.
- Header-image test reread browser-cached public responses after mutating its fixture. Browser cache is disabled for that mutation/readback check, and the assertion checks the actual background layer.
- Submission test used the obsolete label “End time” instead of “End time (optional).” Updated, with mouse-only picker tests added.
- Timeline week zoom measured a correctly virtualized-out bar. Test now scrolls it into view before measuring its unchanged axis geometry.
- Timeline performance failures were real repeated formatter costs. Caching fixes now pass both the 2,000-event layout timing test and browser scroll long-task limits. Thresholds were **not** raised or disabled.

## Main changed files in this follow-up

- Dashboard: `src/queries/dashboard.ts`, `src/components/billing-status-card.tsx`, `src/components/sponsor-performance.tsx`, `src/components/pending-submissions-reminder.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/submissions.tsx`.
- Navigation: `src/components/navigation-pending.tsx`, `src/router.tsx`, `src/routes/_authenticated/route.tsx`.
- Location and counts: `src/lib/location-search.ts`, `src/components/geo-filter.tsx`, `src/routes/events.tsx`, `src/lib/search.functions.ts`, `src/components/app-sidebar.tsx`.
- Submission: `src/components/submission-date-time.tsx`, `src/routes/submit-event.tsx`.
- Performance: `src/lib/timezone.ts`, `src/lib/event-dates.ts`.
- Test isolation: `tests/run.sh`, `vite.config.ts`, `src/server.ts`; fixtures and affected browser tests updated.
- Documentation: `AGENTS.md`, `roadmap.md`, this report. Metadata improved on touched dashboard, index, auth and events routes; this was not a site-wide SEO audit.

## Verification and limitations

- **Pass:** full `bash tests/run.sh browser`, twice after performance corrections; final run also includes mouse-only submission checks.
- **Pass:** full `bash tests/run.sh unit`; no performance threshold weakening.
- **Pass:** build log's latest entry; signed-in real-account preview dashboard and navigation; public ZIP 32446 and state-ambiguity prompt; mouse-only date/time; no page errors in final live scripts.
- Mock suites write only mock data. Live preview scripts did not submit, approve, pay, RSVP, or track ad actions.
- Database suites were not run: embedded `pgserver` is unavailable. Previous skip output is **not** a database-test pass. No migration was introduced here.
- Still unverified: hosted IP geolocation, real password reset mailbox delivery, final published deployment behavior, and exact-address accuracy for the two approximate pins.
- Navigation is no longer misleading but is not instantaneous: authentication and data round trips still take time. A cold development dashboard check took approximately six seconds. Do not translate this into a production speed benchmark.
- Local test ZIP `99999` did not produce the expected lookup-error message; geocoder result/behavior for nonexistent ZIPs was not established. Successful 32446 lookup and town disambiguation are verified.

## Owner follow-through

Review the pending submissions, confirm the two approximate venue pins, and publish when ready. No SQL file needs applying for this follow-up. Publication was deliberately not performed without an explicit request.