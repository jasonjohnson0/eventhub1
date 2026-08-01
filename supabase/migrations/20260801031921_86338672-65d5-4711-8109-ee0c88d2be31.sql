-- ============ coordinator_profiles extensions ============
ALTER TABLE public.coordinator_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS server_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ venues ============
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  lat double precision,
  lng double precision,
  capacity integer,
  phone text,
  website text,
  photo_url text,
  parking_info text,
  accessibility_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT SELECT ON public.venues TO anon;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_public_read" ON public.venues FOR SELECT USING (true);
CREATE POLICY "venues_owner_insert" ON public.venues FOR INSERT TO authenticated WITH CHECK (auth.uid() = coordinator_id);
CREATE POLICY "venues_owner_update" ON public.venues FOR UPDATE TO authenticated USING (auth.uid() = coordinator_id) WITH CHECK (auth.uid() = coordinator_id);
CREATE POLICY "venues_owner_delete" ON public.venues FOR DELETE TO authenticated USING (auth.uid() = coordinator_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER venues_set_updated_at BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
CREATE INDEX IF NOT EXISTS venues_coordinator_idx ON public.venues(coordinator_id);

-- ============ organizers ============
CREATE TABLE IF NOT EXISTS public.organizers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  bio text,
  photo_url text,
  title text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizers TO authenticated;
GRANT SELECT ON public.organizers TO anon;
GRANT ALL ON public.organizers TO service_role;
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizers_public_read" ON public.organizers FOR SELECT USING (true);
CREATE POLICY "organizers_owner_insert" ON public.organizers FOR INSERT TO authenticated WITH CHECK (auth.uid() = coordinator_id);
CREATE POLICY "organizers_owner_update" ON public.organizers FOR UPDATE TO authenticated USING (auth.uid() = coordinator_id) WITH CHECK (auth.uid() = coordinator_id);
CREATE POLICY "organizers_owner_delete" ON public.organizers FOR DELETE TO authenticated USING (auth.uid() = coordinator_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER organizers_set_updated_at BEFORE UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS public.event_organizers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, organizer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_organizers TO authenticated;
GRANT SELECT ON public.event_organizers TO anon;
GRANT ALL ON public.event_organizers TO service_role;
ALTER TABLE public.event_organizers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_organizers_public_read" ON public.event_organizers FOR SELECT USING (true);
CREATE POLICY "event_organizers_owner_write" ON public.event_organizers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));

-- ============ event submissions ============
DO $$ BEGIN
  CREATE TYPE public.submission_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_email text NOT NULL,
  event_data jsonb NOT NULL,
  status public.submission_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_submissions TO authenticated;
