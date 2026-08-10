-- Revoke broad table-level SELECT from public/anon so we can scope by column
REVOKE SELECT ON public.coordinator_profiles FROM public;

-- Public (anon) may only read the intended public/branding columns
GRANT SELECT (
  coordinator_id, full_name, company_name, description,
  logo_url, favicon_url, primary_color, secondary_color,
  slug, custom_domain, website, timezone, language, currency,
  setup_completed_at, created_at, updated_at
) ON public.coordinator_profiles TO anon;

-- Authenticated users may read all columns of their own/admin rows
GRANT SELECT ON public.coordinator_profiles TO authenticated;

-- Drop the overly broad public policy
DROP POLICY IF EXISTS "Public can view live coordinator profiles" ON public.coordinator_profiles;

-- Anonymous users may read live coordinator branding only
CREATE POLICY "Anon can view live coordinator branding"
ON public.coordinator_profiles
FOR SELECT
TO anon
USING (setup_completed_at IS NOT NULL);

-- Authenticated users may read their own full profile (admins may read all)
DROP POLICY IF EXISTS "Coordinators can view own profile" ON public.coordinator_profiles;
CREATE POLICY "Coordinators can view own profile"
ON public.coordinator_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = coordinator_id OR public.has_role(auth.uid(), 'admin'));
