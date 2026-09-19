-- Coordinator-uploaded header background image, plus a real storage quota
-- to go with it. Jason's ask: "their own secure storage based on their
-- login," capped at 12 MB total per coordinator, multiple files allowed as
-- long as the total stays under budget; images target 1920x480 (4:1),
-- capped at 2 MB per file.
--
-- The upload itself goes straight from the browser to Supabase Storage
-- (supabase.storage.from('branding').upload(...), same as the existing
-- logo/favicon flow in onboarding.tsx) -- there is no server function in
-- the middle. That means quota enforcement CANNOT live in application code;
-- a coordinator's own authenticated session already has RLS permission to
-- INSERT into their own folder, so anything short of a database-level check
-- is a check the client can simply not call. Hence the trigger below rather
-- than an app-side pre-check (the app still does a client-side pre-check
-- too, purely for a fast, friendly error instead of a raw Postgres one).

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

ALTER TABLE public.coordinator_profiles
  ADD COLUMN IF NOT EXISTS header_image_url text;

-- ---------------------------------------------------------------------------
-- Close a real cross-tenant read gap found while building this: the existing
-- read policy let ANY signed-in coordinator list/read every OTHER
-- coordinator's branding files directly (bucket_id = 'branding' with no
-- folder scoping at all) -- the only policy on this bucket that wasn't
-- already scoped to the caller's own folder. Public serving of logos and
-- favicons is unaffected: those go out via long-lived signed URLs, which
-- Supabase mints with the service key and are valid independent of the
-- requesting client's own RLS grants.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Branding read for authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Branding read own folder" ON storage.objects;
CREATE POLICY "Branding read own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'branding' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Per-coordinator storage quota for the branding bucket (logo, favicon,
-- header images -- everything under {uid}/ in this one bucket shares the
-- budget). 2 MB per individual file, 12 MB total per coordinator folder.
--
-- Lives in public, not storage: Supabase Cloud's `postgres` role has USAGE
-- on the storage schema but not CREATE -- confirmed directly against
-- production (`has_schema_privilege('postgres','storage','CREATE')` is
-- false), so a brand-new function cannot be created inside it. Existing
-- objects there (a policy or trigger on the existing storage.objects
-- table) can still be added -- that's an operation on a table this role
-- already has rights over, not schema-level DDL. A trigger can call a
-- function in any schema, so the function goes in public (full rights,
-- established all session) and only the TRIGGER attaches to storage.objects.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_branding_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = storage, public
AS $$
DECLARE
  v_folder text;
  v_new_size bigint;
  v_existing_bytes bigint;
  v_per_file_cap bigint := 2 * 1024 * 1024;   -- 2 MB
  v_total_cap bigint := 12 * 1024 * 1024;     -- 12 MB
BEGIN
  IF NEW.bucket_id IS DISTINCT FROM 'branding' THEN
    RETURN NEW;
  END IF;

  v_new_size := COALESCE((NEW.metadata->>'size')::bigint, 0);
  IF v_new_size > v_per_file_cap THEN
    RAISE EXCEPTION 'This file is over the 2 MB limit for a single branding image.'
      USING ERRCODE = '23514';
  END IF;

  v_folder := (storage.foldername(NEW.name))[1];

  -- Sum everything already stored in this coordinator's folder, excluding
  -- the row being replaced (an UPDATE, or an upsert that replaces an
  -- existing path, must not count a file against itself).
  SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0) INTO v_existing_bytes
  FROM storage.objects o
  WHERE o.bucket_id = 'branding'
    AND (storage.foldername(o.name))[1] = v_folder
    AND o.name IS DISTINCT FROM NEW.name;

  IF v_existing_bytes + v_new_size > v_total_cap THEN
    RAISE EXCEPTION 'Branding storage is capped at 12 MB per coordinator -- delete an old image first.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_branding_quota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS branding_quota_check ON storage.objects;
CREATE TRIGGER branding_quota_check
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_branding_quota();

-- ---------------------------------------------------------------------------
-- Expose header_image_url through the same public RPC that already carries
-- logo/favicon/custom_css -- same DROP-then-CREATE requirement as the two
-- migrations before this one: CREATE OR REPLACE cannot add an OUT column to
-- an existing RETURNS TABLE function.
-- ---------------------------------------------------------------------------
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
  custom_css text,
  header_image_url text
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
    cp.custom_css,
    cp.header_image_url
  FROM public.coordinator_profiles cp
  WHERE cp.slug = p_slug
    AND cp.setup_completed_at IS NOT NULL
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) TO anon, authenticated;
