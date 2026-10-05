# Bulk event import

Coordinators (and accepted workspace staff) can add many events at once at
**`/coordinator/import`** ("Import events" in the Coordinator menu, and the
**Import** button on the Calendar page). Nothing here is specific to any one
organization or website.

## Sources
- **CSV**: any spreadsheet. A template is downloadable
  (`title,start,end,description,location,category,tags,status,visibility`).
  On a column-mapping step the user matches their own headers. Common names
  ("Event Name", "Date", "Start Time", "Venue", "Details") are guessed. One
  combined start column or separate date and time columns both work.
- **iCal**: upload a `.ics` file, or paste a public `https://` / `webcal://`
  link. Links are fetched by a server function (`fetchIcsFromUrl`):
  - only http(s)
  - up to 3 redirects, each hop re-checked
  - 10 s timeout and a 5 MB cap
  - hosts are resolved over DNS-over-HTTPS and rejected if any address is
    private, loopback, link-local or reserved (SSRF guard)

## Mapping rules
- Times without an offset are read in the workspace time zone
  (`coordinator_profiles.timezone`). Values with `Z` or `+hh:mm` are exact.
  `events.timezone` is set to the workspace zone.
- Accepted formats include `2026-10-08 11:00`, `10/8/2026 11:00 AM`,
  `Oct 8, 2026 7pm` and ISO 8601. A date with no time is treated as all-day.
- No end → start + 1 hour (all-day → +1 day).
- `tags`: comma or semicolon separated, max 20.
- `category`: maps to `event_category`. Common synonyms are understood;
  unknown values become `other`.
- `status`: `draft` / `approved`. A per-import default is chosen on screen.
- `visibility`: defaults to `public`.
- `venue_id` is left null and the location text is stored as given.
- iCal fields:
  - SUMMARY/DESCRIPTION/LOCATION/CATEGORIES map to
    title/description/location/tags.
  - DTSTART/DTEND/DURATION respect TZID (IANA, plus common Windows names) and
    VALUE=DATE all-day events.
  - RRULE series are expanded on the series' own wall clock for the next 12
    months, with EXDATE and RECURRENCE-ID honoured. Each date becomes its own
    event, not a linked series.
  - STATUS:CANCELLED events are skipped.

## Saving
- A preview shows every row with errors and warnings. Rows can be unticked,
  and category or status can be set for all rows at once.
- Duplicates are matched by case-insensitive title + exact start instant
  within the workspace, including duplicates inside the same file. The
  choice is **Skip** (default) or **Update existing**.
- Inserts use the signed-in user's own client in batches of 100, so the
  normal events RLS (`is_workspace_member`) applies. If a batch fails, its
  rows are retried one at a time so failures are reported per row.
- Limit: 500 rows per import; files up to 5 MB.
- No schema change was needed. Imports cannot be undone as a batch yet; that
  would need an `import_batch_id` column.

Code: `src/lib/event-import.ts` (pure parsing),
`src/lib/event-import.functions.ts` (server), and
`src/routes/_authenticated/coordinator.import.tsx` (UI).
