CREATE TABLE public.coordinator_profiles (
  coordinator_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  contact_email text,
  company_name text,
  description text,
  logo_url text,
  favicon_url text,
  primary_color text NOT NULL DEFAULT '#f97316',
  secondary_color text NOT NULL DEFAULT '#06b6d4',
  slug text UNIQUE,
  custom_domain text,
  email_provider public.email_provider_type NOT NULL DEFAULT 'lovable',
  dns_records_acknowledged boolean NOT NULL DEFAULT false,
  setup_step integer NOT NULL DEFAULT 1,
  setup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordinator_profiles TO authenticated;
GRANT SELECT ON public.coordinator_profiles TO anon;
GRANT ALL ON public.coordinator_profiles TO service_role;

ALTER TABLE public.coordinator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view live coordinator profiles"
  ON public.coordinator_profiles FOR SELECT
  USING (setup_completed_at IS NOT NULL);

CREATE POLICY "Coordinators can view own profile"
  ON public.coordinator_profiles FOR SELECT TO authenticated
  USING (auth.uid() = coordinator_id);

CREATE POLICY "Coordinators can insert own profile"
  ON public.coordinator_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = coordinator_id);

CREATE POLICY "Coordinators can update own profile"
  ON public.coordinator_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = coordinator_id)
  WITH CHECK (auth.uid() = coordinator_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER update_coordinator_profiles_updated_at
  BEFORE UPDATE ON public.coordinator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.is_slug_available(_slug text, _coordinator_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.coordinator_profiles
    WHERE lower(slug) = lower(_slug)
      AND (_coordinator_id IS NULL OR coordinator_id <> _coordinator_id)
  );
$$;