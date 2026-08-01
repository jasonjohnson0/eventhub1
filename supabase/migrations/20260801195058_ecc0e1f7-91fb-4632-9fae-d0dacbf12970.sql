
-- 1) event_submissions: unclaimed rows are admin-only; no more permissive WITH CHECK (true)
DROP POLICY IF EXISTS "submissions_reviewer_read" ON public.event_submissions;
CREATE POLICY "submissions_reviewer_read" ON public.event_submissions
FOR SELECT TO authenticated
USING (
  coordinator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "submissions_reviewer_update" ON public.event_submissions;
CREATE POLICY "submissions_reviewer_update" ON public.event_submissions
FOR UPDATE TO authenticated
USING (
  coordinator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  coordinator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- 2) event_locations: public sees approved events only
DROP POLICY IF EXISTS "Public reads event locations" ON public.event_locations;
CREATE POLICY "Public reads event locations" ON public.event_locations
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_locations.event_id
      AND e.status = 'approved'
  )
);

-- 3) event_field_values: public sees approved events only; owners keep access
DROP POLICY IF EXISTS "field_values_public_read" ON public.event_field_values;
CREATE POLICY "field_values_public_read" ON public.event_field_values
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_field_values.event_id
      AND e.status = 'approved'
  )
);
CREATE POLICY "field_values_owner_read" ON public.event_field_values
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_field_values.event_id
      AND (e.coordinator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- 4) event_organizers: public sees approved events only; owners keep access
DROP POLICY IF EXISTS "event_organizers_public_read" ON public.event_organizers;
CREATE POLICY "event_organizers_public_read" ON public.event_organizers
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_organizers.event_id
      AND e.status = 'approved'
  )
);
CREATE POLICY "event_organizers_owner_read" ON public.event_organizers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_organizers.event_id
      AND (e.coordinator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- 5) event_field_schemas: scope public reads to schemas used by approved events
DROP POLICY IF EXISTS "field_schemas_public_read" ON public.event_field_schemas;
CREATE POLICY "field_schemas_public_read" ON public.event_field_schemas
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.event_field_values v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.field_id = event_field_schemas.id
      AND e.status = 'approved'
  )
);
CREATE POLICY "field_schemas_owner_read" ON public.event_field_schemas
FOR SELECT TO authenticated
USING (
  coordinator_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
);

-- 6) SECURITY DEFINER functions: drop direct client execute where the app can call them server-side
REVOKE EXECUTE ON FUNCTION public.is_slug_available(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_events_nearby(double precision, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_slug_available(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_events_nearby(double precision, double precision, double precision, integer) TO service_role;

-- Best-effort: PostGIS extension-owned helper exposed to anon
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM anon';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS estimated-extent grants are extension-owned; skipped';
END $$;
