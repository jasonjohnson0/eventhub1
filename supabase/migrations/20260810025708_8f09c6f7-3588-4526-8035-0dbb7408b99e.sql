-- Remove the view that triggered the security-definer-view linter
DROP VIEW IF EXISTS public.public_profiles;

-- Revoke broad table-level SELECT so we can scope by column
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- Anon users may only read the intended public columns
GRANT SELECT (id, display_name, avatar_url) ON public.profiles TO anon;

-- Authenticated users may read all columns of their own/admin rows
GRANT SELECT ON public.profiles TO authenticated;

-- Restrict row-level reads to own profile or admin
DROP POLICY IF EXISTS "Profiles readable" ON public.profiles;
CREATE POLICY "Profiles readable"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
