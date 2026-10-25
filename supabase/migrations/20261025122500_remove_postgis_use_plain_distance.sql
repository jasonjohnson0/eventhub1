CREATE OR REPLACE FUNCTION public.search_events_nearby(_lat double precision, _lng double precision, _radius_meters double precision, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, title text, description text, location text, start_time timestamp with time zone, end_time timestamp with time zone, status event_status, coordinator_id uuid, category event_category, tags text[], latitude numeric, longitude numeric, distance_meters double precision)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT * FROM (
    SELECT e.id, e.title, e.description, e.location, e.start_time, e.end_time, e.status, e.coordinator_id,
           e.category, e.tags, l.latitude, l.longitude,
           2 * 6371008.8 * asin(sqrt(least(1,
             power(sin(radians(l.latitude::double precision - _lat) / 2), 2)
             + cos(radians(_lat)) * cos(radians(l.latitude::double precision))
               * power(sin(radians(l.longitude::double precision - _lng) / 2), 2)))) AS distance_meters
    FROM public.events e
    JOIN public.event_locations l ON l.event_id = e.id
    WHERE e.status = 'approved' AND e.visibility = 'public'
  ) s
  WHERE s.distance_meters <= _radius_meters
  ORDER BY s.distance_meters ASC
  LIMIT _limit
$function$;

CREATE INDEX IF NOT EXISTS idx_event_locations_lat_lng ON public.event_locations (latitude, longitude);

DROP EXTENSION IF EXISTS postgis CASCADE;