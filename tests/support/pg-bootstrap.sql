CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), email_confirmed_at timestamptz,
  last_sign_in_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb, phone text, aud text, role text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
-- Supabase does the same for FUNCTIONS, and this line was missing. Without it
-- every REVOKE ... FROM PUBLIC looked like it worked locally while leaving anon
-- holding a direct EXECUTE grant on production -- which is exactly what
-- happened to record_ad_event and assess_all_coordinator_billing.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- pgcrypto isn't installed in this sandbox's Postgres build, so every
-- migration that does `DEFAULT encode(gen_random_bytes(n), 'hex')` (ticket
-- QR tokens, iCal feed tokens, invitation tokens) used to fail here and get
-- silently tolerated by every db test -- meaning ticket_purchases,
-- event_photos, coordinator_ical_feeds etc. never actually existed during a
-- local replay, so nothing could test against them. Not cryptographically
-- secure, but this only ever runs against a throwaway local Postgres, never
-- production (which has real pgcrypto) -- good enough for a unique token in
-- a test fixture.
CREATE OR REPLACE FUNCTION public.gen_random_bytes(_len integer)
RETURNS bytea LANGUAGE sql VOLATILE AS $$
  SELECT decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex')
  FROM generate_series(1, _len)
$$;
