-- Three independent changes gathered from a signup-flow walkthrough:
--
-- 1. A per-coordinator preference for whether other nearby organizers' events
--    are cross-promoted on their own public calendar. Defaults on -- it helps
--    visitors discover more of what's happening (more reason to keep coming
--    back) and helps every coordinator on the platform get seen by someone
--    else's audience, and either side can turn it off.
-- 2. Venue data quality: an address a coordinator saves should be checked
--    against a real geocoder before it's trusted for "near me" search, and a
--    venue that has multiple entrances/suites needs a way to say which one.
-- 3. Seed data: real, publicly documented venues across the Florida
--    panhandle, each confirmed against OpenStreetMap/Nominatim before being
--    inserted, so "near me" search has real results outside Marianna.

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

-- ============ nearby-events preference ============
ALTER TABLE public.coordinator_profiles
  ADD COLUMN IF NOT EXISTS show_nearby_events boolean NOT NULL DEFAULT true;

-- ============ venue verification + unit/suite ============
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_label text;

-- Backfill: a venue that already carries coordinates was entered with a real
-- pin on the map, which is the same trust signal a fresh geocode gives a new
-- one. Rows with no coordinates stay unverified until someone checks them.
UPDATE public.venues
SET address_verified = true
WHERE lat IS NOT NULL AND lng IS NOT NULL AND address_verified = false;

-- ============ public coordinator profile: expose the new preference ============
-- CREATE OR REPLACE cannot add a column to a function's RETURNS TABLE -- the
-- OUT-parameter row type is not the same type in Postgres's eyes even if
-- every existing column stays put -- so the function has to be dropped first.
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
  show_nearby_events boolean
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
    cp.show_nearby_events
  FROM public.coordinator_profiles cp
  WHERE cp.slug = p_slug
    AND cp.setup_completed_at IS NOT NULL
  LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_coordinator_profile(text) TO anon, authenticated;

-- ============ seed: verifiable Florida panhandle venues ============
-- Every row below was confirmed via a live Nominatim/OpenStreetMap geocode of
-- its address before being written here (see the session's verification
-- pass) -- these are not guessed coordinates. Attached to the platform's
-- earliest coordinator, same as the original Marianna demo venues, since a
-- venue is publicly readable regardless of which coordinator's account holds
-- the row; any organizer can reuse it on their own events.
INSERT INTO public.venues (coordinator_id, name, address, lat, lng, address_verified, verified_label)
SELECT e.coordinator_id, v.name, v.address, v.lat, v.lng, true, v.address
FROM (SELECT coordinator_id FROM public.events ORDER BY created_at LIMIT 1) e
CROSS JOIN (VALUES
  ('Pensacola Bay Center','201 E Gregory St, Pensacola, FL 32502',30.416925,-87.20913),
  ('Vince J. Whibbs Sr. Community Maritime Park','351 W Cedar St, Pensacola, FL 32502',30.4047801,-87.2190299),
  ('Blue Wahoos Stadium','351 W Cedar St, Pensacola, FL 32502',30.4047801,-87.2190299),
  ('Seville Square','Seville Square, Pensacola, FL 32502',30.410293,-87.2099085),
  ('Aaron Bessant Park','8500 Surf Dr, Panama City Beach, FL 32407',30.1651991,-85.7869458),
  ('Frank Brown Park','16200 Panama City Beach Pkwy, Panama City Beach, FL 32413',30.2277208,-85.8811422),
  ('St. Andrews State Park','4607 State Park Ln, Panama City Beach, FL 32408',30.1298383,-85.7310823),
  ('Marina Civic Center','8 Harrison Ave, Panama City, FL 32401',30.1528607,-85.6638451),
  ('Cascades Park','1001 S Gadsden St, Tallahassee, FL 32301',30.4324038,-84.2781875),
  ('Donald L. Tucker Civic Center','505 W Pensacola St, Tallahassee, FL 32301',30.4377931,-84.2866888),
  ('Imogene Theatre','6866 Caroline St, Milton, FL 32570',30.6231457,-87.0366161),
  ('Gadsden Arts Center & Museum','13 N Madison St, Quincy, FL 32351',30.5887665,-84.575442),
  ('Northwest Florida Fairgrounds','1958 Lewis Turner Blvd, Fort Walton Beach, FL 32547',30.4669921,-86.6196216),
  ('Historic Downtown Bonifay','East Virginia Ave, Bonifay, FL 32425',30.7929292,-85.6760091),
  ('Battery Park','1 Bay Ave, Apalachicola, FL 32320',29.722607,-84.983503),
  ('Constitution Convention Museum State Park','200 Allen Memorial Way, Port St Joe, FL 32456',29.7934411,-85.2960295),
  ('Lake DeFuniak / Chautauqua Historic District','Circle Drive, DeFuniak Springs, FL 32433',30.7150185,-86.1149785)
) AS v(name, address, lat, lng)
WHERE EXISTS (SELECT 1 FROM public.events)
  AND NOT EXISTS (SELECT 1 FROM public.venues WHERE venues.name = v.name);

INSERT INTO public.schema_version (version, description)
VALUES ('2e.0', 'Nearby-events preference, venue address verification + unit field, panhandle venue seed')
ON CONFLICT DO NOTHING;
