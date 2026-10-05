-- Decision 7 (revised): a calendar's ad policy is two flags. Free calendars
-- must keep at least one on; paid calendars may turn both off (ad-free).
ALTER TABLE public.coordinator_profiles
  ADD COLUMN IF NOT EXISTS ads_local boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ads_network boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ads_last_local boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ads_last_network boolean NOT NULL DEFAULT false;

-- Backfill from the retired single-choice column.
UPDATE public.coordinator_profiles SET
  ads_local   = (ad_mode = 'local'),
  ads_network = (ad_mode = 'network'),
  ads_last_local   = (ad_mode_last_choice = 'local'),
  ads_last_network = (ad_mode_last_choice = 'network');

DO $$ BEGIN
  ALTER TABLE public.coordinator_profiles
    ADD CONSTRAINT coordinator_profiles_ads_last_nonempty_chk CHECK (ads_last_local OR ads_last_network);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.coordinator_profiles.ad_mode IS 'DEPRECATED: replaced by ads_local / ads_network';
COMMENT ON COLUMN public.coordinator_profiles.ad_mode_last_choice IS 'DEPRECATED: replaced by ads_last_local / ads_last_network';

DROP TRIGGER IF EXISTS coordinator_profiles_ad_mode_guard_trg ON public.coordinator_profiles;

CREATE OR REPLACE FUNCTION public.coordinator_profiles_ads_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.ads_local OR NEW.ads_network THEN
    -- Remember the last non-empty choice so a lapsed paid plan can restore it.
    NEW.ads_last_local := NEW.ads_local;
    NEW.ads_last_network := NEW.ads_network;
  ELSIF (TG_OP = 'INSERT'
         OR OLD.ads_local IS DISTINCT FROM NEW.ads_local
         OR OLD.ads_network IS DISTINCT FROM NEW.ads_network)
        AND NOT public.coordinator_is_paid(NEW.coordinator_id) THEN
    RAISE EXCEPTION 'A free calendar must show local or network-wide sponsor ads (or both). Ad-free needs the paid plan.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.coordinator_profiles_ads_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS coordinator_profiles_ads_guard_trg ON public.coordinator_profiles;
CREATE TRIGGER coordinator_profiles_ads_guard_trg
  BEFORE INSERT OR UPDATE OF ads_local, ads_network ON public.coordinator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.coordinator_profiles_ads_guard();

