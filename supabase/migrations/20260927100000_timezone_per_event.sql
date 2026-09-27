-- Gap closure, phase 2: timezone-per-event, made a real invariant.
--
-- Spec 03 (20260914061655) added events.timezone NOT NULL with a coordinator-
-- profile default, but nothing checked that the value is a real IANA zone:
-- every write path accepted any 1-100 character string, and an invalid zone
-- silently rendered as UTC everywhere. This migration:
--   1. repairs any existing invalid value (events and event_series) to the
--      coordinator's own profile zone when THAT is valid, else America/Chicago;
--   2. makes the existing BEFORE INSERT trigger also run on UPDATE OF timezone
--      and reject anything Postgres' own tz database doesn't know by name --
--      so the REST API, MCP tools and direct PostgREST writes are held to the
--      same rule as the form, not just the form;
--   3. guards event_series.timezone the same way (recurrence expands in it);
--   4. returns `timezone` from get_ical_feed_events so the feed can write each
--      event in its own zone with a VTIMEZONE (src/lib/ical.ts).
-- Safe to re-run: every statement is idempotent.

-- A zone is valid iff it's a named entry in pg_timezone_names. Deliberately
-- NOT "does `AT TIME ZONE x` work": that also accepts abbreviations ('EST',
-- 'CDT') and POSIX strings ('UTC+5', whose sign is inverted), none of which
-- are IANA names the app's Intl-based rendering understands the same way.

-- 1. Repair. Coordinator profile zone first (the "org default" the spec asks
-- the backfill to use), only if it is itself valid.
UPDATE public.events e
SET timezone = COALESCE(
  (SELECT cp.timezone FROM public.coordinator_profiles cp
    WHERE cp.coordinator_id = e.coordinator_id
      AND cp.timezone IN (SELECT name FROM pg_timezone_names)),
  'America/Chicago')
WHERE e.timezone IS NULL
   OR e.timezone NOT IN (SELECT name FROM pg_timezone_names);

-- event_series is guarded: in a clean replay of this repo's migration history
-- the table can be absent (its CREATE runs before the event_category type it
-- needs), and a missing optional table must never abort this migration.
DO $$ BEGIN
  IF to_regclass('public.event_series') IS NOT NULL THEN
    UPDATE public.event_series s
    SET timezone = COALESCE(
      (SELECT cp.timezone FROM public.coordinator_profiles cp
        WHERE cp.coordinator_id = s.coordinator_id
          AND cp.timezone IN (SELECT name FROM pg_timezone_names)),
      'America/Chicago')
    WHERE s.timezone IS NULL
       OR s.timezone NOT IN (SELECT name FROM pg_timezone_names);
  END IF;
END $$;

-- 2. events: default (unchanged behavior) + validate, on insert AND on any
-- update that touches the column. Same function name as spec 03's, replaced
-- in place, so its REVOKE and the trigger name existing tests check stay put.
CREATE OR REPLACE FUNCTION public.events_default_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.timezone IS NULL OR NEW.timezone = '' THEN
    SELECT cp.timezone INTO NEW.timezone
    FROM public.coordinator_profiles cp
    WHERE cp.coordinator_id = NEW.coordinator_id
      AND cp.timezone IN (SELECT name FROM pg_timezone_names);
    IF NEW.timezone IS NULL OR NEW.timezone = '' THEN
      NEW.timezone := 'America/Chicago';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid timezone "%": expected an IANA name such as America/Chicago', NEW.timezone
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.events_default_timezone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_default_timezone_trigger ON public.events;
CREATE TRIGGER events_default_timezone_trigger
  BEFORE INSERT OR UPDATE OF timezone ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.events_default_timezone();

-- 3. event_series: validation only (its column keeps its own default).
CREATE OR REPLACE FUNCTION public.event_series_validate_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid timezone "%": expected an IANA name such as America/Chicago', NEW.timezone
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.event_series_validate_timezone() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF to_regclass('public.event_series') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS event_series_validate_timezone_trigger ON public.event_series;
    CREATE TRIGGER event_series_validate_timezone_trigger
      BEFORE INSERT OR UPDATE OF timezone ON public.event_series
      FOR EACH ROW
      EXECUTE FUNCTION public.event_series_validate_timezone();
  END IF;
END $$;

-- 4. iCal feed RPC gains a `timezone` column. A changed OUT signature can't
-- be CREATE OR REPLACEd, so drop and recreate -- then restore exactly the
-- grants migration 20260801191421 left it with: service_role only (the feed
-- route calls it with the admin client; anon/authenticated must not be able
-- to enumerate a feed by guessing tokens through PostgREST).
DROP FUNCTION IF EXISTS public.get_ical_feed_events(TEXT);
CREATE FUNCTION public.get_ical_feed_events(_token TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  event_format public.event_format,
  virtual_link TEXT,
  timezone TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.title, e.description, e.location, e.start_time, e.end_time,
         e.event_format, e.virtual_link, e.timezone
  FROM public.events e
  JOIN public.coordinator_ical_feeds f
    ON f.coordinator_id = e.coordinator_id
  WHERE f.feed_token = _token
    AND e.status = 'approved'
    AND e.visibility = 'public'
  ORDER BY e.start_time;
$$;
REVOKE ALL ON FUNCTION public.get_ical_feed_events(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ical_feed_events(TEXT) TO service_role;
