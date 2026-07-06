
DO $$ BEGIN
  CREATE TYPE public.event_format AS ENUM ('in_person', 'virtual', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.livestream_provider AS ENUM ('zoom', 'google_meet', 'youtube', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_format public.event_format NOT NULL DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS virtual_link TEXT,
  ADD COLUMN IF NOT EXISTS livestream_provider public.livestream_provider NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS public.coordinator_ical_feeds (
  coordinator_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordinator_ical_feeds TO authenticated;
GRANT ALL ON public.coordinator_ical_feeds TO service_role;

ALTER TABLE public.coordinator_ical_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators manage their own feed token" ON public.coordinator_ical_feeds;
CREATE POLICY "Coordinators manage their own feed token"
  ON public.coordinator_ical_feeds
  FOR ALL
  USING (auth.uid() = coordinator_id)
  WITH CHECK (auth.uid() = coordinator_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ical_feed ON public.coordinator_ical_feeds;
CREATE TRIGGER trg_touch_ical_feed
  BEFORE UPDATE ON public.coordinator_ical_feeds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_ical_feed_events(_token TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  event_format public.event_format,
  virtual_link TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.title, e.description, e.location, e.start_time, e.end_time,
         e.event_format, e.virtual_link
  FROM public.events e
  JOIN public.coordinator_ical_feeds f
    ON f.coordinator_id = e.coordinator_id
  WHERE f.feed_token = _token
    AND e.status = 'approved'
  ORDER BY e.start_time;
$$;

GRANT EXECUTE ON FUNCTION public.get_ical_feed_events(TEXT) TO anon, authenticated, service_role;

UPDATE public.events
SET event_format = 'hybrid',
    virtual_link = 'https://zoom.us/j/demo-food-truck-friday',
    livestream_provider = 'zoom'
WHERE title ILIKE '%food truck friday%';
