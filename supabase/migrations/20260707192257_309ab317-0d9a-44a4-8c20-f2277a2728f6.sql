DROP POLICY IF EXISTS "event_photos_read" ON storage.objects;
CREATE POLICY "event_photos_read" ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'event-photos'
  AND EXISTS (
    SELECT 1 FROM public.event_photos ep
    JOIN public.events e ON e.id = ep.event_id
    WHERE ep.photo_url LIKE '%' || storage.objects.name
      AND e.status = 'approved'
  )
);