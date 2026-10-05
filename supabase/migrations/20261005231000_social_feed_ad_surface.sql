ALTER TABLE public.sponsor_ad_stats
  DROP CONSTRAINT IF EXISTS sponsor_ad_stats_surface_chk;
ALTER TABLE public.sponsor_ad_stats
  ADD CONSTRAINT sponsor_ad_stats_surface_chk CHECK (surface IN ('embed', 'site', 'feed'));

ALTER TABLE public.sponsor_campaign_stats
  DROP CONSTRAINT IF EXISTS sponsor_campaign_stats_surface_check;
ALTER TABLE public.sponsor_campaign_stats
  DROP CONSTRAINT IF EXISTS sponsor_campaign_stats_surface_chk;
ALTER TABLE public.sponsor_campaign_stats
  ADD CONSTRAINT sponsor_campaign_stats_surface_chk CHECK (surface IN ('embed', 'site', 'feed'));

CREATE OR REPLACE FUNCTION public.record_ad_event(
  p_slot_id UUID,
  p_kind TEXT,
  p_surface TEXT,
  p_visitor_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_live BOOLEAN;
BEGIN
  IF p_kind NOT IN ('impression', 'click')
     OR p_surface NOT IN ('embed', 'site', 'feed')
     OR p_visitor_hash IS NULL
     OR char_length(p_visitor_hash) NOT BETWEEN 16 AND 64 THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.sponsored_slots sl
    JOIN public.events e ON e.id = sl.event_id
    JOIN public.sponsors s ON s.slot_id = sl.id
    JOIN public.sponsor_creatives c ON c.sponsor_id = s.id
    WHERE sl.id = p_slot_id
      AND e.status = 'approved'
      AND sl.status = 'paid'
      AND (sl.starts_at IS NULL OR sl.starts_at <= now())
      AND (sl.ends_at IS NULL OR sl.ends_at >= now())
  ) INTO v_live;

  IF NOT v_live THEN
    RETURN false;
  END IF;

  INSERT INTO public.sponsor_ad_stats AS t
    (slot_id, kind, surface, stat_date, visitor_hash)
  VALUES
    (p_slot_id, p_kind, p_surface, (now() AT TIME ZONE 'UTC')::date, p_visitor_hash)
  ON CONFLICT (slot_id, kind, surface, stat_date, visitor_hash)
  DO UPDATE SET
    hits = LEAST(t.hits + 1, 200),
    last_seen = now();

  RETURN true;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.record_ad_event(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_event(UUID, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_campaign_ad_event(
  p_campaign_id uuid,
  p_kind text,
  p_surface text,
  p_visitor_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_kind NOT IN ('impression', 'click')
     OR p_surface NOT IN ('embed', 'site', 'feed')
     OR p_visitor_hash IS NULL
     OR char_length(p_visitor_hash) NOT BETWEEN 16 AND 64 THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sponsor_campaigns c
    WHERE c.id = p_campaign_id AND public.campaign_is_live(c)
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.sponsor_campaign_stats AS t
    (campaign_id, kind, surface, stat_date, visitor_hash)
  VALUES
    (p_campaign_id, p_kind, p_surface, (now() AT TIME ZONE 'UTC')::date, p_visitor_hash)
  ON CONFLICT (campaign_id, kind, surface, stat_date, visitor_hash)
  DO UPDATE SET hits = LEAST(t.hits + 1, 200), last_seen = now();
  RETURN true;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.record_campaign_ad_event(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_ad_event(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_campaign_sponsors_for_calendar(
  p_coordinator_id uuid,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  ad_key text,
  scope public.sponsor_scope,
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
AS $fn$
  WITH cal AS (SELECT * FROM public.coordinator_effective_ads(p_coordinator_id))
  SELECT 'c_' || c.id::text, c.scope, cr.business_name, cr.logo_url,
         cr.link_url, cr.headline, cr.body
  FROM cal
  JOIN public.sponsor_campaigns c ON public.campaign_is_live(c)
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  WHERE (c.scope = 'calendars' AND EXISTS (
           SELECT 1 FROM public.sponsor_campaign_calendars k
           WHERE k.campaign_id = c.id AND k.coordinator_id = p_coordinator_id))
     OR (c.scope = 'network' AND cal.network)
     OR (c.scope = 'geo' AND cal.local
         AND public.calendar_in_campaign_geo(c.id, p_coordinator_id))
  ORDER BY CASE c.scope WHEN 'calendars' THEN 1 WHEN 'geo' THEN 2 ELSE 3 END,
           c.paid_at,
           c.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 20)
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_campaign_sponsors_for_calendar(uuid, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_sponsors_for_calendar(uuid, integer)
  TO anon, authenticated, service_role;