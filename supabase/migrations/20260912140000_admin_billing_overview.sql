-- Platform-wide billing, for the admin side.
--
-- Belongs to EventHub, Supabase project fopxmuaogwchohwhrclk.
--
-- get_coordinator_billing_status answers for one coordinator and is what that
-- coordinator sees on their own dashboard. Running the platform needs the other
-- shape: every coordinator at once, with who is free because they sold a
-- sponsorship, who is inside their grace window, and who owes money. Without
-- it there is no way to answer "is anybody actually paying us" short of reading
-- three tables by hand.
--
-- Coordinators with no billing row are included deliberately. That is the
-- normal state for an account nobody has priced yet, and it is exactly the set
-- an operator needs to see -- every one of them is running for free.

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_billing_settings') IS NULL
     OR to_regclass('public.coordinator_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_all_coordinator_billing()
RETURNS TABLE (
  coordinator_id UUID,
  company_name TEXT,
  slug TEXT,
  email TEXT,
  state TEXT,
  sponsored_enabled BOOLEAN,
  active_sponsorships INTEGER,
  monthly_fee_cents INTEGER,
  amount_due_cents INTEGER,
  grace_ends_at TIMESTAMPTZ,
  approved_events BIGINT,
  unpaid_cents BIGINT,
  has_billing_row BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Reads every coordinator's commercial position and their email, so it is
  -- admins only. SECURITY DEFINER means RLS is not consulted; the check is
  -- explicit rather than assumed.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH coord AS (
    -- Anyone who has a profile or a billing row counts as a coordinator, so an
    -- account priced before it finished onboarding still appears.
    SELECT cp.coordinator_id FROM public.coordinator_profiles cp
    UNION
    SELECT b.coordinator_id FROM public.coordinator_billing_settings b
  )
  SELECT
    c.coordinator_id,
    p.company_name,
    p.slug,
    u.email::text,
    CASE
      WHEN COALESCE(b.sponsored_enabled, true)
       AND public.count_active_sponsorships(c.coordinator_id, NULL) > 0
        THEN 'free_sponsored'
      WHEN b.grace_ends_at IS NOT NULL AND b.grace_ends_at > now()
        THEN 'grace'
      WHEN COALESCE(b.monthly_fee_cents, 0) <= 0
        THEN 'free_no_fee'
      ELSE 'fee_due'
    END,
    COALESCE(b.sponsored_enabled, true),
    public.count_active_sponsorships(c.coordinator_id, NULL),
    COALESCE(b.monthly_fee_cents, 0),
    CASE
      WHEN COALESCE(b.sponsored_enabled, true)
       AND public.count_active_sponsorships(c.coordinator_id, NULL) > 0 THEN 0
      WHEN b.grace_ends_at IS NOT NULL AND b.grace_ends_at > now() THEN 0
      ELSE COALESCE(b.monthly_fee_cents, 0)
    END,
    b.grace_ends_at,
    (SELECT count(*) FROM public.events e
      WHERE e.coordinator_id = c.coordinator_id AND e.status = 'approved'),
    -- What has actually been invoiced and not settled. The figure that matters
    -- when deciding whether to chase someone.
    COALESCE((SELECT sum(bl.amount_cents) FROM public.billing bl
      WHERE bl.coordinator_id = c.coordinator_id
        AND bl.period_month IS NOT NULL
        AND bl.status = 'pending'), 0)::bigint,
    b.coordinator_id IS NOT NULL
  FROM coord c
  LEFT JOIN public.coordinator_profiles p ON p.coordinator_id = c.coordinator_id
  LEFT JOIN public.coordinator_billing_settings b ON b.coordinator_id = c.coordinator_id
  LEFT JOIN auth.users u ON u.id = c.coordinator_id
  ORDER BY
    -- Money owed first, then the ones running free with no price set: the two
    -- lists an operator acts on.
    CASE
      WHEN COALESCE(b.monthly_fee_cents, 0) > 0
       AND NOT (COALESCE(b.sponsored_enabled, true)
                AND public.count_active_sponsorships(c.coordinator_id, NULL) > 0) THEN 0
      WHEN COALESCE(b.monthly_fee_cents, 0) <= 0 THEN 1
      ELSE 2
    END,
    p.company_name NULLS LAST;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_all_coordinator_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_coordinator_billing() TO authenticated;
