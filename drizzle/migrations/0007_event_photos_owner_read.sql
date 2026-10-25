DROP POLICY IF EXISTS event_photos_read ON storage.objects;
CREATE POLICY event_photos_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'event-photos' AND owner_id = (select auth.uid()::text));