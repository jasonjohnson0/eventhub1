-- Fixes the root cause behind "publish doesn't work": /submit-event had no
-- way to know which coordinator's calendar a visitor was actually on, so
-- submitEvent() fell back to routing every single submission, platform-wide,
-- to whichever coordinator happened to own the oldest event on the entire
-- platform. A Dothan visitor's submission silently landed in an unrelated
-- Jacksonville seed coordinator's queue -- a real insert, just to the wrong
-- coordinator, which is why the Dothan coordinator's own Submissions page
-- stayed empty no matter how many test events were submitted.
--
-- This RPC lets /submit-event offer "which community is this for?" when it
-- isn't reached with a slug already in hand (e.g. from /c/$slug's own
-- "Submit an event" link).

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_public_coordinator_list()
RETURNS TABLE (
  slug text,
  company_name text,
  logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT cp.slug, cp.company_name, cp.logo_url
  FROM public.coordinator_profiles cp
  WHERE cp.setup_completed_at IS NOT NULL
    AND cp.slug IS NOT NULL AND cp.slug <> ''
  ORDER BY cp.company_name NULLS LAST, cp.slug;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_public_coordinator_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_coordinator_list() TO anon, authenticated;

INSERT INTO public.schema_version (version, description)
VALUES ('2g.0', 'get_public_coordinator_list RPC for the tenant-aware /submit-event fix')
ON CONFLICT DO NOTHING;
