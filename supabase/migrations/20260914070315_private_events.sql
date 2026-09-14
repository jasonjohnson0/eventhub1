-- Spec 04: per-event visibility (public vs unlisted). Unlisted means
-- omitted from every LISTING surface, not access-gated -- a strange visitor
-- who already has the direct /events/$id link (or an invitation) can still
-- open it. RLS stays "approved => SELECT" so a direct UUID fetch keeps
-- working; every listing query filters visibility itself instead.

DO $$ BEGIN
  CREATE TYPE public.event_visibility AS ENUM ('public', 'unlisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS visibility public.event_visibility NOT NULL DEFAULT 'public';

CREATE INDEX IF NOT EXISTS events_visibility_idx ON public.events (visibility);

-- Two existing SECURITY DEFINER RPCs list events publicly and need the same
-- filter as every other listing surface. Same signature/return shape as
-- before (CREATE OR REPLACE), so this is safe to re-run and doesn't disturb
-- existing grants on either function.

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
    AND e.visibility = 'public'
  ORDER BY e.start_time;
$$;

CREATE OR REPLACE FUNCTION public.search_events_nearby(
  _lat DOUBLE PRECISION,
  _lng DOUBLE PRECISION,
  _radius_meters DOUBLE PRECISION,
  _limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID, title TEXT, description TEXT, location TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ,
  status public.event_status, coordinator_id UUID, category public.event_category, tags TEXT[],
  latitude DECIMAL, longitude DECIMAL, distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.title, e.description, e.location, e.start_time, e.end_time, e.status, e.coordinator_id,
         e.category, e.tags, l.latitude, l.longitude,
         ST_Distance(l.geom::geography, ST_SetSRID(ST_MakePoint(_lng, _lat),4326)::geography) AS distance_meters
  FROM public.events e
  JOIN public.event_locations l ON l.event_id = e.id
  WHERE e.status = 'approved'
    AND e.visibility = 'public'
    AND ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography, _radius_meters)
  ORDER BY distance_meters ASC
  LIMIT _limit
$$;
