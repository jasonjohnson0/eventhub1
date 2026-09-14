-- Lets an admin delete their own calendar (coordinator workspace) in one
-- atomic operation, releasing its slug, without touching their auth.users
-- account -- they keep their login and admin role, they just stop being a
-- coordinator. Every table below references coordinator_id straight to
-- auth.users(id) ON DELETE CASCADE (verified against the live schema, not
-- just migration history), so deleting the auth.users row would work too,
-- but it would also delete the account itself; explicit per-table deletes
-- here are what let the account survive.
--
-- event_submissions is handled explicitly rather than left to its own
-- ON DELETE SET NULL: those rows are that calendar's pending review queue,
-- and leaving them behind (merely detached) would strand submitter emails
-- expecting a decision from a coordinator that no longer exists.
--
-- Every other coordinator-owned table cascades further on its own (events ->
-- sponsored_slots -> sponsors/sponsor_ad_stats, tickets, rsvps, photos,
-- waitlists, invitations, etc.) so deleting `events` itself is sufficient
-- for all of it.

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.delete_own_calendar(_coordinator_id uuid, _confirm_slug text)
RETURNS TABLE (deleted_slug text, deleted_events integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_slug text;
  v_events_count integer;
BEGIN
  SELECT slug INTO v_slug FROM public.coordinator_profiles WHERE coordinator_id = _coordinator_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'No calendar found for this account';
  END IF;
  -- A second, server-side confirmation of the exact address being deleted --
  -- the caller already confirmed once in the UI, but that confirmation is
  -- only as trustworthy as the client sending it; re-checking here is what
  -- actually stops a stale/forged request from deleting the wrong calendar.
  IF v_slug IS DISTINCT FROM _confirm_slug THEN
    RAISE EXCEPTION 'Confirmation did not match this calendar''s address';
  END IF;

  SELECT count(*) INTO v_events_count FROM public.events WHERE coordinator_id = _coordinator_id;

  DELETE FROM public.event_submissions WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.events WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.venues WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.organizers WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.event_series WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.workspace_staff WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.billing WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.coordinator_billing_settings WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.coordinator_ical_feeds WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.event_field_schemas WHERE coordinator_id = _coordinator_id;
  DELETE FROM public.coordinator_profiles WHERE coordinator_id = _coordinator_id;

  RETURN QUERY SELECT v_slug, v_events_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.delete_own_calendar(uuid, text) FROM PUBLIC;
-- service_role only: the TS handler authorizes (caller is admin, deleting
-- their own coordinator_id) before ever invoking this, the same pattern as
-- admin_ban_user and the other admin mutations.
GRANT EXECUTE ON FUNCTION public.delete_own_calendar(uuid, text) TO service_role;

INSERT INTO public.schema_version (version, description)
VALUES ('2h.0', 'delete_own_calendar RPC for the admin calendar-deletion danger zone')
ON CONFLICT DO NOTHING;
