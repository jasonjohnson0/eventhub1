# Spec 02 — Multi-day event rendering

Phase 1. Data already allows it; views don't paint it.

Share date-occupancy helpers with spec 03 (timezone). If you touch `fmtTime` / day-bucketing, do both.

## Verified current state (`e7f10bb`)

- `events.start_time` / `end_time` are `TIMESTAMPTZ` with `CHECK (end_time > start_time)`. Nothing rejects a range of several days.
- Fetching is already span-aware: `fetchEvents` uses `end_time >= from` and `start_time <= to` (`src/queries/events.ts:83-84`). A 3-day festival starting Monday is returned when you're looking at Wednesday.
- Rendering is start-date only:
  - `MonthView.tsx:16` `new Date(e.start_time).toDateString()`
  - `WeekView.tsx:19-21` same, plus hour-of-start
  - `DayView.tsx:14` `sameDay(start_time, cursor)`
  - `AgendaView.tsx:38` groups by start date
  - `ListView.tsx` one row, start date only
  - `PhotoView.tsx` / `SummaryView.tsx` one card each, start date
- RSVP, tickets, waitlist, check-in are all keyed by `event_id` — one row for the whole range. No session/day table.
- Public views: `c.$slug.tsx:21` Month, Week, Day, List, Agenda, Photo, Summary.

## 1. Scope

**In**

- Occupancy helper: which local calendar dates an event paints, given its start/end (and, once #3 lands, its timezone).
- Month + Week: spanning bar (typical calendar app).
- Day: event appears on every occupied day; timed bar uses actual start/end clipped to that day.
- List / Agenda / Summary: one row, date range shown (`Fri 3 – Sun 5` or `Fri 3, 6pm – Sun 5, 2pm`).
- Photo: one card; caption/date line shows the range.
- Embed views that reuse Month/Week/List/Agenda (`api/embed.$slug.ts` currently month/week/list/agenda).
- RSVP / ticket / check-in remain **once per event row**.

**Out**

- Per-day sessions / per-day tickets / per-day RSVPs (`FLAG` F1).
- Drag-to-resize bars, resource lanes (that's #5 Timeline).
- Changing how recurring series materialize (already one `events` row per occurrence).

## 2. User-facing flow

A coordinator sets start Friday 6:00 PM, end Sunday 2:00 PM. Today that is legal and already saved.

After this ships:

- **Month:** a bar starts Friday, continues Saturday, ends Sunday. Same event id; clicking any segment opens `/events/$id`. Continuation days can hide the title if the bar is in-progress from the previous cell (Google Calendar style), but keep a title on the start cell.
- **Week:** same spanning bar across day columns, positioned by hours on the start/end days and full-height (or an all-day lane) on middle days. Middle days of a multi-day event go in an **all-day / spanning row** at the top of the week grid so they don't sit at "12am" just because we don't have a start hour that day. Timed-only single-day events stay in hour cells.
- **Day (middle day):** the event is listed, labeled `Day 2 of 3 · all day` (or the clipped hours if it has a start/end that day).
- **List / Agenda / Summary:** one entry, not three. Date text is the range. Do not duplicate the event under Saturday and Sunday.
- **Photo:** one tile. Date overlay is the range.

**Overnight single-day** (starts 10pm, ends 1am): this is **not** multi-day for occupancy if we use the exclusive-end rule below — it paints the start date only, which matches how people read "Friday night show." `FLAG` F2.

**Edges**

- Event longer than the visible month: bar clips at the grid edge; event is still in `fetchEvents` because of the end_time filter.
- 40-day event: still one row, spanning bar across however many cells are on screen. Don't explode into 40 chips in Month (that's the current bug's inverse).
- Recurring weekly 2-day event: each occurrence is already its own `events` row (`series_id` set). Paint each occurrence independently.

## 3. Data model

**No new tables.** One `events` row for the date range is sufficient for v1 (`FLAG` F1).

Add a shared helper (not a column):

```ts
/** Dates this event occupies, in the event timezone (fallback: coordinator TZ, then UTC).
 *  End is exclusive if the local time is 00:00:00, otherwise the end date is included
 *  when any minutes remain on that date. */
function occupiesDates(event: { start_time: string; end_time: string; timezone?: string }): Date[]
function occupiesDay(event, day: Date): boolean
function isMultiDay(event): boolean  // occupiesDates.length > 1
```

Put it next to `sameDay` / `fmtTime` in `src/queries/events.ts` (or `src/lib/event-span.ts`) and use it from every view, including embed.

Do not add `is_multi_day` as a stored column — derive it.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | One event row vs per-day sessions? | **Keep one row.** RSVP/ticket/check-in apply to the whole run. | Matches today's schema. Per-day sessions is a festival product (tracks, day tickets) and collides with #6 speakers. Don't smuggle it in as a rendering fix. |
| F2 | Does a 10pm–1am event paint two days? | **No.** Occupies the start date only unless the end local date is after the start local date **and** (end is not exclusive midnight of next day with duration < 24h overnight). Practical rule: `occupiesDates.length > 1` only when the local calendar dates differ **and** duration ≥ 12 hours, **or** the end local date is ≥ 2 days after start. Simpler alternative if Claude prefers: **any** local-date difference paints both days. **Pick the simple one if the 12h heuristic feels cute: paint every local date from start date through end date, but if end local time is 00:00, exclude the end date.** That's the recommended rule. |
| F3 | List/Agenda: repeat per day or one row? | **One row with a range.** | Repeating a 3-day festival three times in Agenda is noisy and implies per-day RSVP, which we don't have. Timeline (#5) is the place to see duration. |

## 5. Acceptance criteria

- [ ] A Fri 6pm – Sun 2pm event is visible on Fri, Sat, and Sun in Month and Week as a connected bar, not three unrelated chips, and not only Friday.
- [ ] Day view on Saturday shows it.
- [ ] List / Agenda / Summary / Photo show it **once**, with a range label.
- [ ] Overnight 10pm–1am event does **not** produce a Saturday spanning bar under the recommended exclusive-end rule.
- [ ] Clicking any segment navigates to the same `/events/$id`.
- [ ] RSVP / buy / check-in still happen once; no per-day UI appears.
- [ ] Embed month/week/list/agenda match the public calendar.
- [ ] `docs/ROADMAP.md`: Multi-day rendering moves Partial → Live, with "per-day sessions = not built" still explicit.

## Implementation notes for Claude

- Month cells today cap at 3 chips (`MonthView.tsx:51-56`). Spanning bars need a layout pass (row assignment so two overlapping multi-day events don't collide). A simple greedy pack is enough; don't pull in FullCalendar.
- Week hour-grid is the wrong place for middle days — add a spanning lane above the hours.
- Tests: a unit file for `occupiesDates` covering overnight, exact-midnight end, 3-day, DST if timezone is present.
