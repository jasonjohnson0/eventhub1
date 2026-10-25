DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS spatial_ref_sys_read ON public.spatial_ref_sys';
    EXECUTE 'CREATE POLICY spatial_ref_sys_read ON public.spatial_ref_sys FOR SELECT TO anon, authenticated USING (true)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'cannot alter spatial_ref_sys; revoking writes';
  END;
  BEGIN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM anon, authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

DROP POLICY IF EXISTS event_photos_read ON storage.objects;
CREATE POLICY event_photos_read ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'event-photos' AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.event_photos ep JOIN public.events e ON e.id = ep.event_id
      WHERE split_part(ep.photo_url, '/event-photos/', 2) = objects.name
        AND e.status = 'approved' AND e.visibility = 'public'
    )
  )
);