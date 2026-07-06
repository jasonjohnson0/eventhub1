
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE public.event_category AS ENUM ('sports','networking','education','social','fundraiser','workshop','other');

ALTER TABLE public.events ADD COLUMN category public.event_category NOT NULL DEFAULT 'other';
ALTER TABLE public.events ADD COLUMN tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX events_category_idx ON public.events(category);
CREATE INDEX events_tags_gin ON public.events USING GIN(tags);
CREATE INDEX events_title_trgm ON public.events USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE public.event_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.event_locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_locations TO authenticated;
GRANT ALL ON public.event_locations TO service_role;

ALTER TABLE public.event_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads event locations" ON public.event_locations
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status <> 'removed')
  );

CREATE POLICY "Coordinators manage own event locations" ON public.event_locations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));

CREATE POLICY "Admins manage event locations" ON public.event_locations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_event_locations_geom ON public.event_locations USING GIST(geom);

CREATE TRIGGER event_locations_updated_at BEFORE UPDATE ON public.event_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC for radius search using PostGIS
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
    AND ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography, _radius_meters)
  ORDER BY distance_meters ASC
  LIMIT _limit
$$;

GRANT EXECUTE ON FUNCTION public.search_events_nearby(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon, authenticated;

INSERT INTO public.schema_version (version, description) VALUES ('2a.0', 'Discovery layer: category, tags, PostGIS geom for events');
