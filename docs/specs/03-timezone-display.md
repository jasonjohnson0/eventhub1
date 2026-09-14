# Spec 03 — Timezone display for one-off events

Phase 1. Recurring series already have a timezone; one-off events don't, and the UI never labels a zone.

Share occupancy/format helpers with spec 02.

## Verified current state (`e7f10bb`)

- `event_series.timezone TEXT NOT NULL DEFAULT 'UTC'` (`20260706034708_…sql:13`). Series create uses the **browser** zone (`event-modal.tsx:223` `Intl.DateTimeFormat().resolvedOptions().timeZone`), not the coordinator profile.
- `coordinator_profiles.timezone TEXT NOT NULL DEFAULT 'America/Chicago'` (`20260801031921_…sql:5`). Exists. Not read when creating a one-off event.
- `events` has **no** `timezone` column (`types.ts` events.Row:942-968).
- `fmtTime` (`queries/events.ts:245-247`):

  ```ts
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  ```

  That's the viewer's browser timezone, no `timeZoneName`. A Jacksonville attendee looking at a Chicago 6pm event sees 7pm (EDT) with no label. That's the bug, not "timestamps are naive" — they are timestamptz.

- No "shown in your local time" copy anywhere.

## 1. Scope

**In**

- `events.timezone` IANA name.
- Default: coordinator profile timezone, overridable per event (picker on create/edit).
- Display: event's own timezone with abbreviation (`6:00 PM CDT`), plus a secondary "your time" line when the viewer's zone differs.
- Series create: default picker to coordinator profile TZ, not silently `Intl` browser TZ (today a coordinator traveling with a laptop would stamp the series in hotel-time).
- Occupancy math in spec 02 uses this column.

**Out**

- Converting stored timestamps to floating local time (keep timestamptz).
- Per-attendee saved timezone profile.
- Automatic "flying to another city" detection.
- Changing RRULE math in `series.functions.ts` beyond using the same default.

## 2. User-facing flow

### Coordinator — create / edit (`event-modal.tsx`, manage page)

1. Timezone field, IANA list (common US zones first: America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Phoenix, Pacific/Honolulu, UTC, then the rest).
2. Prefills from `coordinator_profiles.timezone`. Changing it does **not** rewrite the profile; it's per event.
3. Start/end datetime pickers are **wall times in the chosen zone**. Saving converts to timestamptz. (Today the datetime-local input is interpreted as browser-local, which is the same class of bug.)
4. Recurring: the series timezone field is this same picker. Stop using `Intl` implicitly.

### Public calendar / event page

- Primary time: `6:00 PM – 9:00 PM CDT` (event zone).
- If `Intl` viewer zone ≠ event zone: secondary muted line `9:00 PM – 12:00 AM your time (EDT)`.
- If same zone: no secondary line.
- Month chips stay compact: `6pm` in **event** zone, not viewer zone. Otherwise the chip lies about when it happens on the coordinator's calendar. The secondary line belongs on the event page and on List/Agenda/Day, not on a 1-line month chip.

### Edges

- Unknown/deprecated IANA name: fall back to UTC and still print `UTC`.
- DST spring-forward hole: if the wall time doesn't exist, snap forward 1 hour and warn the coordinator on save.
- iCal feed (`get_ical_feed_events`): include `VTIMEZONE` / `TZID` from `events.timezone` once the column exists. Today's feed emits UTC instants — acceptable until this ships, then emit TZID.

## 3. Data model

```sql
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';

-- Backfill from the owning coordinator, then leave the column independent.
UPDATE public.events e
SET timezone = COALESCE(cp.timezone, 'America/Chicago')
FROM public.coordinator_profiles cp
WHERE cp.coordinator_id = e.coordinator_id;

CREATE OR REPLACE FUNCTION public.events_default_timezone()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.timezone IS NULL OR NEW.timezone = '' THEN
    SELECT timezone INTO NEW.timezone
    FROM public.coordinator_profiles
    WHERE coordinator_id = NEW.coordinator_id;
    IF NEW.timezone IS NULL THEN NEW.timezone := 'America/Chicago'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

Don't add currency-per-event here.

`event_series.timezone` already exists; just fix the create-form default.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Inherit coordinator TZ only, or per-event picker? | **Per-event picker, defaulting to profile TZ.** | Coordinators run out-of-town conferences. A hidden inherit-only field will be wrong the first time someone hosts in another city. Cost of the picker is one select. |
| F2 | Convert UI to viewer TZ, or label the event TZ? | **Always label the event TZ. Add "your time" as secondary when different.** | A community calendar is a *place*. "Saturday 6pm" means 6pm in that town. Silent conversion is how people show up an hour early. The current `fmtTime` already converts silently — that's the bug to undo, not a feature to keep. |
| F3 | Month chip: event zone or viewer zone? | **Event zone, no abbr on the chip** (no room). Full label on event page / list. | |

## 5. Acceptance criteria

- [ ] New one-off event stores `events.timezone` equal to the picker's IANA name, defaulting to `coordinator_profiles.timezone`.
- [ ] Event page shows `6:00 PM CDT` (or whatever the event zone is), not a bare `6:00 PM`.
- [ ] A viewer in a different zone sees a secondary "your time" line; a viewer in the same zone does not.
- [ ] Month/Week chips for a Chicago event do not jump by one hour when the laptop is in Jacksonville.
- [ ] Series create no longer silently uses `Intl` browser TZ as the stored series timezone unless the coordinator picked that.
- [ ] `docs/ROADMAP.md`: timezone display moves Partial → Live. RRULE math remains the existing series path.

## Implementation notes for Claude

- Replace `fmtTime(iso)` with `fmtTime(iso, timezone, { withZone?: boolean })` using `timeZone` + `timeZoneName: 'short'` in `toLocaleTimeString`.
- datetime-local values must be composed with the picked IANA zone (e.g. `Temporal` if you want, or a small helper — `luxon` is not currently a dependency; don't add a library if `Intl` + a 20-line helper will do).
- Public `CalendarEvent` type needs `timezone` plumbed through `fetchEvents` (`queries/events.ts:78` select list).
