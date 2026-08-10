-- Fix public read exposure on organizers and venues
-- Only expose rows linked to at least one approved event, plus owner/admin access

-- Organizers: restrict public reads to organizers of approved events
DROP POLICY IF EXISTS organizers_public_read ON public.organizers;
CREATE POLICY organizers_public_read
ON public.organizers
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.event_organizers eo
    JOIN public.events e ON e.id = eo.event_id
    WHERE eo.organizer_id = organizers.id
      AND e.status = 'approved'
  )
  OR organizers.coordinator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- Venues: restrict public reads to venues of approved events
DROP POLICY IF EXISTS venues_public_read ON public.venues;
CREATE POLICY venues_public_read
ON public.venues
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.venue_id = venues.id
      AND e.status = 'approved'
  )
  OR venues.coordinator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);
