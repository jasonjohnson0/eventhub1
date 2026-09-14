# Spec 04 — Private events

Phase 2. Nothing named "private" exists today.

## Verified current state (`e7f10bb`)

- `events` columns: no `is_private`, no `visibility`, no access token (`types.ts` events.Row:942-968).
- Public read RLS: `status = 'approved'` (`20260703183236_…sql:118`). Anything approved is world-readable.
- Surfaces that list approved events: `fetchEvents` (`queries/events.ts:77`), `/c/$slug`, embed (`api/embed.$slug.ts`), iCal (`get_ical_feed_events` filters `status = 'approved'` only), MCP `list_events`, `/events` platform calendar, search, map.
- `/events/$id` loads by UUID; knowledge of the id is currently enough, and ids are listed everywhere.
- Public submit: `submit-event.tsx` → `event_submissions`. Coordinator reviews. No privacy flag on submit.
- Invitations (`event_invitations`) already exist and email a `/invite/$token` link.

## 1. Scope

**In**

- Event visibility: `public` (default) vs `unlisted`.
- Unlisted events are omitted from every public listing (coordinator page, embed, iCal, search, map, MCP list, platform `/events`).
- Unlisted events remain reachable by:
  - Direct `/events/$id` URL,
  - Invitation link `/invite/$token`,
  - Coordinator manage UI.
- Coordinator-only creation (the create form, not `/submit-event`).
- Toggle public ↔ unlisted after creation, including after RSVPs exist (`FLAG` F3).

**Out**

- Password-gated pages, auth-required viewing, per-person ACL beyond invitations.
- Hiding unlisted events from the owner/staff.
- Private *calendars* (whole-slug gated). This is per-event.
- Changing RLS so anon cannot SELECT an unlisted row **if they know the UUID**. Unlisted means unlisted, not secret. Don't promise security-through-obscurity as ACL (`FLAG` F1).

## 2. User-facing flow

### Coordinator

1. Create/edit: a visibility control. Default **Public**. Option **Unlisted — hidden from your calendar, reachable by link**.
2. Helper copy: "Anyone with the link can view and RSVP. It will not appear on your public calendar, embed, or iCal feed."
3. Manage page: badge `Unlisted`. Actions: Copy link, Invite (existing invitation modal), **Make public**.
4. Making public: immediate; the event appears on the calendar on next fetch. No confirmation beyond a toast if there are 0 RSVPs; **if RSVPs > 0**, confirm: "This event has N RSVPs who treated it as unlisted. Making it public lists it on your calendar. Continue?"
5. Making unlisted after being public: confirm: "It will disappear from your public calendar, embed, and iCal. Direct links still work. Existing RSVPs keep access."

### Attendee

- Public event: unchanged.
- Unlisted, has link: event page renders normally (title, time, RSVP, tickets). No "this is private" scare banner; a quiet "Unlisted event" chip is enough so they don't expect to find it on the calendar later.
- Unlisted, no link, not signed-in as owner: `/events/$id` still 200s if they guess a UUID (`FLAG` F1). We do **not** 404 unlisted-by-id in v1, because invitations and shared links *are* that URL. (Invitation tokens already exist as a share path; the event page itself is the destination.)
- Submit-event flow: **no visibility control**. Public submissions always create public (or "pending review → public") events. Coordinators who want unlisted create them themselves.

### Other surfaces

- Embed, iCal, `/c/$slug`, search, map, MCP `list_events`: `visibility = 'public'` AND `status = 'approved'`.
- MCP `get_event`: allowed if the caller owns it, otherwise only if public. Don't leak unlisted events to a generic agent token.
- Analytics: unlisted events **do** count in the coordinator's own dashboard. They **do not** count in any public totals / platform marketing numbers (`FLAG` F2).

## 3. Data model

```sql
DO $$ BEGIN
  CREATE TYPE public.event_visibility AS ENUM ('public', 'unlisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS visibility public.event_visibility NOT NULL DEFAULT 'public';

CREATE INDEX IF NOT EXISTS events_visibility_idx ON public.events (visibility);
```

RLS: keep "approved ⇒ SELECT" so direct UUID fetch works. Filter listings in **queries**, not by locking the row. Document this: unlisted is not an ACL.

If Claude prefers belt-and-suspenders, a policy of "approved AND (public OR owner/staff OR has invitation)" would 404 strangers on `/events/$id`. That's F1 — Grok recommends **not** doing that in v1 because the public event page has no invitation-token plumbing today and would break copied links.

`get_ical_feed_events`: add `AND e.visibility = 'public'`.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Unlisted-but-linkable, or fully access-gated? | **Unlisted-but-linkable.** Direct UUID URL works. | Matches YouTube unlisted. Access-gating needs auth-or-token on the event page, which invitations only half-cover (email token ≠ URL). Real ACL is a later spec. |
| F2 | Count toward public analytics/totals? | **Coordinator dashboard yes; public/platform totals no.** | |
| F3 | Un-private after RSVPs exist? | **Yes, with a confirm dialog.** | Coordinators outgrow "keep this quiet." Don't trap them. The confirm is the product. |
| F4 | `/submit-event` can mark private? | **No.** Coordinator-only. | Public submitters should not be able to hide events from the calendar owner. |

## 5. Acceptance criteria

- [ ] Unlisted event does not appear on `/c/$slug`, embed, iCal, search, map, MCP `list_events`, or `/events`.
- [ ] Opening `/events/$id` for an unlisted event (copied link) shows the event and allows RSVP.
- [ ] Invitation emails still work.
- [ ] Public submissions cannot create unlisted events.
- [ ] Toggling public ↔ unlisted works after RSVPs, with the confirm copy above.
- [ ] Coordinator analytics still include the event.
- [ ] `docs/ROADMAP.md`: Private events moves Not built → Live, with the explicit "unlisted ≠ ACL" line so the next reader doesn't think it's invite-gated.

## Implementation notes for Claude

- `fetchEvents` needs `.eq("visibility", "public")` (and a coordinator-side fetch that does not).
- Embed SQL / `get_ical_feed_events` / MCP `list_events` all need the same filter.
- Don't name the column `is_private` — `visibility` leaves room for `invite_only` later without a boolean trap.
