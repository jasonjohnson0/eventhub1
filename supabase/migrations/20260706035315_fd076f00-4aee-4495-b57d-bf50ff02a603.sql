
-- Phase 2c: Capacity, Waitlist, Check-in

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS max_capacity INT,
  ADD COLUMN IF NOT EXISTS has_waitlist BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS event_rsvps_checked_in_idx
  ON public.event_rsvps (event_id) WHERE checked_in_at IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE public.waitlist_status AS ENUM ('waitlisted', 'promoted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position INT NOT NULL,
  status public.waitlist_status NOT NULL DEFAULT 'waitlisted',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_waitlist_event_idx
  ON public.event_waitlist (event_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_waitlist TO authenticated;
GRANT ALL ON public.event_waitlist TO service_role;

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own waitlist entry"
  ON public.event_waitlist
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage waitlist"
  ON public.event_waitlist
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Workspace reads waitlist for own events"
  ON public.event_waitlist
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_waitlist.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ));

CREATE POLICY "Workspace updates waitlist for own events"
  ON public.event_waitlist
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_waitlist.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_waitlist.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ));

CREATE TRIGGER event_waitlist_updated_at
  BEFORE UPDATE ON public.event_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.schema_version (version, description)
VALUES ('2c.0', 'Phase 2c: capacity, waitlist, check-in')
ON CONFLICT DO NOTHING;
