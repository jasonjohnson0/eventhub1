# Spec 05 — Timeline view

Phase 2. Depends on spec 02 occupancy helpers. Do not ship Timeline that still paints only the start date.

## Verified current state (`e7f10bb`)

- Public coordinator views (`c.$slug.tsx:21`): `month | week | day | list | agenda | photo | summary`. No timeline.
- Platform `/events` also has `grid` and `map` (`events.tsx:60`). Map is a separate route, not a 7th public tab. Don't add Timeline by renaming Map.
- List/Agenda are vertical, start-sorted. They don't show duration.
- No Gantt / horizontal-axis component exists.

## 1. Scope

**In**

- An 8th public view tab: **Timeline**.
- Horizontal date axis, one row per event, bar from start to end (multi-day spanning from #2).
- Default grouping: none (flat, sorted by start). Optional group-by: Venue (`FLAG` F1 — include venue grouping as a toggle, default off).
- Works on `/c/$slug` and `/events`. Embed: skip Timeline in v1 (embed currently only month/week/list/agenda).

**Out**

- Drag-to-reschedule, dependency arrows, resource utilization.
- Group by organizer/speaker (that's #6).
- Printing / PDF export.

## 2. User-facing flow

1. Tab bar grows: `… Photo · Summary · Timeline`.
2. Axis: days, default window = current month (same `cursor` as Month). Prev/next month already in the page chrome.
3. Each event is a row. Left label = title (truncate). Bar in the grid = start→end, colored with existing event color. Single-day timed events are a short bar on that day, not a full-day block.
4. Hover: tooltip with title, range, venue, time (event TZ from #3).
5. Click: `/events/$id`.
6. Toggle (once venues exist on the payload): **Group by venue**. Events with no venue sit under "No venue".
7. Empty state: same dashed empty card the other views use.
8. Mobile: horizontal scroll on the axis; row labels sticky left. This is the one view that's allowed to scroll sideways because the axis is the point. Don't also overflow the tab bar.

Why this isn't List/Agenda: duration is visible. A 3-day festival is a wide bar next to a 2-hour talk. That's the whole feature.

## 3. Data model

No new tables. Reuse `occupiesDates` / `timezone` / `venue_id` (already on `events`).

`CalendarEvent` should already gain `timezone` in #3; Timeline also wants `venue_id` + venue name. Today `fetchEvents` does not select `venue_id`. Add it.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Horizontal date-axis vs group-by-venue as the *definition*? | **Horizontal date-axis is the view.** Venue grouping is a toggle, default off. | A venue-grouped list without a date axis is Agenda with extra steps. Multi-day (#2) is the reason Timeline exists. |
| F2 | Embed Timeline? | **Not in v1.** | Embed CSS is constrained (`EMBED_ARCHITECTURE.md`). Ship native first. |

## 5. Acceptance criteria

- [ ] Timeline tab on `/c/$slug` and `/events`.
- [ ] A Fri–Sun event is a bar covering three day columns.
- [ ] A 2-hour Friday event is a short bar on Friday, not a 3-day bar.
- [ ] Clicking a bar opens the event.
- [ ] Mobile: axis scrolls horizontally; labels remain readable.
- [ ] `docs/ROADMAP.md`: Timeline moves Not built → Live.

## Implementation notes for Claude

- New `src/views/TimelineView.tsx` (Photo/Summary already live in `src/views/`). Don't stuff it into `CalendarViews/` unless you want to move all three; match Photo/Summary.
- Add `"timeline"` to `VIEWS` in `c.$slug.tsx` and `events.tsx`. Not to embed `VIEWS`.
- Reuse occupancy helper from #2. If #2 isn't merged yet, Timeline is blocked — don't reimplement start-date-only.
