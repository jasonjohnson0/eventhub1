-- Spec 03: one-off events get their own IANA timezone, defaulting to the
-- creating coordinator's profile timezone but overridable per event (a
-- coordinator running an out-of-town conference isn't stuck with home-zone
-- timestamps). Recurring series already have event_series.timezone; this
-- gives one-off events the same concept.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';

-- Backfill existing rows from their owning coordinator's profile, not the
-- platform fallback above -- the ADD COLUMN default exists only so this
-- statement (and any insert racing it) never violates NOT NULL.
UPDATE public.events e
SET timezone = cp.timezone
FROM public.coordinator_profiles cp
WHERE cp.coordinator_id = e.coordinator_id
  AND cp.timezone IS NOT NULL
  AND cp.timezone <> '';

-- Drop the column default: with it in place, an INSERT that omits
-- `timezone` gets 'America/Chicago' applied before the BEFORE INSERT
-- trigger below ever sees NEW.timezone, since Postgres substitutes column
-- defaults before running BEFORE triggers -- so the trigger's coordinator
-- lookup would never fire for the common "client didn't set it" case.
-- Without a column default, an omitted value reaches the trigger as NULL.
ALTER TABLE public.events ALTER COLUMN timezone DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.events_default_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.timezone IS NULL OR NEW.timezone = '' THEN
    SELECT timezone INTO NEW.timezone
    FROM public.coordinator_profiles
    WHERE coordinator_id = NEW.coordinator_id;
    IF NEW.timezone IS NULL OR NEW.timezone = '' THEN
      NEW.timezone := 'America/Chicago';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Not RPC-callable (return type TRIGGER makes that impossible anyway), but
-- revoked for the same reason every other function here is: new functions
-- are auto-granted to anon/authenticated by this database's default
-- privileges, and nothing outside a trigger context should be able to call
-- this at all.
REVOKE ALL ON FUNCTION public.events_default_timezone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_default_timezone_trigger ON public.events;
CREATE TRIGGER events_default_timezone_trigger
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.events_default_timezone();
