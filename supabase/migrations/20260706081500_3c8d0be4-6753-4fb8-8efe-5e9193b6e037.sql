
CREATE POLICY "event_photos_read" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'event-photos');
CREATE POLICY "event_photos_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-photos' AND owner = auth.uid());
CREATE POLICY "event_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-photos' AND owner = auth.uid());
