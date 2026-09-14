# Spec 06 — Speaker workflows

Phase 2. Organizers already exist and are labeled "Organizers & speakers" in the UI. There is no distinct speaker concept.

## Verified current state (`e7f10bb`)

- `organizers`: `name`, `bio`, `photo_url`, `title`, `credentials`, `social_links` jsonb, per `coordinator_id` (`20260801031921_…sql:40-50`).
- `event_organizers`: `(event_id, organizer_id)` unique, `display_order`. No role column.
- Cap: `MAX_ORGANIZERS_PER_EVENT = 5` (`organizers.functions.ts:17`).
- Settings copy: "Manage organizer and speaker profiles" (`coordinator.settings.organizers.tsx:9-11, :25`).
- Public event page lists assigned organizer names via `fetchEvents` enrich (`queries/events.ts:108`).
- No speaker public page route, no sessions table, no tracks.

## 1. Scope

**In**

- A `kind` on the existing organizer entity: `organizer | speaker | both` (default `organizer`).
- Event assignment can tag the role **on that event** (someone can organize event A and speak at event B).
- Public **people** page per coordinator: `/c/$slug/speakers` (and `/c/$slug/organizers` can redirect or share the same page with a filter).
- Public **person** page: `/c/$slug/p/$organizerId` with photo, title, bio, credentials, socials, and upcoming events they're assigned to.
- Event page: split "Organized by" and "Speakers" if both kinds are present; otherwise keep one list.
- Directory filter on the coordinator settings manager.

**Out (v1)**

- Separate `speakers` table.
- Session / track / room schedule (`FLAG` F2).
- Raising the 5-assignment cap (keep 5 unless Jason asks; speakers+organizers share the cap, which is tight — `FLAG` F3).
- Speaker applications, CFP, speaker-only logins.

## 2. User-facing flow

### Coordinator

1. Settings → Organizers & speakers: each profile has Kind (Organizer / Speaker / Both). Existing rows default Organizer.
2. Event modal: the picker shows all profiles. Each selected person can be marked Organizer, Speaker, or Both **for this event** (defaults from profile kind). Still capped (`FLAG` F3).
3. No new "add speaker" product — it's the same manager.

### Public

1. Event page:
   - Organizers block (kind organizer/both on this event).
   - Speakers block (kind speaker/both). Photos + name + title; click through to person page.
2. Person page: bio, credentials, socials, list of upcoming public events for this coordinator they're on. Unlisted events (#4) omitted.
3. Directory: `/c/$slug/speakers` grid of kind speaker/both.

### Edges

- Deleting a profile unassigns them (FK already `ON DELETE CASCADE` on `event_organizers`).
- Kind change on the profile does not rewrite past `event_organizers.role`; event-level role wins.

## 3. Data model

Same entity. Don't create `speakers`.

```sql
DO $$ BEGIN
  CREATE TYPE public.person_kind AS ENUM ('organizer', 'speaker', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS kind public.person_kind NOT NULL DEFAULT 'organizer';

ALTER TABLE public.event_organizers
  ADD COLUMN IF NOT EXISTS role public.person_kind NOT NULL DEFAULT 'organizer';
```

On assign, default `event_organizers.role` from `organizers.kind`.

No sessions table in v1.

## 4. Judgment calls — `FLAG`

| # | Question | Grok's default | Why |
|---|---|---|---|
| F1 | Separate speaker entity? | **No. Same table + kind/role.** | Bios, photos, socials are identical. A second table duplicates coordinators' data entry. Role-on-assignment covers "organizer here, speaker there." |
| F2 | Sessions / tracks in v1? | **No.** | Needs a new `event_sessions` model (title, start/end, room, track, speaker ids) and a schedule UI. That's a festival product. Ship directory + person pages first. Multi-day (#2) remaining one event row is consistent with this. |
| F3 | Shared cap of 5? | **Raise to 12** now that speakers share the row. | 5 organizers was fine; 5 speakers+organizers is not. Soft product call — 12 is arbitrary but usable. |

## 5. Acceptance criteria

- [ ] Coordinator can mark a profile as Speaker and assign them to an event as Speaker without creating a second record type.
- [ ] Event page shows a Speakers block when any assignment role is speaker/both.
- [ ] `/c/$slug/p/$id` shows bio + upcoming public events.
- [ ] Unlisted events do not leak onto the person page.
- [ ] No `speakers` table in migrations.
- [ ] `docs/ROADMAP.md`: Speaker workflows moves Not built → Partial or Live. If F2 stays "no sessions", mark **Partial** ("directory + roles live; sessions/tracks not built") — don't round up.

## Implementation notes for Claude

- `OrganizerManager` gets a kind select.
- Event modal assignment UI needs a per-chip role toggle.
- New routes under `c.$slug` — check that `c.$slug.tsx` is a leaf; you may need a path layout (`c.$slug.index` + `c.$slug.p.$id`) so the coordinator calendar URL stays `/c/$slug`. Don't break existing slugs.
