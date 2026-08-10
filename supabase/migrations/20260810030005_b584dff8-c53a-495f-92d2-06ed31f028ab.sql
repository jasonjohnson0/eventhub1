-- Recreate the public view as explicitly SECURITY INVOKER
DROP VIEW IF EXISTS public.public_coordinator_profiles;

CREATE OR REPLACE VIEW public.public_coordinator_profiles
WITH (security_invoker = true) AS
SELECT
  coordinator_id,
  full_name,
  company_name,
  description,
  logo_url,
  favicon_url,
  primary_color,
  secondary_color,
  slug,
  custom_domain,
  website,
  timezone,
  language,
  currency,
  setup_completed_at
FROM public.coordinator_profiles
WHERE setup_completed_at IS NOT NULL;

GRANT SELECT ON public.public_coordinator_profiles TO anon;
GRANT SELECT ON public.public_coordinator_profiles TO authenticated;
