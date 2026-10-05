# Status reconciliation (read-only, no changes)

## Confirmed
- 1: Feed is in the shared page `src/routes/c.$slug.tsx` (VIEWS line 24, label line 29). It applies to every calendar, and nothing in it is tied to one calendar.
- 2: The cards, the Back/scroll restore, and the 20-per-page loading of the existing set of up to 400 events all match `src/components/social-feed.tsx`.
- 3: The embed feed uses `?p=N` with a "Load more events" link and has no scripts.
- 5: `drizzle/migrations/0003_social_feed_ad_surface.sql` and `supabase/migrations/20261005231000_social_feed_ad_surface.sql` are byte-identical (`cmp` found no difference). 71df0a0 only adds that file and renames a plan archive. 27279bc only edits `.lovable/plan.md`.
- 6: There is no feed on `/events` and no combined feed across calendars.
- 9: ef61b8f (8 files, no migration) targets the user's own workspace, or else their first accepted staff workspace (`event-import.functions.ts`). It has no undo.

## Wrong or outdated
- 5: The statement "the only copy outside the project" is outdated. The supabase/migrations copy now exists in the repo (71df0a0).
- 7: The ad breaks were tested with sample sponsors. The mock returns a slot sponsor ("Riverside Auto", `tests/support/mock-supabase.mjs:772,842`). The test "ad break after the third event" (`coordinator-page.mjs:48`) can only pass if ads render, because an ad break with no ads renders nothing. What is still untested end to end: the top break with 0–2 events, two-advertiser rotation, and campaign (as opposed to slot) ads.
- 8: Partly right. The switch to Feed also rewrites the URL to `?view=feed` (`setSearch({view:"feed"}, true)`, line 188). That makes it sticky on Back and when the link is shared.

## Incomplete
- 4: Whether ads show depends on the calendar's ad settings. Commit 9c9b89f (20:06, migration 0002, AdPolicyCard checkboxes) added the Local and Network-wide switches. Migration 0003 line 124 filters campaigns through `coordinator_effective_ads`. The result:
  - A free calendar always shows at least one of Local or Network-wide, as set.
  - A paid calendar with both switches off shows no network or geographic ads.
  - Campaigns that chose that calendar, and event-slot sponsors, always show.
- 4: Event-slot sponsors come first and take priority over campaigns. The "same priority" rotation only applies within the top group.

## Other commits
- e45b709 "Added background task logging" only changed `.lovable/plan.md` (42 lines). It has no code.
- The commits after ede815f labelled "Changes" are routine edits and were not reviewed one by one.
