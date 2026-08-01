-- 1. Profiles: limit anonymous readers to non-sensitive display columns
DROP POLICY IF EXISTS "Profiles are public" ON public.profiles;
CREATE POLICY "Profiles readable" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, display_name, avatar_url) ON public.profiles TO anon;

-- 2. Social follows: signed-in users only
DROP POLICY IF EXISTS "Follows are public" ON public.social_follows;
CREATE POLICY "Follows visible to signed-in users" ON public.social_follows
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.social_follows FROM anon;

-- 3. Storage: exact object-path match instead of loose LIKE
DROP POLICY IF EXISTS "event_photos_read" ON storage.objects;
CREATE POLICY "event_photos_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'event-photos'
    AND EXISTS (
      SELECT 1
      FROM public.event_photos ep
      JOIN public.events e ON e.id = ep.event_id
      WHERE split_part(ep.photo_url, '/event-photos/', 2) = objects.name
        AND e.status = 'approved'::event_status
    )
  );

-- 4. SECURITY DEFINER functions: least-privilege EXECUTE
REVOKE ALL ON FUNCTION public.get_ical_feed_events(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_slug_available(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_events_nearby(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_slug_available(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_events_nearby(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ical_feed_events(text) TO service_role;

-- 5. PostGIS reference table: remove Data API exposure
REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;