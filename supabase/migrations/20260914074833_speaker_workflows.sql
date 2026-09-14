-- Spec 06: speaker workflows, on the existing organizer entity rather than a
-- new speakers table (F1) -- bios, photos, socials are identical, a second
-- table would just duplicate coordinators' data entry. `kind` is the
-- profile's default; `role` is per-event and can differ (someone organizes
-- event A and speaks at event B).

DO $$ BEGIN
  CREATE TYPE public.person_kind AS ENUM ('organizer', 'speaker', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS kind public.person_kind NOT NULL DEFAULT 'organizer';

ALTER TABLE public.event_organizers
  ADD COLUMN IF NOT EXISTS role public.person_kind NOT NULL DEFAULT 'organizer';

-- Person pages (/c/$slug/p/$id) need the owning coordinator's slug to link
-- back to the calendar, starting from only the coordinator_id an event
-- carries. Same reverse-of-nothing problem get_public_coordinator_profile
-- solved for slug -> profile; this is profile -> slug. anon has no SELECT on
-- coordinator_profiles (see 20260911130000_public_coordinator_profile.sql),
-- so this can't just be a client-side .eq("coordinator_id", ...) select.
CREATE OR REPLACE FUNCTION public.get_coordinator_slug(p_coordinator_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT cp.slug
  FROM public.coordinator_profiles cp
  WHERE cp.coordinator_id = p_coordinator_id
    AND cp.setup_completed_at IS NOT NULL
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_coordinator_slug(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coordinator_slug(uuid) TO anon, authenticated;
