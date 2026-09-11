-- Public coordinator lookup by slug, without granting table access.
--
-- /c/$slug resolves a slug to a coordinator through the anon client, but
-- production does not grant anon SELECT on coordinator_profiles. The repo's
-- migration history says it does; the live database disagrees, and the page
-- would 404 for every anonymous visitor.
--
-- Granting the table would fix it and overshare: the "Public can view live
-- coordinator profiles" policy filters rows, not columns, so anon would also
-- read contact_email and custom_domain on every live profile. RLS has no column
-- dimension.
--
-- So this follows the pattern the rest of the codebase already uses for public
-- reads -- get_safe_businesses, get_public_deals, get_public_sponsors -- and
-- returns exactly the columns the public page renders.

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_public_coordinator_profile(p_slug text)
RETURNS TABLE (
  coordinator_id uuid,
  slug text,
  company_name text,
  description text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    cp.coordinator_id,
    cp.slug,
    cp.company_name,
    cp.description,
    cp.logo_url,
    cp.favicon_url,
    cp.primary_color,
    cp.secondary_color
  FROM public.coordinator_profiles cp
  -- An unfinished onboarding has no public calendar. Enforced here rather than
  -- left to the caller, so a future caller cannot forget it.
  WHERE cp.slug = p_slug
    AND cp.setup_completed_at IS NOT NULL
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) TO anon, authenticated;
