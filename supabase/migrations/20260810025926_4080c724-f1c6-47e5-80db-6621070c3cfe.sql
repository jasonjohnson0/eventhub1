-- Drop the overly broad anon table policy
DROP POLICY IF EXISTS "Anon can view live coordinator branding" ON public.coordinator_profiles;

-- Revoke anon direct table access
REVOKE SELECT ON public.coordinator_profiles FROM anon;

-- Public view exposing only branding/safe columns
CREATE OR REPLACE VIEW public.public_coordinator_profiles AS
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

-- Ensure authenticated own-row/admin policy is in place
DROP POLICY IF EXISTS "Coordinators can view own profile" ON public.coordinator_profiles;
CREATE POLICY "Coordinators can view own profile"
ON public.coordinator_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = coordinator_id OR public.has_role(auth.uid(), 'admin'));
