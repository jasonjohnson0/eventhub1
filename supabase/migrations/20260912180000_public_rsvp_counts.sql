-- A public RSVP count, so "N going" is not a lie to every anonymous visitor.
--
-- Belongs to EventHub, Supabase project fopxmuaogwchohwhrclk.
--
-- events.$id.tsx counted event_rsvps directly:
--   supabase.from("event_rsvps").select("event_id", { count: "exact", head: true })
--     .eq("event_id", id).eq("status", "going")
--
-- event_rsvps has no anon grant and no anon SELECT policy -- correctly, since a
-- row carries a user_id and belongs to one person. But "Users manage own rsvp"
-- is `USING (user_id = auth.uid())`, which only ever matches the caller's own
-- row, so a direct count reads as zero for every anonymous visitor AND for
-- every signed-in visitor who is not staff or admin on that event. The 401 this
-- throws is silently swallowed by the count coming back null, so "0 going" on a
-- real event that has hundreds of RSVPs looks like a quiet feature, not a bug.
--
-- The fix is the same shape as get_public_sponsors: a SECURITY DEFINER function
-- that returns an aggregate and nothing that identifies who is attending, so it
-- is safe to open to anon. Nobody's presence at an event is itself private here
-- -- only the row-per-person data (who exactly, when they responded) is.

DO $guard$
BEGIN
  IF to_regclass('public.event_rsvps') IS NULL OR to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_event_rsvp_counts(p_event_id uuid)
RETURNS TABLE (
  going integer,
  interested integer,
  declined integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- Only counts for an approved event. A draft or removed event's RSVP
  -- activity is not for public consumption any more than its listing is.
  SELECT
    count(*) FILTER (WHERE r.status = 'going')::integer,
    count(*) FILTER (WHERE r.status = 'interested')::integer,
    count(*) FILTER (WHERE r.status = 'declined')::integer
  FROM public.events e
  LEFT JOIN public.event_rsvps r ON r.event_id = e.id
  WHERE e.id = p_event_id
    AND e.status = 'approved'
  GROUP BY e.id;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_event_rsvp_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_counts(uuid) TO anon, authenticated;

-- The batch form. queries/events.ts enriches up to 500 events per call (the
-- shared loader behind /events, /c/$slug and every calendar view), so calling
-- the single-event RPC once per card is 500 round trips on one page load.
-- Same guarantees, same shape, one call.
CREATE OR REPLACE FUNCTION public.get_event_rsvp_counts_bulk(p_event_ids uuid[])
RETURNS TABLE (
  event_id uuid,
  going integer,
  interested integer,
  declined integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    e.id,
    count(*) FILTER (WHERE r.status = 'going')::integer,
    count(*) FILTER (WHERE r.status = 'interested')::integer,
    count(*) FILTER (WHERE r.status = 'declined')::integer
  FROM public.events e
  LEFT JOIN public.event_rsvps r ON r.event_id = e.id
  -- Capped defensively: this is a public, anon-reachable function, and an
  -- unbounded input array is an unbounded query for a caller who did not even
  -- have to authenticate to send it.
  WHERE e.id = ANY (p_event_ids[1:1000])
    AND e.status = 'approved'
  GROUP BY e.id;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_event_rsvp_counts_bulk(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_counts_bulk(uuid[]) TO anon, authenticated;
