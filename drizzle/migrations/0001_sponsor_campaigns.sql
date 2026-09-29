-- Phase 1b: sponsor campaigns (event / calendars / network / geo) and the
-- free-calendar ad policy. Additive only; legacy per-event slots untouched.
-- Geography uses haversine on lat/lng (no PostGIS dependency) so the same SQL
-- runs in the throwaway test Postgres. Safe to re-run.

DO $$ BEGIN
  CREATE TYPE public.sponsor_scope AS ENUM ('event', 'calendars', 'network', 'geo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM
    ('draft', 'pending_payment', 'pending_review', 'active', 'paused', 'ended', 'refunded', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pricing (admin-editable)
CREATE TABLE IF NOT EXISTS public.sponsor_pricing (
  scope public.sponsor_scope PRIMARY KEY,
  unit_cents integer NOT NULL CHECK (unit_cents >= 0),
  period text NOT NULL CHECK (period IN ('week', 'month')),
  unit text NOT NULL CHECK (unit IN ('flat', 'per_calendar')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sponsor_pricing TO anon, authenticated;
GRANT ALL ON public.sponsor_pricing TO service_role;
ALTER TABLE public.sponsor_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads pricing" ON public.sponsor_pricing;
CREATE POLICY "Anyone reads pricing" ON public.sponsor_pricing FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.sponsor_pricing (scope, unit_cents, period, unit) VALUES
  ('event', 2500, 'week', 'flat'),
  ('calendars', 5000, 'month', 'per_calendar'),
  ('geo', 5000, 'month', 'per_calendar'),
  ('network', 30000, 'month', 'flat')
ON CONFLICT (scope) DO NOTHING;

-- ZIP centroids (rows loaded by a separate one-time import)
CREATE TABLE IF NOT EXISTS public.zip_centroids (
  zip text PRIMARY KEY CHECK (zip ~ '^[0-9]{5}$'),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180)
);
GRANT SELECT ON public.zip_centroids TO anon, authenticated;
GRANT ALL ON public.zip_centroids TO service_role;
ALTER TABLE public.zip_centroids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads zip centroids" ON public.zip_centroids;
CREATE POLICY "Anyone reads zip centroids" ON public.zip_centroids FOR SELECT TO anon, authenticated USING (true);

-- Campaigns
CREATE TABLE IF NOT EXISTS public.sponsor_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope public.sponsor_scope NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  tz text NOT NULL DEFAULT 'America/Chicago',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  contact_name text CHECK (contact_name IS NULL OR char_length(contact_name) <= 120),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 254),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_campaigns_dates CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS sponsor_campaigns_status_idx ON public.sponsor_campaigns(status, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS sponsor_campaigns_buyer_idx ON public.sponsor_campaigns(buyer_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS sponsor_campaigns_session_uniq ON public.sponsor_campaigns(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

-- Column-level grants: buyers never write status, price, payment or review columns.
REVOKE ALL ON public.sponsor_campaigns FROM anon, authenticated;
GRANT SELECT, DELETE ON public.sponsor_campaigns TO authenticated;
GRANT INSERT (buyer_user_id, scope, event_id, starts_on, ends_on, tz, contact_name, contact_email)
  ON public.sponsor_campaigns TO authenticated;
GRANT UPDATE (scope, event_id, starts_on, ends_on, tz, contact_name, contact_email, updated_at)
  ON public.sponsor_campaigns TO authenticated;
GRANT ALL ON public.sponsor_campaigns TO service_role;
ALTER TABLE public.sponsor_campaigns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sponsor_campaigns_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.tz) THEN
    RAISE EXCEPTION 'Unknown timezone: %', NEW.tz USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS sponsor_campaigns_validate_trg ON public.sponsor_campaigns;
CREATE TRIGGER sponsor_campaigns_validate_trg BEFORE INSERT OR UPDATE ON public.sponsor_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.sponsor_campaigns_validate();

DROP POLICY IF EXISTS "Buyer reads own campaigns" ON public.sponsor_campaigns;
CREATE POLICY "Buyer reads own campaigns" ON public.sponsor_campaigns FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid());
DROP POLICY IF EXISTS "Buyer creates draft" ON public.sponsor_campaigns;
CREATE POLICY "Buyer creates draft" ON public.sponsor_campaigns FOR INSERT TO authenticated
  WITH CHECK (buyer_user_id = auth.uid() AND status = 'draft');
DROP POLICY IF EXISTS "Buyer edits own draft" ON public.sponsor_campaigns;
CREATE POLICY "Buyer edits own draft" ON public.sponsor_campaigns FOR UPDATE TO authenticated
  USING (buyer_user_id = auth.uid() AND status = 'draft')
  WITH CHECK (buyer_user_id = auth.uid() AND status = 'draft');
DROP POLICY IF EXISTS "Buyer deletes own draft" ON public.sponsor_campaigns;
CREATE POLICY "Buyer deletes own draft" ON public.sponsor_campaigns FOR DELETE TO authenticated
  USING (buyer_user_id = auth.uid() AND status = 'draft');
DROP POLICY IF EXISTS "Admins read all campaigns" ON public.sponsor_campaigns;
CREATE POLICY "Admins read all campaigns" ON public.sponsor_campaigns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_own_draft_campaign(_campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.sponsor_campaigns
                 WHERE id = _campaign_id AND buyer_user_id = auth.uid() AND status = 'draft')
$$;
CREATE OR REPLACE FUNCTION public.can_read_campaign(_campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.sponsor_campaigns
                 WHERE id = _campaign_id
                   AND (buyer_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
$$;
REVOKE EXECUTE ON FUNCTION public.is_own_draft_campaign(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_draft_campaign(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_campaign(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.sponsor_campaign_creatives (
  campaign_id uuid PRIMARY KEY REFERENCES public.sponsor_campaigns(id) ON DELETE CASCADE,
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 120),
  logo_url text CHECK (logo_url IS NULL OR (logo_url ~* '^https://' AND char_length(logo_url) <= 2048)),
  link_url text CHECK (link_url IS NULL OR (link_url ~* '^https://' AND char_length(link_url) <= 2048)),
  headline text CHECK (headline IS NULL OR char_length(headline) <= 120),
  body text CHECK (body IS NULL OR char_length(body) <= 400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.sponsor_campaign_creatives FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_campaign_creatives TO authenticated;
GRANT ALL ON public.sponsor_campaign_creatives TO service_role;
ALTER TABLE public.sponsor_campaign_creatives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read creative" ON public.sponsor_campaign_creatives;
CREATE POLICY "Read creative" ON public.sponsor_campaign_creatives FOR SELECT TO authenticated
  USING (public.can_read_campaign(campaign_id));
DROP POLICY IF EXISTS "Write creative in draft" ON public.sponsor_campaign_creatives;
CREATE POLICY "Write creative in draft" ON public.sponsor_campaign_creatives FOR ALL TO authenticated
  USING (public.is_own_draft_campaign(campaign_id))
  WITH CHECK (public.is_own_draft_campaign(campaign_id));

CREATE TABLE IF NOT EXISTS public.sponsor_campaign_calendars (
  campaign_id uuid NOT NULL REFERENCES public.sponsor_campaigns(id) ON DELETE CASCADE,
  coordinator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, coordinator_id)
);
REVOKE ALL ON public.sponsor_campaign_calendars FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_campaign_calendars TO authenticated;
GRANT ALL ON public.sponsor_campaign_calendars TO service_role;
ALTER TABLE public.sponsor_campaign_calendars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read calendars" ON public.sponsor_campaign_calendars;
CREATE POLICY "Read calendars" ON public.sponsor_campaign_calendars FOR SELECT TO authenticated
  USING (public.can_read_campaign(campaign_id));
DROP POLICY IF EXISTS "Write calendars in draft" ON public.sponsor_campaign_calendars;
CREATE POLICY "Write calendars in draft" ON public.sponsor_campaign_calendars FOR ALL TO authenticated
  USING (public.is_own_draft_campaign(campaign_id))
  WITH CHECK (public.is_own_draft_campaign(campaign_id));

CREATE TABLE IF NOT EXISTS public.sponsor_campaign_geo (
  campaign_id uuid PRIMARY KEY REFERENCES public.sponsor_campaigns(id) ON DELETE CASCADE,
  center_zip text CHECK (center_zip IS NULL OR center_zip ~ '^[0-9]{5}$'),
  radius_miles integer CHECK (radius_miles IS NULL OR radius_miles BETWEEN 1 AND 100),
  zips text[] NOT NULL DEFAULT '{}',
  CONSTRAINT sponsor_campaign_geo_something CHECK (
    (center_zip IS NOT NULL AND radius_miles IS NOT NULL) OR cardinality(zips) > 0),
  CONSTRAINT sponsor_campaign_geo_zip_count CHECK (cardinality(zips) <= 200)
);
REVOKE ALL ON public.sponsor_campaign_geo FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_campaign_geo TO authenticated;
GRANT ALL ON public.sponsor_campaign_geo TO service_role;
ALTER TABLE public.sponsor_campaign_geo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read geo" ON public.sponsor_campaign_geo;
CREATE POLICY "Read geo" ON public.sponsor_campaign_geo FOR SELECT TO authenticated
  USING (public.can_read_campaign(campaign_id));
DROP POLICY IF EXISTS "Write geo in draft" ON public.sponsor_campaign_geo;
CREATE POLICY "Write geo in draft" ON public.sponsor_campaign_geo FOR ALL TO authenticated
  USING (public.is_own_draft_campaign(campaign_id))
  WITH CHECK (public.is_own_draft_campaign(campaign_id));

CREATE TABLE IF NOT EXISTS public.sponsor_campaign_stats (
  campaign_id uuid NOT NULL REFERENCES public.sponsor_campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('impression', 'click')),
  surface text NOT NULL CHECK (surface IN ('embed', 'site')),
  stat_date date NOT NULL,
  visitor_hash text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, kind, surface, stat_date, visitor_hash)
);
REVOKE ALL ON public.sponsor_campaign_stats FROM anon, authenticated;
GRANT ALL ON public.sponsor_campaign_stats TO service_role;
ALTER TABLE public.sponsor_campaign_stats ENABLE ROW LEVEL SECURITY;

-- Free-calendar ad policy
ALTER TABLE public.coordinator_profiles
  ADD COLUMN IF NOT EXISTS ad_mode text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS ad_mode_last_choice text NOT NULL DEFAULT 'local';
DO $$ BEGIN
  ALTER TABLE public.coordinator_profiles
    ADD CONSTRAINT coordinator_profiles_ad_mode_chk CHECK (ad_mode IN ('local', 'network', 'ad_free'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.coordinator_profiles
    ADD CONSTRAINT coordinator_profiles_ad_mode_last_chk CHECK (ad_mode_last_choice IN ('local', 'network'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.coordinator_is_paid(_coordinator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.coordinator_subscriptions s
                 WHERE s.coordinator_id = _coordinator_id AND s.status = 'active'
                   AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      OR EXISTS (SELECT 1 FROM public.billing b
                 WHERE b.coordinator_id = _coordinator_id
                   AND b.period_month = date_trunc('month', now())::date
                   AND b.status = 'succeeded' AND b.sponsor_id IS NULL)
$$;
REVOKE EXECUTE ON FUNCTION public.coordinator_is_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordinator_is_paid(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.coordinator_effective_ad_mode(_coordinator_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN cp.ad_mode = 'ad_free' AND public.coordinator_is_paid(_coordinator_id) THEN 'ad_free'
    WHEN cp.ad_mode = 'ad_free' THEN cp.ad_mode_last_choice
    ELSE cp.ad_mode END
  FROM public.coordinator_profiles cp WHERE cp.coordinator_id = _coordinator_id
$$;
REVOKE EXECUTE ON FUNCTION public.coordinator_effective_ad_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordinator_effective_ad_mode(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.coordinator_profiles_ad_mode_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.ad_mode IN ('local', 'network') THEN
    NEW.ad_mode_last_choice := NEW.ad_mode;
  END IF;
  IF NEW.ad_mode = 'ad_free'
     AND (TG_OP = 'INSERT' OR OLD.ad_mode IS DISTINCT FROM NEW.ad_mode)
     AND NOT public.coordinator_is_paid(NEW.coordinator_id) THEN
    RAISE EXCEPTION 'Ad-free is only available on the paid monthly plan'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS coordinator_profiles_ad_mode_guard_trg ON public.coordinator_profiles;
CREATE TRIGGER coordinator_profiles_ad_mode_guard_trg BEFORE INSERT OR UPDATE OF ad_mode ON public.coordinator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.coordinator_profiles_ad_mode_guard();

-- Targeting helpers
CREATE OR REPLACE FUNCTION public.miles_between(lat1 double precision, lng1 double precision,
                                               lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT 3958.8 * 2 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

CREATE OR REPLACE FUNCTION public.event_point(_event_id uuid)
RETURNS TABLE (lat double precision, lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(el.latitude::double precision, v.lat), COALESCE(el.longitude::double precision, v.lng)
  FROM public.events e
  LEFT JOIN LATERAL (SELECT latitude, longitude FROM public.event_locations WHERE event_id = e.id LIMIT 1) el ON true
  LEFT JOIN public.venues v ON v.id = e.venue_id
  WHERE e.id = _event_id
$$;

-- Listed ZIPs count as a 5-mile circle around the centroid. Unknown ZIPs match nothing.
CREATE OR REPLACE FUNCTION public.point_in_campaign_geo(_campaign_id uuid, _lat double precision, _lng double precision)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _lat IS NOT NULL AND _lng IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sponsor_campaign_geo g
    WHERE g.campaign_id = _campaign_id AND (
      EXISTS (SELECT 1 FROM public.zip_centroids z
              WHERE z.zip = g.center_zip AND g.radius_miles IS NOT NULL
                AND public.miles_between(z.lat, z.lng, _lat, _lng) <= g.radius_miles)
      OR EXISTS (SELECT 1 FROM public.zip_centroids z
                 WHERE z.zip = ANY (g.zips)
                   AND public.miles_between(z.lat, z.lng, _lat, _lng) <= 5)))
$$;

CREATE OR REPLACE FUNCTION public.campaign_is_live(c public.sponsor_campaigns)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT c.status = 'active'
     AND (now() AT TIME ZONE c.tz)::date BETWEEN c.starts_on AND c.ends_on
$$;

CREATE OR REPLACE FUNCTION public.calendar_in_campaign_geo(_campaign_id uuid, _coordinator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e CROSS JOIN LATERAL public.event_point(e.id) p
    WHERE e.coordinator_id = _coordinator_id AND e.status = 'approved'
      AND e.visibility = 'public' AND e.end_time >= now()
      AND public.point_in_campaign_geo(_campaign_id, p.lat, p.lng))
$$;

REVOKE EXECUTE ON FUNCTION public.event_point(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.point_in_campaign_geo(uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calendar_in_campaign_geo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_point(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.point_in_campaign_geo(uuid, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.calendar_in_campaign_geo(uuid, uuid) TO service_role;

-- Public read RPCs: creative columns only.
CREATE OR REPLACE FUNCTION public.get_campaign_sponsors_for_event(p_event_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE (ad_key text, scope public.sponsor_scope, business_name text, logo_url text,
               link_url text, headline text, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH ev AS (
    SELECT e.id, e.coordinator_id, e.visibility,
           COALESCE(public.coordinator_effective_ad_mode(e.coordinator_id), 'local') AS mode
    FROM public.events e
    WHERE e.id = p_event_id AND e.status = 'approved' AND e.visibility <> 'private'
  ), pt AS (SELECT * FROM public.event_point(p_event_id))
  SELECT 'c_' || c.id::text, c.scope, cr.business_name, cr.logo_url, cr.link_url, cr.headline, cr.body
  FROM ev
  JOIN public.sponsor_campaigns c ON public.campaign_is_live(c)
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  LEFT JOIN pt p ON true
  WHERE ev.mode <> 'ad_free' AND (
       (c.scope = 'event' AND c.event_id = ev.id)
    OR (c.scope = 'calendars' AND EXISTS (SELECT 1 FROM public.sponsor_campaign_calendars k
                                          WHERE k.campaign_id = c.id AND k.coordinator_id = ev.coordinator_id))
    OR (c.scope = 'network' AND ev.mode = 'network' AND ev.visibility = 'public')
    OR (c.scope = 'geo' AND ev.mode = 'local' AND ev.visibility = 'public'
        AND public.point_in_campaign_geo(c.id, p.lat, p.lng)))
  ORDER BY CASE c.scope WHEN 'event' THEN 0 WHEN 'calendars' THEN 1 WHEN 'geo' THEN 2 ELSE 3 END, c.paid_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 3)
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_sponsors_for_calendar(p_coordinator_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE (ad_key text, scope public.sponsor_scope, business_name text, logo_url text,
               link_url text, headline text, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH cal AS (SELECT COALESCE(public.coordinator_effective_ad_mode(p_coordinator_id), 'local') AS mode)
  SELECT 'c_' || c.id::text, c.scope, cr.business_name, cr.logo_url, cr.link_url, cr.headline, cr.body
  FROM cal
  JOIN public.sponsor_campaigns c ON public.campaign_is_live(c)
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  WHERE cal.mode <> 'ad_free' AND (
       (c.scope = 'calendars' AND EXISTS (SELECT 1 FROM public.sponsor_campaign_calendars k
                                          WHERE k.campaign_id = c.id AND k.coordinator_id = p_coordinator_id))
    OR (c.scope = 'network' AND cal.mode = 'network')
    OR (c.scope = 'geo' AND cal.mode = 'local' AND public.calendar_in_campaign_geo(c.id, p_coordinator_id)))
  ORDER BY CASE c.scope WHEN 'calendars' THEN 1 WHEN 'geo' THEN 2 ELSE 3 END, c.paid_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 3), 1), 3)
$$;

REVOKE EXECUTE ON FUNCTION public.get_campaign_sponsors_for_event(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_campaign_sponsors_for_calendar(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_sponsors_for_event(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_sponsors_for_calendar(uuid, integer) TO anon, authenticated, service_role;

-- Reach for a geo quote: counts only.
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
    WHERE e.status = 'approved' AND e.visibility = 'public' AND e.end_time >= now()
      AND p.lat IS NOT NULL
      AND COALESCE(public.coordinator_effective_ad_mode(e.coordinator_id), 'local') = 'local'
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
REVOKE EXECUTE ON FUNCTION public.geo_reach(text, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geo_reach(text, integer, text[]) TO authenticated, service_role;

-- Coordinator view: no price, contact or buyer.
CREATE OR REPLACE FUNCTION public.get_campaigns_on_my_calendar(p_coordinator_id uuid)
RETURNS TABLE (campaign_id uuid, scope public.sponsor_scope, business_name text,
               starts_on date, ends_on date, status public.campaign_status)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_mode text;
BEGIN
  IF NOT (auth.uid() = p_coordinator_id
          OR public.is_workspace_member(auth.uid(), p_coordinator_id)
          OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  v_mode := COALESCE(public.coordinator_effective_ad_mode(p_coordinator_id), 'local');
  RETURN QUERY
  SELECT c.id, c.scope, cr.business_name, c.starts_on, c.ends_on, c.status
  FROM public.sponsor_campaigns c
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  WHERE c.status IN ('active', 'paused') AND c.ends_on >= (now() AT TIME ZONE c.tz)::date
    AND v_mode <> 'ad_free' AND (
         (c.scope = 'event' AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = c.event_id AND e.coordinator_id = p_coordinator_id))
      OR (c.scope = 'calendars' AND EXISTS (SELECT 1 FROM public.sponsor_campaign_calendars k WHERE k.campaign_id = c.id AND k.coordinator_id = p_coordinator_id))
      OR (c.scope = 'network' AND v_mode = 'network')
      OR (c.scope = 'geo' AND v_mode = 'local' AND public.calendar_in_campaign_geo(c.id, p_coordinator_id)))
  ORDER BY c.starts_on;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.get_campaigns_on_my_calendar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaigns_on_my_calendar(uuid) TO authenticated, service_role;

-- Tracking (service role only)
CREATE OR REPLACE FUNCTION public.record_campaign_ad_event(p_campaign_id uuid, p_kind text, p_surface text, p_visitor_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF p_kind NOT IN ('impression', 'click') OR p_surface NOT IN ('embed', 'site')
     OR p_visitor_hash IS NULL OR char_length(p_visitor_hash) NOT BETWEEN 16 AND 64 THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sponsor_campaigns c WHERE c.id = p_campaign_id AND public.campaign_is_live(c)) THEN
    RETURN false;
  END IF;
  INSERT INTO public.sponsor_campaign_stats AS t (campaign_id, kind, surface, stat_date, visitor_hash)
  VALUES (p_campaign_id, p_kind, p_surface, (now() AT TIME ZONE 'UTC')::date, p_visitor_hash)
  ON CONFLICT (campaign_id, kind, surface, stat_date, visitor_hash)
  DO UPDATE SET hits = LEAST(t.hits + 1, 200), last_seen = now();
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_campaign_ad_destination(p_campaign_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT cr.link_url FROM public.sponsor_campaigns c
  JOIN public.sponsor_campaign_creatives cr ON cr.campaign_id = c.id
  WHERE c.id = p_campaign_id AND public.campaign_is_live(c)
$$;
REVOKE EXECUTE ON FUNCTION public.record_campaign_ad_event(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_campaign_ad_destination(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_ad_event(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_ad_destination(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_campaign_stats(p_campaign_id uuid)
RETURNS TABLE (views bigint, unique_viewers bigint, clicks bigint, unique_clickers bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.can_read_campaign(p_campaign_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT COALESCE(sum(s.hits) FILTER (WHERE s.kind = 'impression'), 0)::bigint,
         count(DISTINCT (s.stat_date, s.visitor_hash)) FILTER (WHERE s.kind = 'impression'),
         COALESCE(sum(s.hits) FILTER (WHERE s.kind = 'click'), 0)::bigint,
         count(DISTINCT (s.stat_date, s.visitor_hash)) FILTER (WHERE s.kind = 'click')
  FROM public.sponsor_campaign_stats s WHERE s.campaign_id = p_campaign_id;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.get_campaign_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_stats(uuid) TO authenticated, service_role;

-- Payment state changes (service role only, idempotent)
CREATE OR REPLACE FUNCTION public.mark_campaign_paid(p_campaign_id uuid, p_session_id text, p_payment_intent text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.sponsor_campaigns
  SET status = 'pending_review', paid_at = now(),
      stripe_checkout_session_id = COALESCE(p_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = COALESCE(p_payment_intent, stripe_payment_intent_id)
  WHERE id = p_campaign_id AND status IN ('draft', 'pending_payment') AND paid_at IS NULL;
  RETURN FOUND;
END $fn$;

CREATE OR REPLACE FUNCTION public.mark_campaign_payment_failed(p_campaign_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.sponsor_campaigns SET status = 'draft', stripe_checkout_session_id = NULL
  WHERE id = p_campaign_id AND status = 'pending_payment' AND paid_at IS NULL;
  RETURN FOUND;
END $fn$;

CREATE OR REPLACE FUNCTION public.mark_campaign_refunded(p_payment_intent text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.sponsor_campaigns
  SET refunded_at = now(),
      status = CASE WHEN status = 'rejected' THEN 'rejected'::public.campaign_status ELSE 'refunded'::public.campaign_status END
  WHERE stripe_payment_intent_id = p_payment_intent AND refunded_at IS NULL;
  RETURN FOUND;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.mark_campaign_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_campaign_payment_failed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_campaign_refunded(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_campaign_paid(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_campaign_payment_failed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_campaign_refunded(text) TO service_role;
