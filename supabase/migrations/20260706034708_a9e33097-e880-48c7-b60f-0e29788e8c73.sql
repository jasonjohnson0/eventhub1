
CREATE TABLE public.event_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category public.event_category NOT NULL DEFAULT 'other',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rrule TEXT NOT NULL,             -- RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=FR"
  dtstart TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_series TO authenticated;
GRANT ALL ON public.event_series TO service_role;
ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads active series" ON public.event_series
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Coordinators manage own series" ON public.event_series
  FOR ALL TO authenticated
  USING (coordinator_id = auth.uid())
  WITH CHECK (coordinator_id = auth.uid());
CREATE POLICY "Admins manage all series" ON public.event_series
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER event_series_updated_at BEFORE UPDATE ON public.event_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.events
  ADD COLUMN series_id UUID REFERENCES public.event_series(id) ON DELETE SET NULL,
  ADD COLUMN series_original_start TIMESTAMPTZ,
  ADD COLUMN is_exception BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX events_series_idx ON public.events(series_id);

INSERT INTO public.schema_version (version, description)
VALUES ('2b.0', 'Recurring events: event_series + series links on events');
