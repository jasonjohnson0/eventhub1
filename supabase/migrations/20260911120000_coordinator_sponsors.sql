-- Coordinator-scoped sponsor read, for calendar embeds.
--
-- get_public_sponsors(event_id) answers "what is running on this event". An
-- embed renders a coordinator's whole calendar, so asking per event would mean
-- one round trip per event on every cache miss. This answers "what is running
-- across this coordinator's calendar" in one call.
--
-- Same guarantees as the per-event function: only paid slots, only inside their
-- run window, only on approved events, and never cost_cents, external_contact
-- or the buyer's identity.

DO $guard$
BEGIN
  IF to_regclass('public.sponsor_creatives') IS NULL THEN
    RAISE EXCEPTION
      'public.sponsor_creatives is missing. Apply 20260905120000_sponsor_creatives.sql first.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_public_coordinator_sponsors(
  p_coordinator_id uuid,
  p_limit integer DEFAULT 6
)
RETURNS TABLE (
  slot_id uuid,
  event_id uuid,
  event_title text,
  "position" integer,
  slot_type public.slot_type,
  business_name text,
  logo_url text,
  link_url text,
  headline text,
  body text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sl.id AS slot_id,
    e.id AS event_id,
    e.title AS event_title,
    sl.position AS "position",
    sl.slot_type,
    c.business_name,
    c.logo_url,
    c.link_url,
    c.headline,
    c.body
  FROM public.sponsored_slots sl
  JOIN public.events e ON e.id = sl.event_id
  JOIN public.sponsors s ON s.slot_id = sl.id
  JOIN public.sponsor_creatives c ON c.sponsor_id = s.id
  WHERE e.coordinator_id = p_coordinator_id
    AND e.status = 'approved'
    AND sl.status = 'paid'
    AND (sl.starts_at IS NULL OR sl.starts_at <= now())
    AND (sl.ends_at IS NULL OR sl.ends_at >= now())
    -- Soonest events first, so an embed shows what is most current.
    ORDER BY e.start_time, sl.position
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 20);
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_coordinator_sponsors(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_coordinator_sponsors(uuid, integer) TO anon, authenticated;
