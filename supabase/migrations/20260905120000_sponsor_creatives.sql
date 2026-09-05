-- Sponsor ad creative, and a public read path for it.
--
-- Belongs to EventHub, Supabase project fopxmuaogwchohwhrclk.
--
-- Today a paid sponsorship displays nothing. public.sponsors records who bought
-- a slot and what they paid -- buyer_user_id, external_name, external_contact,
-- cost_cents -- with nowhere to store a logo, a link, or ad copy. The public
-- event page falls back to a hardcoded "Community partner spotlight" string for
-- every sponsor.
--
-- Creative lives in its own table rather than as columns on public.sponsors so
-- the two can have different exposure. sponsors holds commercial terms: what an
-- advertiser paid and how to contact them. That must never be anon-readable.
-- sponsor_creatives holds only what is meant to be shown to the public, so it
-- can be served to anonymous visitors -- including embeds on customer websites
-- -- without leaking the deal behind it.

DO $guard$
BEGIN
  IF to_regclass('public.sponsors') IS NULL
     OR to_regclass('public.sponsored_slots') IS NULL
     OR to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk), which has sponsors, sponsored_slots and events tables. Check the ref in the Supabase dashboard URL.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.sponsor_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL UNIQUE REFERENCES public.sponsors(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  logo_url TEXT,
  link_url TEXT,
  headline TEXT,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Rendered into pages on domains we do not control, so a javascript: or
  -- data: URL here would be a stored XSS vector on a customer's website.
  -- The application escapes on output as well; this stops it at the door.
  CONSTRAINT sponsor_creatives_logo_url_scheme
    CHECK (logo_url IS NULL OR logo_url ~* '^https://'),
  CONSTRAINT sponsor_creatives_link_url_scheme
    CHECK (link_url IS NULL OR link_url ~* '^https://'),
  CONSTRAINT sponsor_creatives_business_name_len
    CHECK (char_length(business_name) BETWEEN 1 AND 120),
  CONSTRAINT sponsor_creatives_headline_len
    CHECK (headline IS NULL OR char_length(headline) <= 120),
  CONSTRAINT sponsor_creatives_body_len
    CHECK (body IS NULL OR char_length(body) <= 400)
);

CREATE INDEX IF NOT EXISTS sponsor_creatives_sponsor_id_idx
  ON public.sponsor_creatives(sponsor_id);

DROP TRIGGER IF EXISTS sponsor_creatives_updated_at ON public.sponsor_creatives;
CREATE TRIGGER sponsor_creatives_updated_at
  BEFORE UPDATE ON public.sponsor_creatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sponsor_creatives ENABLE ROW LEVEL SECURITY;

-- Anonymous readers reach creative only through get_public_sponsors(), which
-- enforces that the slot is paid, inside its run window, and attached to an
-- approved event. Direct table access would expose creative for unpaid,
-- expired, and unapproved placements.
--
-- The REVOKE is not redundant. Supabase ships default privileges that grant
-- anon SELECT on every new table in public, so simply omitting a grant leaves
-- anon holding table-level SELECT with only RLS standing in the way. That is
-- one policy edit away from a leak, so the grant is withdrawn explicitly.
REVOKE ALL ON public.sponsor_creatives FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_creatives TO authenticated;
GRANT ALL ON public.sponsor_creatives TO service_role;

DROP POLICY IF EXISTS "Buyer manages own creative" ON public.sponsor_creatives;
CREATE POLICY "Buyer manages own creative" ON public.sponsor_creatives FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sponsors s
    WHERE s.id = sponsor_id AND s.buyer_user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sponsors s
    WHERE s.id = sponsor_id AND s.buyer_user_id = auth.uid()));

DROP POLICY IF EXISTS "Workspace manages creative for own events" ON public.sponsor_creatives;
CREATE POLICY "Workspace manages creative for own events" ON public.sponsor_creatives FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sponsors s
    JOIN public.sponsored_slots sl ON sl.id = s.slot_id
    JOIN public.events e ON e.id = sl.event_id
    WHERE s.id = sponsor_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sponsors s
    JOIN public.sponsored_slots sl ON sl.id = s.slot_id
    JOIN public.events e ON e.id = sl.event_id
    WHERE s.id = sponsor_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));

DROP POLICY IF EXISTS "Admins manage creative" ON public.sponsor_creatives;
CREATE POLICY "Admins manage creative" ON public.sponsor_creatives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- The public read path. Returns only what is meant to be displayed: never
-- cost_cents, never external_contact, never the buyer's identity.
CREATE OR REPLACE FUNCTION public.get_public_sponsors(p_event_id uuid)
RETURNS TABLE (
  slot_id uuid,
  "position" integer,
  slot_type public.slot_type,
  business_name text,
  logo_url text,
  link_url text,
  headline text,
  body text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sl.id AS slot_id,
    sl.position AS "position",
    sl.slot_type,
    c.business_name,
    c.logo_url,
    c.link_url,
    c.headline,
    c.body
  FROM public.sponsored_slots sl
  JOIN public.events e ON e.id = sl.event_id
  JOIN public.sponsors s ON s.slot_id = sl.id
  JOIN public.sponsor_creatives c ON c.sponsor_id = s.id
  WHERE sl.event_id = p_event_id
    AND e.status = 'approved'
    AND sl.status = 'paid'
    AND (sl.starts_at IS NULL OR sl.starts_at <= now())
    AND (sl.ends_at IS NULL OR sl.ends_at >= now())
  ORDER BY sl.position;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_sponsors(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_sponsors(uuid) TO anon, authenticated;