-- Effective flags: paid + both off = ad-free; lapsed + both off = last choice.
CREATE OR REPLACE FUNCTION public.coordinator_effective_ads(_coordinator_id uuid)
RETURNS TABLE (local boolean, network boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(x.l, true), COALESCE(x.n, false)
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (
    SELECT CASE WHEN cp.ads_local OR cp.ads_network OR public.coordinator_is_paid(_coordinator_id)
                THEN cp.ads_local ELSE cp.ads_last_local END AS l,
           CASE WHEN cp.ads_local OR cp.ads_network OR public.coordinator_is_paid(_coordinator_id)
                THEN cp.ads_network ELSE cp.ads_last_network END AS n
    FROM public.coordinator_profiles cp WHERE cp.coordinator_id = _coordinator_id
  ) x ON true
$$;
REVOKE EXECUTE ON FUNCTION public.coordinator_effective_ads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordinator_effective_ads(uuid) TO authenticated, service_role;

-- Persist the restore when a plan lapses (callable by maintenance jobs).
CREATE OR REPLACE FUNCTION public.restore_lapsed_ad_settings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE n integer;
BEGIN
  UPDATE public.coordinator_profiles cp
     SET ads_local = cp.ads_last_local, ads_network = cp.ads_last_network
   WHERE NOT cp.ads_local AND NOT cp.ads_network
     AND NOT public.coordinator_is_paid(cp.coordinator_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.restore_lapsed_ad_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_lapsed_ad_settings() TO service_role;

-- Keep the old function answering (text) for anything still calling it.
CREATE OR REPLACE FUNCTION public.coordinator_effective_ad_mode(_coordinator_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN f.local AND f.network THEN 'both' WHEN f.network THEN 'network'
              WHEN f.local THEN 'local' ELSE 'ad_free' END
  FROM public.coordinator_effective_ads(_coordinator_id) f
$$;

-- Targeting RPCs rewritten against the flags. Calendar/event-scope campaigns
-- always render; geo needs Local on; network needs Network on.
CREATE OR REPLACE FUNCTION public.get_campaign_sponsors_for_event(p_event_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE (ad_key text, scope public.sponsor_scope, business_name text, logo_url text,
               link_url text, headline text, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH ev AS (
    SELECT e.id, e.coordinator_id, e.visibility, f.local, f.network
    FROM public.events e
    CROSS JOIN LATERAL public.coordinator_effective_ads(e.coordinator_id) f
    WHERE e.id = p_event_id AND e.status = 'approved' AND e.visibility <> 'private'
  ), pt AS (SELECT * FROM public.event_point(p_event_id))
  SELECT 'c_' || c.id::text, c.scope, cr.business_name, cr.logo_url, cr.link_url, cr.headline, cr.body
  FROM ev
  JOIN public.sponsor_campaigns c ON public.campaign_is_live(c)
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  LEFT JOIN pt p ON true
  WHERE (c.scope = 'event' AND c.event_id = ev.id)
     OR (c.scope = 'calendars' AND EXISTS (SELECT 1 FROM public.sponsor_campaign_calendars k
                                          WHERE k.campaign_id = c.id AND k.coordinator_id = ev.coordinator_id))
     OR (c.scope = 'network' AND ev.network AND ev.visibility = 'public')
     OR (c.scope = 'geo' AND ev.local AND ev.visibility = 'public'
         AND public.point_in_campaign_geo(c.id, p.lat, p.lng))
  ORDER BY CASE c.scope WHEN 'event' THEN 0 WHEN 'calendars' THEN 1 WHEN 'geo' THEN 2 ELSE 3 END, c.paid_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 3)
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_sponsors_for_calendar(p_coordinator_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE (ad_key text, scope public.sponsor_scope, business_name text, logo_url text,
               link_url text, headline text, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH cal AS (SELECT * FROM public.coordinator_effective_ads(p_coordinator_id))
  SELECT 'c_' || c.id::text, c.scope, cr.business_name, cr.logo_url, cr.link_url, cr.headline, cr.body
  FROM cal
  JOIN public.sponsor_campaigns c ON public.campaign_is_live(c)
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  WHERE (c.scope = 'calendars' AND EXISTS (SELECT 1 FROM public.sponsor_campaign_calendars k
                                          WHERE k.campaign_id = c.id AND k.coordinator_id = p_coordinator_id))
     OR (c.scope = 'network' AND cal.network)
     OR (c.scope = 'geo' AND cal.local AND public.calendar_in_campaign_geo(c.id, p_coordinator_id))
  ORDER BY CASE c.scope WHEN 'calendars' THEN 1 WHEN 'geo' THEN 2 ELSE 3 END, c.paid_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 3)
$$;

CREATE OR REPLACE FUNCTION public.geo_reach(p_center_zip text, p_radius_miles integer, p_zips text[])
RETURNS TABLE (calendars integer, events integer, unknown_zips text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_lat double precision;
  v_lng double precision;
BEGIN
  SELECT z.lat, z.lng INTO v_lat, v_lng FROM public.zip_centroids z WHERE z.zip = p_center_zip;
  RETURN QUERY
  WITH pts AS (
    SELECT e.id, e.coordinator_id, p.lat, p.lng
    FROM public.events e
    CROSS JOIN LATERAL public.event_point(e.id) p
    CROSS JOIN LATERAL public.coordinator_effective_ads(e.coordinator_id) f
    WHERE e.status = 'approved' AND e.visibility = 'public' AND e.end_time >= now()
      AND p.lat IS NOT NULL AND f.local
  ), hit AS (
    SELECT * FROM pts WHERE
      (v_lat IS NOT NULL AND p_radius_miles IS NOT NULL
        AND public.miles_between(v_lat, v_lng, pts.lat, pts.lng) <= p_radius_miles)
      OR EXISTS (SELECT 1 FROM public.zip_centroids z WHERE z.zip = ANY (COALESCE(p_zips, '{}'::text[]))
                 AND public.miles_between(z.lat, z.lng, pts.lat, pts.lng) <= 5)
  )
  SELECT (SELECT count(DISTINCT h.coordinator_id)::int FROM hit h),
         (SELECT count(*)::int FROM hit),
         ARRAY(SELECT u FROM unnest(COALESCE(p_zips, '{}'::text[])
                 || CASE WHEN p_center_zip IS NULL THEN '{}'::text[] ELSE ARRAY[p_center_zip] END) u
               WHERE NOT EXISTS (SELECT 1 FROM public.zip_centroids z WHERE z.zip = u));
END $fn$;

CREATE OR REPLACE FUNCTION public.get_campaigns_on_my_calendar(p_coordinator_id uuid)
RETURNS TABLE (campaign_id uuid, scope public.sponsor_scope, business_name text,
               starts_on date, ends_on date, status public.campaign_status)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_local boolean; v_network boolean;
BEGIN
  IF NOT (auth.uid() = p_coordinator_id
          OR public.is_workspace_member(auth.uid(), p_coordinator_id)
          OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  SELECT f.local, f.network INTO v_local, v_network FROM public.coordinator_effective_ads(p_coordinator_id) f;
  RETURN QUERY
  SELECT c.id, c.scope, cr.business_name, c.starts_on, c.ends_on, c.status
  FROM public.sponsor_campaigns c
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  WHERE c.status IN ('active', 'paused') AND c.ends_on >= (now() AT TIME ZONE c.tz)::date
    AND (
         (c.scope = 'event' AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = c.event_id AND e.coordinator_id = p_coordinator_id))
      OR (c.scope = 'calendars' AND EXISTS (SELECT 1 FROM public.sponsor_campaign_calendars k WHERE k.campaign_id = c.id AND k.coordinator_id = p_coordinator_id))
      OR (c.scope = 'network' AND v_network)
      OR (c.scope = 'geo' AND v_local AND public.calendar_in_campaign_geo(c.id, p_coordinator_id)))
  ORDER BY c.starts_on;
END $fn$;
