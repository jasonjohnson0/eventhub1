-- Impression and click counting for sponsor ads, including anonymous visitors.
--
-- Belongs to EventHub, Supabase project fopxmuaogwchohwhrclk.
--
-- "Free if there are sponsors" only works if an advertiser can be shown what
-- their money bought. Nothing counted ad views until now: click_tracking is
-- about events, not ads, and its user_id is NOT NULL with an INSERT policy of
-- user_id = auth.uid(), so it cannot represent a logged-out visitor at all --
-- which is nearly everyone who sees an ad on a customer's WordPress site.
--
-- Shape: one row per slot, kind, surface, day and visitor, carrying a hit
-- counter. That yields both honest numbers from a single table -- unique
-- viewers is a row count, total views is a sum of hits -- and bounds growth by
-- unique daily visitors rather than by page views.

DO $guard$
BEGIN
  IF to_regclass('public.sponsored_slots') IS NULL
     OR to_regclass('public.sponsor_creatives') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project, or 20260905120000_sponsor_creatives.sql has not been applied. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.sponsor_ad_stats (
  slot_id UUID NOT NULL REFERENCES public.sponsored_slots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- Where it was seen. An advertiser paying for reach on a coordinator's own
  -- website wants to know how much of it came from there rather than from
  -- EventHub, and a coordinator selling the slot wants the same number.
  surface TEXT NOT NULL,
  stat_date DATE NOT NULL,
  -- A salted HMAC of address and user agent, never the address itself. Enough
  -- to tell two visitors apart within a day, useless for identifying anyone,
  -- and nothing here needs a cookie or a consent banner.
  visitor_hash TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_ad_stats_kind_chk CHECK (kind IN ('impression', 'click')),
  CONSTRAINT sponsor_ad_stats_surface_chk CHECK (surface IN ('embed', 'site')),
  CONSTRAINT sponsor_ad_stats_hits_chk CHECK (hits > 0),
  CONSTRAINT sponsor_ad_stats_hash_chk CHECK (char_length(visitor_hash) BETWEEN 16 AND 64),
  PRIMARY KEY (slot_id, kind, surface, stat_date, visitor_hash)
);

-- Reporting reads a date window across many slots; the primary key leads with
-- slot_id and cannot serve that.
CREATE INDEX IF NOT EXISTS sponsor_ad_stats_date_idx
  ON public.sponsor_ad_stats(stat_date, slot_id);

ALTER TABLE public.sponsor_ad_stats ENABLE ROW LEVEL SECURITY;

-- No role reaches this table directly. Writes arrive through record_ad_event()
-- from a server route holding the service key; reads through
-- get_sponsor_ad_stats(), which returns aggregates rather than visitor rows.
-- The REVOKE is not redundant: Supabase's default privileges grant anon SELECT
-- on every new table in public, so omitting a grant leaves anon holding
-- table-level SELECT with only RLS in the way.
REVOKE ALL ON public.sponsor_ad_stats FROM anon, authenticated;
GRANT ALL ON public.sponsor_ad_stats TO service_role;

-- ---------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------

-- Counts one view or click, but only against a placement that is genuinely
-- running: paid for, inside its window, on an approved event. Checking here
-- rather than in the route means a slot that expires mid-flight stops counting
-- immediately, and there is one copy of the rule rather than one per caller.
--
-- Returns true when something was counted, so a caller can tell "not live"
-- from "recorded" without a second query. A pixel ignores the answer and
-- returns an image either way; an advertiser's numbers should never depend on
-- whether their browser rendered a tracking GIF.
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
     OR p_surface NOT IN ('embed', 'site')
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

  -- The unique count is naturally abuse-resistant: hammering the pixel from one
  -- address raises hits on a single row and leaves unique viewers at one. The
  -- total is not, so it is capped. A real person does not see the same ad 200
  -- times in a day, and an advertiser who suspects the totals stops believing
  -- the uniques too.
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

