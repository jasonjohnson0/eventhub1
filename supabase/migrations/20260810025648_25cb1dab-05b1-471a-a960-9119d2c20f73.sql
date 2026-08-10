-- Create a public-safe view for profile data
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, display_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon;
GRANT SELECT ON public.public_profiles TO authenticated;

-- Restrict direct table reads to own profile or admin
DROP POLICY IF EXISTS "Profiles readable" ON public.profiles;
CREATE POLICY "Profiles readable"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
