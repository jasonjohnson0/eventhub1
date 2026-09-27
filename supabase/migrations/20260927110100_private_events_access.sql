-- Gap closure, phase 3 (2 of 2): private events as a real security boundary.
--
-- `private` (added in 20260927110000) is enforced by row-level security, not
-- by hiding UI: a private event's row -- and, through the EXISTS-on-events
-- policies every child table already uses, its details, location, photos,
-- tickets, organizers and custom fields -- is readable only by
--   * the coordinator's workspace (existing "Workspace reads own events"),
--   * admins (existing "Admins manage events"),
--   * a signed-in guest whose invite for that event is ACCEPTED.
-- Anonymous visitors, other organizations' users, and invited-but-not-yet-
-- accepted guests get no row at all.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Invites / access requests
-- ---------------------------------------------------------------------------
-- One table for both directions, since both end in the same state (an
-- accepted guest):
--   pending   -- coordinator invited this email; not yet accepted
--   requested -- a signed-in user asked for access from the gated page
--   accepted  -- grants read access (user_id is then always set)
--   declined  -- guest declined, or coordinator declined a request
--   revoked   -- coordinator withdrew it
-- Separate from event_invitations (the RSVP/marketing invite from Phase 2d):
-- that table is RSVP-shaped (going/interested), grants anon UPDATE for open
-- tracking pixels, and stores tokens in plaintext -- none of which is right
-- for an access-control credential.
DO $$ BEGIN
  CREATE TYPE public.event_invite_status AS ENUM ('pending', 'requested', 'accepted', 'declined', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Lowercased address the invite was sent to (or the requester's address).
  email TEXT,
  -- The account that accepted / requested. Set on accept, never before for
  -- an emailed invite, so a forwarded link can't be claimed by a stranger:
  -- acceptance also requires the signed-in account's email to match.
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SHA-256 (hex) of the bearer token in the invite link. The token itself
  -- is never stored, so a database read can't be replayed as an invite.
  -- NULL for access requests (they have no link).
  token_hash TEXT UNIQUE,
  status public.event_invite_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT CHECK (message IS NULL OR length(message) <= 2000),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_invites_who CHECK (email IS NOT NULL OR user_id IS NOT NULL),
  CONSTRAINT event_invites_email_lower CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT event_invites_accepted_has_user CHECK (status <> 'accepted' OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS event_invites_event_email_uidx
  ON public.event_invites (event_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_invites_event_user_uidx
  ON public.event_invites (event_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_invites_event_idx ON public.event_invites (event_id);
-- The RLS helper below looks invites up by (user_id, event_id) on every read
-- of a private event.
CREATE INDEX IF NOT EXISTS event_invites_accepted_idx
  ON public.event_invites (user_id, event_id) WHERE status = 'accepted';

DROP TRIGGER IF EXISTS event_invites_updated_at ON public.event_invites;
CREATE TRIGGER event_invites_updated_at
  BEFORE UPDATE ON public.event_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

-- No anon access at all. Guests only READ their own rows; every guest-side
-- write (accept, decline, request) goes through a server function that
-- verifies the token/identity and writes with the service role.
REVOKE ALL ON public.event_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_invites TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_invites TO authenticated;
GRANT ALL ON public.event_invites TO service_role;

DROP POLICY IF EXISTS "Workspace manages invites for own events" ON public.event_invites;
CREATE POLICY "Workspace manages invites for own events"
  ON public.event_invites FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_invites.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_invites.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ));

DROP POLICY IF EXISTS "Admins manage invites" ON public.event_invites;
CREATE POLICY "Admins manage invites"
  ON public.event_invites FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Guests read own invites" ON public.event_invites;
CREATE POLICY "Guests read own invites"
  ON public.event_invites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The access check used by the events policy
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the events policy can consult event_invites without
-- event_invites' own policy (which reads events) re-entering events' policy
-- -- mutually-referencing policies are an infinite-recursion error in
-- Postgres. Reads nothing but an existence bit for the CALLER's own uid.
CREATE OR REPLACE FUNCTION public.has_accepted_event_invite(_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.event_invites i
    WHERE i.event_id = _event_id
      AND i.user_id = auth.uid()
      AND i.status = 'accepted'
  );
$$;
-- Callable by authenticated (the policy runs as the caller); pointless for
-- anon (auth.uid() is NULL, always false) so not granted.
REVOKE ALL ON FUNCTION public.has_accepted_event_invite(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_accepted_event_invite(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- events: the security boundary
-- ---------------------------------------------------------------------------
-- The public policy stops covering private rows...
DROP POLICY IF EXISTS "Public reads approved events" ON public.events;
CREATE POLICY "Public reads approved events"
  ON public.events FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND visibility <> 'private');

-- ...and a guest policy covers them only for accepted invitees. Workspace
-- and admin policies (unchanged) already cover the coordinator side.
DROP POLICY IF EXISTS "Invited guests read private events" ON public.events;
CREATE POLICY "Invited guests read private events"
  ON public.events FOR SELECT
  TO authenticated
  USING (status = 'approved' AND visibility = 'private' AND public.has_accepted_event_invite(id));

-- ---------------------------------------------------------------------------
-- event_rsvps: you can only RSVP to an event you can see
-- ---------------------------------------------------------------------------
-- The existing permissive policy checks only user_id = auth.uid(), so anyone
-- holding a private event's id could RSVP to it -- and the reminder drain
-- (service role) would then email them its title and time. RESTRICTIVE, so
-- it is ANDed with every permissive policy rather than widening them; the
-- EXISTS runs under the caller's own events RLS, i.e. exactly "can this user
-- see the event". Applies to INSERT and UPDATE; deleting your own RSVP stays
-- allowed even after losing access.
DROP POLICY IF EXISTS "RSVP only to visible events" ON public.event_rsvps;
CREATE POLICY "RSVP only to visible events"
  ON public.event_rsvps AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_rsvps.event_id));
DROP POLICY IF EXISTS "RSVP updates only to visible events" ON public.event_rsvps;
CREATE POLICY "RSVP updates only to visible events"
  ON public.event_rsvps AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_rsvps.event_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_rsvps.event_id));

-- event_organizers / event_field_values: re-assert the EXISTS-gated public
-- read policies exactly as 20260801195058 defines them. Production already
-- has these; restating them here (idempotently) guarantees the private
-- boundary holds even where that older migration stopped early -- it
-- creates event_locations before these policies and can abort on a missing
-- PostGIS, which is precisely what happens in the test sandbox, where the
-- original USING (true) policies were found still in force (leaking a
-- private event's organizers and custom-field values to anyone).
DROP POLICY IF EXISTS "event_organizers_public_read" ON public.event_organizers;
CREATE POLICY "event_organizers_public_read" ON public.event_organizers
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_organizers.event_id AND e.status = 'approved'
  ));
DROP POLICY IF EXISTS "field_values_public_read" ON public.event_field_values;
CREATE POLICY "field_values_public_read" ON public.event_field_values
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_field_values.event_id AND e.status = 'approved'
  ));

-- event_series needs no change: its public policy (20260810025551) is
-- already EXISTS(... FROM public.events ... status = 'approved'), and that
-- subquery runs under the caller's events RLS -- so a series whose only
-- events are private is invisible to anyone who can't see those events.
-- Same for event_details / event_locations / event_tickets / event_photos /
-- event_organizers / event_field_* / sponsored_slots: all gate on an EXISTS
-- over public.events. tests/db/private-events-access.py checks each one.

CREATE INDEX IF NOT EXISTS events_private_idx ON public.events (id) WHERE visibility = 'private';
