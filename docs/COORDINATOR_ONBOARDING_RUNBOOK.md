# Coordinator onboarding runbook

This is an **operator-facing** guide: what to actually do, in order, to take a
brand-new coordinator from "just signed up" to "calendar looks alive." It's
not a feature spec — see `docs/specs/` and `docs/ROADMAP.md` for those.

Nothing in `src/routes/onboarding.tsx` enforces any of this; it's a sequence
a human (you, or whoever is launching a new tenant) runs through by hand.

## 0. Before you start

You need:

- The coordinator's real contact email and a logo (or at least a brand
  color) — don't launch with placeholder branding, it reads as abandoned.
- A short list of real, upcoming events for their community. If you don't
  have 25 yet, see step 3 for where to find them — don't invent events to
  hit a number.

## 1. Account + workspace setup

1. Sign up at `/auth`, choosing **"Run a calendar"** at signup (this is
   what routes a first-time signup into `/onboarding` instead of the
   attendee-facing calendar — see `auth.tsx`/`auth.callback.tsx`).
2. Walk `/onboarding`'s steps: company name, slug, branding (logo, primary
   color, header image), and address/timezone. The slug becomes the
   calendar's URL (`/c/<slug>`) and can't be changed casually later —
   pick the final one now, not a placeholder.
3. Confirm the calendar actually loads at `/c/<slug>` before moving on.
   An incomplete `setup_completed_at` leaves the calendar effectively
   invisible (see `_authenticated/route.tsx`'s `coordinatorState` logic).

## 2. Decide what this calendar is actually for

Write down, in one sentence, the community and geography this calendar
serves (e.g. "Marianna, FL and Jackson County — civic, school and small
business events"). This sentence is what you'll check every one of the
first 25 events against in step 3, and it's what should end up in the
coordinator's `description` field (shown on `/c/<slug>` and in its OG
tags) — don't leave that blank.

## 3. Seed the first 25 events

Real events only — this is the single most important rule. An empty-
looking calendar is recoverable; a calendar full of fake or stale events
is not, once a real visitor notices.

**Where to find 25 real events, fastest first:**

1. The coordinator's own existing channels: their Facebook page/group,
   newsletter, printed flyer board — most organizers already have a list,
   they just haven't put it on a calendar before. Ask for it directly.
2. Local institutions' own event pages: chamber of commerce, library,
   parks & rec, school district, downtown association. These are
   almost always public and almost always under-syndicated.
3. The public submission queue (`/submit-event` on their calendar, or
   `/submit-event?c=<slug>` once they have a slug) — point a few known
   organizers at it directly and approve their submissions from
   `/submissions` once they land, rather than only waiting for it to be
   discovered organically.

**How to actually enter them, fastest first:**

- **One at a time, from the dashboard** (`/dashboard` → the event create
  modal): fine for a handful, slow for 25. Good for the first 3-5 while
  you're still getting branding/categories right.
- **Via the MCP server** (`/mcp`, backed by `src/lib/mcp/tools/create-
  event.ts`): if you're seeding from a list (spreadsheet, scraped page,
  a chat transcript of events someone sent you), an MCP-connected
  assistant can create events directly from that list far faster than
  clicking through the modal 25 times. This is the same `createEvent`
  server function the UI calls — nothing it does is unavailable to the
  UI, it's just much faster for a batch.
- **Via the submission queue**: if organizers are willing to submit their
  own events, this scales past the first 25 without you doing the data
  entry at all. Worth setting up even if you seed the first batch
  yourself.

**Mix to aim for**, not a hard rule: a stale-feeling calendar is usually
one category and one timeframe. Spread across at least 3-4 of the
platform's categories (sports, networking, education, social, fundraiser,
workshop, other), and across the next 60-90 days, not all next week.

**Images**: every event benefits from a header image (`event-modal.tsx`'s
image URL field, or the organizer's own upload on `/submit-event`) — a
calendar of text-only cards reads as unfinished. If you set one, also
fill in the image description field right next to it; it's optional but
takes ten seconds and is the only way a screen-reader user gets more than
the event title.

## 4. Go-live checklist

Before telling the coordinator (or anyone else) the calendar is ready:

- [ ] `/c/<slug>` loads, shows real branding (not the default gradient),
      and has a real `description`.
- [ ] At least 15-25 real, upcoming, correctly-categorized events are
      visible, spread across more than one week and more than one
      category.
- [ ] At least one event has a header image, to confirm image upload
      actually works end-to-end for this tenant.
- [ ] The public submission flow works: submit a throwaway test event
      from an incognito window, confirm it lands in `/submissions`,
      then reject it (don't leave test data in the approved queue).
- [ ] If ticketing is in scope: confirm the coordinator's own Stripe
      account is connected, not left on a platform default.
- [ ] Share the `/c/<slug>` link, the `/submit-event` link (for their
      community to use), and `/organizers` (if they want to refer other
      organizers to the platform).

## 5. First week after launch

- Check `/submissions` daily for the first week — a submission sitting
  unreviewed for days is the fastest way to lose a first-time submitter.
- Check `/admin` (if you have admin access) or ask the coordinator
  whether anyone's reported a broken link, missing image, or wrong
  category — these are cheap to fix early and expensive to fix once
  people have stopped checking.
