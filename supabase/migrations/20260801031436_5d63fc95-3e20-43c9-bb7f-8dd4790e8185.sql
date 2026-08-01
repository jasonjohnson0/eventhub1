CREATE POLICY "Branding read for authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'branding');

CREATE POLICY "Branding insert own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Branding update own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Branding delete own folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND (storage.foldername(name))[1] = auth.uid()::text);