-- Only the service role. This is the one write path, and it is called from a
-- server route that has already decided the request is a real visitor rather
-- than a crawler. Exposing it to anon would let anyone inflate an advertiser's
-- numbers with a loop, which is worse than not counting at all: numbers a
-- coordinator cannot defend are numbers they cannot sell against.
-- Revoking from PUBLIC is not enough, and this was found the hard way: on the
-- live database anon and authenticated could still execute these afterwards.
-- Supabase's default privileges grant EXECUTE on every new function in public
-- to those roles DIRECTLY, not through PUBLIC, so a REVOKE ... FROM PUBLIC
-- removes a grant that was never the one standing. The roles have to be named.
REVOKE EXECUTE ON FUNCTION public.record_ad_event(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_event(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Resolving a click destination
-- ---------------------------------------------------------------------------

-- The click route redirects to whatever this returns, and to nothing else. The
-- destination is never taken from the request: a /api/ad/c/<slot>?to=<url>
-- design would be an open redirect on our own domain, worth real money to a
-- phisher precisely because the link looks like ours. Here the slot id is the
-- only input and the URL comes from the row the advertiser's own creative was
-- checked into, which the sponsor_creatives CHECK constraint already pins to
-- https.
CREATE OR REPLACE FUNCTION public.get_ad_destination(p_slot_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT c.link_url
  FROM public.sponsored_slots sl
  JOIN public.events e ON e.id = sl.event_id
  JOIN public.sponsors s ON s.slot_id = sl.id
  JOIN public.sponsor_creatives c ON c.sponsor_id = s.id
  WHERE sl.id = p_slot_id
    AND e.status = 'approved'
    AND sl.status = 'paid'
    AND (sl.starts_at IS NULL OR sl.starts_at <= now())
    AND (sl.ends_at IS NULL OR sl.ends_at >= now())
    AND c.link_url IS NOT NULL
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_ad_destination(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ad_destination(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

-- What a coordinator shows an advertiser at renewal time, and what tells them
-- whether their calendar is earning its keep.
--
-- Both a total and a unique count are returned for each of views and clicks.
-- Totals flatter; uniques are what an advertiser will believe. A coordinator
-- who quotes a number they cannot defend loses the renewal, so the honest one
-- is given equal billing rather than buried.
CREATE OR REPLACE FUNCTION public.get_sponsor_ad_stats(
  p_coordinator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  slot_id UUID,
  event_id UUID,
  event_title TEXT,
  business_name TEXT,
  "position" INTEGER,
  slot_type public.slot_type,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  views BIGINT,
  unique_viewers BIGINT,
  clicks BIGINT,
  unique_clickers BIGINT,
  views_on_embeds BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_from DATE := (now() AT TIME ZONE 'UTC')::date
                 - LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
BEGIN
  -- SECURITY DEFINER means RLS is not consulted, so the check is explicit.
  -- Without it any signed-in user could read any coordinator's commercial
  -- performance by passing someone else's id.
  IF NOT (public.is_workspace_member(auth.uid(), p_coordinator_id)
          OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorised to read these statistics'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sl.id,
    e.id,
    e.title,
    c.business_name,
    sl.position,
    sl.slot_type,
    sl.starts_at,
    sl.ends_at,
    COALESCE(SUM(st.hits) FILTER (WHERE st.kind = 'impression'), 0)::bigint,
    COUNT(*) FILTER (WHERE st.kind = 'impression')::bigint,
    COALESCE(SUM(st.hits) FILTER (WHERE st.kind = 'click'), 0)::bigint,
    COUNT(*) FILTER (WHERE st.kind = 'click')::bigint,
    COALESCE(SUM(st.hits) FILTER (WHERE st.kind = 'impression'
                                    AND st.surface = 'embed'), 0)::bigint
  FROM public.sponsored_slots sl
  JOIN public.events e ON e.id = sl.event_id
  JOIN public.sponsors s ON s.slot_id = sl.id
  JOIN public.sponsor_creatives c ON c.sponsor_id = s.id
  LEFT JOIN public.sponsor_ad_stats st
    ON st.slot_id = sl.id AND st.stat_date >= v_from
  WHERE e.coordinator_id = p_coordinator_id
    AND sl.status = 'paid'
  GROUP BY sl.id, e.id, e.title, c.business_name, sl.position, sl.slot_type,
           sl.starts_at, sl.ends_at
  ORDER BY COALESCE(SUM(st.hits) FILTER (WHERE st.kind = 'impression'), 0) DESC,
           e.title;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_sponsor_ad_stats(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sponsor_ad_stats(UUID, INTEGER) TO authenticated;

-- The same numbers from the buying side. An advertiser with an account should
-- not have to ask the coordinator how their placement is doing, and a
-- coordinator should not be the only source of the figure that justifies the
-- invoice. No coordinator id is accepted: the caller sees the slots they
-- themselves bought, and nothing else.
CREATE OR REPLACE FUNCTION public.get_my_sponsorship_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  slot_id UUID,
  event_id UUID,
  event_title TEXT,
  event_start TIMESTAMPTZ,
  business_name TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  views BIGINT,
  unique_viewers BIGINT,
  clicks BIGINT,
  unique_clickers BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    sl.id,
    e.id,
    e.title,
    e.start_time,
    c.business_name,
    sl.starts_at,
    sl.ends_at,
    COALESCE(SUM(st.hits) FILTER (WHERE st.kind = 'impression'), 0)::bigint,
    COUNT(*) FILTER (WHERE st.kind = 'impression')::bigint,
    COALESCE(SUM(st.hits) FILTER (WHERE st.kind = 'click'), 0)::bigint,
    COUNT(*) FILTER (WHERE st.kind = 'click')::bigint
  FROM public.sponsors s
  JOIN public.sponsored_slots sl ON sl.id = s.slot_id
  JOIN public.events e ON e.id = sl.event_id
  JOIN public.sponsor_creatives c ON c.sponsor_id = s.id
  LEFT JOIN public.sponsor_ad_stats st
    ON st.slot_id = sl.id
   AND st.stat_date >= (now() AT TIME ZONE 'UTC')::date
                       - LEAST(GREATEST(COALESCE(p_days, 30), 1), 365)
  WHERE s.buyer_user_id = auth.uid()
  GROUP BY sl.id, e.id, e.title, e.start_time, c.business_name, sl.starts_at, sl.ends_at
  ORDER BY e.start_time DESC;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_my_sponsorship_stats(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_sponsorship_stats(INTEGER) TO authenticated;

-- Retention. Per-visitor rows stop being useful long before they stop taking up
-- space, and keeping a visitor fingerprint indefinitely is not defensible even
-- salted. Reporting windows are capped at a year above, so a year is the limit.
-- Nothing schedules this yet; it is here so that when something does, the
-- policy is already written down rather than invented under pressure.
CREATE OR REPLACE FUNCTION public.prune_sponsor_ad_stats(p_keep_days INTEGER DEFAULT 400)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.sponsor_ad_stats
  WHERE stat_date < (now() AT TIME ZONE 'UTC')::date
                    - GREATEST(COALESCE(p_keep_days, 400), 30);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.prune_sponsor_ad_stats(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_sponsor_ad_stats(INTEGER) TO service_role;
