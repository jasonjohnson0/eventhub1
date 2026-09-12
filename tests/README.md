# Tests

No framework, no watch mode. Two runners, both against real things:

- `tests/db/*.py` boot a throwaway Postgres (via `pgserver`), replay every file
  in `supabase/migrations/` into it, and assert on schema, RLS, grants and the
  billing rules. They re-apply the newest migration a second time, because a
  migration that is only idempotent in its comments breaks the next time
  Lovable replays it.
- `tests/browser/*.mjs` run the real app against `tests/support/mock-supabase.mjs`
  — a stub speaking just enough PostgREST and GoTrue — and drive it with a real
  Chromium, including mounting the embed inside a deliberately hostile host page.

```bash
tests/run.sh            # everything
tests/run.sh db         # schema only, no browser needed
tests/run.sh browser    # pages and endpoints only
```

Prerequisites: `pip install pgserver` for the db suites, `npm i -D playwright-core`
for the browser ones. Each runner skips itself with a message if its dependency
is missing, so a partial environment still runs what it can.

## Why these exist

Every check here was written because something actually broke, usually in a way
reading the code did not reveal:

- The embed rendered **entirely red** inside a theme using
  `div, a, p { color: red !important }`. Style isolation was only ever tested in
  one direction.
- `/c/<slug>` answered **307** on the one URL an organizer hands out, because
  defaulted search params made the router rewrite it first.
- `anon` could execute `record_ad_event` and `assess_all_coordinator_billing`
  **on production** after a `REVOKE ... FROM PUBLIC` that looked correct and was
  not — Supabase grants EXECUTE to `anon` directly, not through `PUBLIC`.
  `tests/support/pg-bootstrap.sql` now mirrors that default so a local replay
  disagrees with the migration the same way production did.
- A `zod` bump to v4 passed under bun and **failed every Vercel deploy**, because
  `@tanstack/zod-adapter` has no v4 release.

The lesson each time was the same: assert against a real Postgres and a real
browser, not against a reading of the diff.
