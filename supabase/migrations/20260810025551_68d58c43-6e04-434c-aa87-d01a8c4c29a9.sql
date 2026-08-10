-- Restrict public reads on event_series to series with at least one approved event
DROP POLICY IF EXISTS "Public reads active series" ON public.event_series;
CREATE POLICY "Public reads active series"
ON public.event_series
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.series_id = event_series.id
      AND e.status = 'approved'
  )
  OR event_series.coordinator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);