GRANT INSERT ON public.event_submissions TO anon;
GRANT ALL ON public.event_submissions TO service_role;
ALTER TABLE public.event_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions_public_insert" ON public.event_submissions FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending');
CREATE POLICY "submissions_reviewer_read" ON public.event_submissions FOR SELECT TO authenticated
  USING (coordinator_id = auth.uid() OR coordinator_id IS NULL OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "submissions_reviewer_update" ON public.event_submissions FOR UPDATE TO authenticated
  USING (coordinator_id = auth.uid() OR coordinator_id IS NULL OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (true);
CREATE TRIGGER event_submissions_set_updated_at BEFORE UPDATE ON public.event_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ============ custom event fields ============
DO $$ BEGIN
  CREATE TYPE public.custom_field_type AS ENUM ('text','dropdown','number','date','checkbox');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.event_field_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_type public.custom_field_type NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_field_schemas TO authenticated;
GRANT SELECT ON public.event_field_schemas TO anon;
GRANT ALL ON public.event_field_schemas TO service_role;
ALTER TABLE public.event_field_schemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field_schemas_public_read" ON public.event_field_schemas FOR SELECT USING (true);
CREATE POLICY "field_schemas_owner_write" ON public.event_field_schemas FOR ALL TO authenticated
  USING (auth.uid() = coordinator_id) WITH CHECK (auth.uid() = coordinator_id);
CREATE TRIGGER event_field_schemas_set_updated_at BEFORE UPDATE ON public.event_field_schemas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS public.event_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.event_field_schemas(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, field_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_field_values TO authenticated;
GRANT SELECT ON public.event_field_values TO anon;
GRANT ALL ON public.event_field_values TO service_role;
ALTER TABLE public.event_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field_values_public_read" ON public.event_field_values FOR SELECT USING (true);
CREATE POLICY "field_values_owner_write" ON public.event_field_values FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));

-- ============ venue link on events ============
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

-- ============ demo data ============
INSERT INTO public.venues (coordinator_id, name, address, lat, lng, capacity, phone, website, parking_info, accessibility_info)
SELECT e.coordinator_id, v.name, v.address, v.lat, v.lng, v.capacity, v.phone, v.website, v.parking, v.access
FROM (SELECT coordinator_id FROM public.events ORDER BY created_at LIMIT 1) e
CROSS JOIN (VALUES
  ('Twin Lakes Recreation Area','4041 Russ St, Marianna, FL 32446', 30.7738, -85.2269, 400, '(850) 482-8061', 'https://jacksoncountyfl.gov', 'Free gravel lot, 120 spaces', 'Paved paths to pavilion, accessible restrooms'),
  ('Endeavor Center','4636 Highway 90, Marianna, FL 32446', 30.7749, -85.2372, 250, '(850) 526-2761', 'https://chipola.edu', 'Attached lot with 8 ADA spaces', 'Elevator, ramp entry, hearing loop'),
  ('Madison Street Park','2896 Madison St, Marianna, FL 32448', 30.7710, -85.2280, 300, '(850) 482-4353', NULL, 'Street parking plus overflow lot', 'Accessible playground and restrooms')
) AS v(name,address,lat,lng,capacity,phone,website,parking,access)
WHERE NOT EXISTS (SELECT 1 FROM public.venues);

INSERT INTO public.organizers (coordinator_id, name, bio, title, credentials, social_links)
SELECT e.coordinator_id, o.name, o.bio, o.title, o.credentials, o.social::jsonb
FROM (SELECT coordinator_id FROM public.events ORDER BY created_at LIMIT 1) e
CROSS JOIN (VALUES
  ('Dr. Alicia Reyes','Small-business strategist who has coached over 400 rural entrepreneurs across the Florida Panhandle.','Masterclass Lead','MBA, SBA Certified Business Advisor','{"linkedin":"https://linkedin.com/in/example","website":"https://example.com"}'),
  ('Marcus Bell','Workshop facilitator specializing in community fundraising and volunteer coordination.','Workshop Facilitator','CFRE, 12 years nonprofit leadership','{"twitter":"https://twitter.com/example"}')
) AS o(name,bio,title,credentials,social)
WHERE NOT EXISTS (SELECT 1 FROM public.organizers);

INSERT INTO public.event_field_schemas (coordinator_id, field_name, field_type, is_required, options, display_order)
SELECT e.coordinator_id, f.name, f.ftype::public.custom_field_type, f.req, f.opts::jsonb, f.ord
FROM (SELECT coordinator_id FROM public.events ORDER BY created_at LIMIT 1) e
CROSS JOIN (VALUES
  ('Difficulty level','dropdown', false, '["Beginner","Intermediate","Advanced"]', 1),
  ('Age group','dropdown', false, '["All ages","Kids","Teens","Adults","Seniors"]', 2)
) AS f(name,ftype,req,opts,ord)
WHERE NOT EXISTS (SELECT 1 FROM public.event_field_schemas);

INSERT INTO public.event_submissions (coordinator_id, submitted_by_email, event_data, status)
SELECT e.coordinator_id, 'volunteer@marianna-arts.org',
  jsonb_build_object(
    'title','Marianna Fall Art Walk',
    'description','Downtown galleries and pop-up booths open late with live music and local food trucks.',
    'location','Downtown Marianna, FL',
    'category','social',
    'start_time', (now() + interval '30 days')::text,
    'end_time', (now() + interval '30 days 4 hours')::text,
    'contact_name','Rita Alvarez'
  ),
  'pending'
FROM (SELECT coordinator_id FROM public.events ORDER BY created_at LIMIT 1) e
WHERE NOT EXISTS (SELECT 1 FROM public.event_submissions);