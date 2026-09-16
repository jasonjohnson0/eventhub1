-- P0 QA finding: "Styling is presets-only, no CSS needed" was accurate, but
-- some coordinators want a specific look presets/color pickers can't express
-- (a font, a border radius, a layout tweak). Adds a coordinator-authored
-- custom CSS field, injected on the public calendar and the embed fragment
-- after the existing theme tokens so it can override them.
--
-- Sanitization (stripping <, @import, expression(, javascript:) happens
-- server-side in saveCoordinatorProfile before this column is ever written,
-- same posture as every other user-authored field on this table -- this
-- migration only adds storage, not a trust boundary.
ALTER TABLE public.coordinator_profiles
  ADD COLUMN IF NOT EXISTS custom_css text;

-- CREATE OR REPLACE cannot add a column to a function's RETURNS TABLE -- the
-- OUT-parameter row type isn't the same type in Postgres's eyes even when
-- every existing column stays put -- so the function has to be dropped first
-- (same reasoning as the show_nearby_events migration before this one).
DROP FUNCTION IF EXISTS public.get_public_coordinator_profile(text);

CREATE FUNCTION public.get_public_coordinator_profile(p_slug text)
RETURNS TABLE (
  coordinator_id uuid,
  slug text,
  company_name text,
  description text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  show_nearby_events boolean,
  custom_css text
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
    cp.secondary_color,
    cp.show_nearby_events,
    cp.custom_css
  FROM public.coordinator_profiles cp
  WHERE cp.slug = p_slug
    AND cp.setup_completed_at IS NOT NULL
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) TO anon, authenticated;
