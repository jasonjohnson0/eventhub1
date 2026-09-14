# Spec 11 — Google / Outlook calendar sync

Phase 4. Highest OAuth/compliance cost. Spec this as **push-only** unless Jason overrides.

## Verified current state (`e7f10bb`)

- One-way iCal: `coordinator_ical_feeds.feed_token` + `get_ical_feed_events` + per-event `.ics` download (`distribution.functions.ts`, `api/public/ical.$token.ts`).
- No Google Calendar API, no Microsoft Graph, no OAuth tokens stored, no `calendar_id` map.
- Events are timestamptz; timezone column arrives in #3.

## 1. Scope

**In (v1) — EventHub → Google/Outlook push**

- Coordinator connects Google Calendar and/or Microsoft 365.
- EventHub creates/updates/deletes a corresponding event on a calendar they pick.
- Mapping table so edits in EventHub upsert the same remote event.
- Disconnect revokes tokens and stops pushing. Remote copies stay unless they tick "also delete remote copies."
- iCal feed remains. This does not replace it (Apple Calendar users still subscribe).

**Out (v1)**

- True two-way: edits in Google/Outlook writing back to EventHub (`FLAG` F1).
- Importing an existing Google calendar into EventHub.
- Attendee-level "add to my Google" OAuth (they already have `.ics` + `google.com/calendar/render?…` style links if you want those later).
- Free/busy across coordinators.

## 2. User-facing flow

Settings → **Calendar sync**:

1. Connect Google → OAuth consent (calendar.events scope, not full mail). Pick a target calendar (primary default).
2. Connect Microsoft → Graph `Calendars.ReadWrite`. Pick a calendar.
3. "Push existing events now" (approved + public; skip unlisted unless they tick include unlisted).
4. Status: last successful push, last error.
5. Disconnect.

After connect, every event create/update/cancel for that coordinator upserts remote. Failures retry (same backoff spirit as #10) and surface on this settings card — don't toast the coordinator during event save.

### Edges

- Token expired: mark connection `needs_reauth`, stop trying, banner on settings.
- Remote event deleted by the coordinator in Google: next EventHub update recreates it (push-only). Don't treat that as "they meant to delete it in EventHub."
- Recurring series: push each materialized `events` row, not the RRULE, in v1. Simpler, matches our exception model (`is_exception`).
- Unlisted events: not pushed by default.

## 3. Data model

```sql
CREATE TABLE public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
  account_email TEXT,
  calendar_id TEXT NOT NULL,
  -- tokens encrypted at rest (refresh + access + expiry)
  token_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reauth','revoked')),
  last_push_at TIMESTAMPTZ,
  last_error TEXT,
  include_unlisted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (coordinator_id, provider)
);

CREATE TABLE public.calendar_sync_map (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  remote_event_id TEXT NOT NULL,
  last_hash TEXT,                  -- skip no-op pushes
  PRIMARY KEY (event_id, connection_id)
);
```

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | True two-way vs push-only? | **Push-only (EventHub is source of truth).** | Two-way needs conflict resolution (last-write-wins? EventHub wins? split fields?). Google edits would also bypass RLS, RSVP capacity, ticket inventory, moderation. That's a different product. iCal already covers "see it in my calendar." Push makes it native and updates in place. If Jason wants true two-way, spec conflict rules before anyone writes Graph/Google webhooks. |
| F2 | Conflict rule if two-way is forced? | EventHub wins on title/time/location; ignore remote attendee lists (EventHub RSVPs are canonical). | Only relevant if F1 is overridden. |

## 5. Acceptance criteria

- [ ] Connecting Google and creating an EventHub event creates a Google event with the same title/time/location.
- [ ] Editing in EventHub updates that Google event, not a duplicate.
- [ ] Cancelling in EventHub cancels/deletes the Google event.
- [ ] iCal subscribe still works.
- [ ] Disconnect stops pushes; tokens removed.
- [ ] `docs/ROADMAP.md`: rename the line. "Google/Outlook two-way sync" should become **"Google/Outlook push sync = Live; two-way writeback = Not built"** so nobody reads push as two-way.

## Implementation notes for Claude

- Don't start this before #3 timezone — remote events need a TZID.
- OAuth client IDs are platform secrets (`GOOGLE_CALENDAR_CLIENT_ID` etc.), not per-coordinator.
- Never put refresh tokens in `VITE_` or client bundles.
