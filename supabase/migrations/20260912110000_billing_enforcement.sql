-- Deciding, and recording, whether a calendar is free this month.
--
-- Belongs to EventHub, Supabase project fopxmuaogwchohwhrclk.
--
-- The offer is that a calendar is free when it carries sponsors and costs money
-- when it does not. coordinator_billing_settings has held sponsored_enabled and
-- monthly_fee_cents since the first migration, and nothing has ever read them:
-- no code path decides who owes anything, and the billing ledger has never been
-- written to. Every coordinator is therefore on the free plan by accident.
--
-- Three decisions are encoded here, because each of them is easy to get wrong
-- quietly and expensive to discover later.
--
-- 1. Having ads *switched on* is not what makes a calendar free -- having a
--    sponsor who actually paid is. Otherwise every coordinator leaves the
--    toggle on, sells nothing, and the platform earns nothing while carrying
--    the hosting.
--
-- 2. A new coordinator is not billed while they are still setting up. Selling a
--    first sponsorship takes longer than a signup flow, and invoicing someone
--    in week one for failing to do it is how a platform loses the customers it
--    just acquired.
--
-- 3. Owing money never switches a calendar off. These calendars are embedded on
--    other people's websites: breaking one punishes the coordinator's visitors
--    and their web host's client, neither of whom owe us anything, and it makes
--    the product unsafe to embed -- which is the entire proposition. Non-payment
--    is recorded and made unmissable in the dashboard. It is not enforced by
--    sabotage.

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_billing_settings') IS NULL
     OR to_regclass('public.billing') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

-- When the free-while-you-get-started window closes.
ALTER TABLE public.coordinator_billing_settings
  ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ;

-- Existing rows get the window measured from when they signed up, not from
-- today -- otherwise applying this migration silently hands a free two months
-- to everyone who has been on the platform for a year.
UPDATE public.coordinator_billing_settings
SET grace_ends_at = created_at + INTERVAL '60 days'
WHERE grace_ends_at IS NULL;

ALTER TABLE public.coordinator_billing_settings
  ALTER COLUMN grace_ends_at SET DEFAULT (now() + INTERVAL '60 days');

-- Which month a ledger row is for. Without it there is no way to ask "has this
-- month already been billed?", and an assessment that runs twice bills twice.
ALTER TABLE public.billing
  ADD COLUMN IF NOT EXISTS period_month DATE;

-- The idempotency key. Partial, so the pre-existing sponsorship rows -- which
-- have no period and are not subscription charges -- are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS billing_coordinator_period_uniq
  ON public.billing(coordinator_id, period_month)
  WHERE period_month IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Counting what actually earns the free plan
-- ---------------------------------------------------------------------------

-- Sponsorships that were live at any point in a given month: paid for, on an
-- approved event belonging to this coordinator, with a run window overlapping
-- the month. A NULL window means "always on", which is how slots sold before
-- scheduling existed are stored.
--
-- Overlap rather than "live right now" is deliberate: a sponsor who ran for the
-- first three weeks of the month earned that month, and clawing the free plan
-- back on the 22nd because their window closed would be indefensible.
CREATE OR REPLACE FUNCTION public.count_active_sponsorships(
  p_coordinator_id UUID,
  p_month DATE DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT count(*)::integer
  FROM public.sponsored_slots sl
  JOIN public.events e ON e.id = sl.event_id
  JOIN public.sponsors s ON s.slot_id = sl.id
  WHERE e.coordinator_id = p_coordinator_id
    AND e.status = 'approved'
    AND sl.status = 'paid'
    AND (
      CASE WHEN p_month IS NULL
        -- No month given means "live right now", which is what the dashboard
        -- shows a coordinator today.
        THEN (sl.starts_at IS NULL OR sl.starts_at <= now())
         AND (sl.ends_at IS NULL OR sl.ends_at >= now())
        -- A month given means "overlapped that month at all".
        ELSE (sl.starts_at IS NULL
              OR sl.starts_at < (date_trunc('month', p_month) + INTERVAL '1 month'))
         AND (sl.ends_at IS NULL
              OR sl.ends_at >= date_trunc('month', p_month))
      END
    );
$fn$;

-- Revoking from PUBLIC is not enough, and this was found the hard way: on the
-- live database anon and authenticated could still execute these afterwards.
-- Supabase's default privileges grant EXECUTE on every new function in public
-- to those roles DIRECTLY, not through PUBLIC, so a REVOKE ... FROM PUBLIC
-- removes a grant that was never the one standing. The roles have to be named.
REVOKE EXECUTE ON FUNCTION public.count_active_sponsorships(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_active_sponsorships(UUID, DATE)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What a coordinator owes, and why
-- ---------------------------------------------------------------------------

-- One answer, with the reasoning attached. A coordinator should never have to
-- guess why their calendar is free this month or what would change that, and
-- support should never have to reconstruct it from three tables.
--
-- states:
--   free_sponsored  a paying sponsor is running; nothing is owed
--   grace           still inside the getting-started window
--   free_no_fee     no monthly fee has been configured for this account
--   fee_due         ads are off, or nobody has bought a slot; the fee applies
CREATE OR REPLACE FUNCTION public.get_coordinator_billing_status(p_coordinator_id UUID)
RETURNS TABLE (
  coordinator_id UUID,
  state TEXT,
  reason TEXT,
  sponsored_enabled BOOLEAN,
  active_sponsorships INTEGER,
  monthly_fee_cents INTEGER,
  amount_due_cents INTEGER,
  grace_ends_at TIMESTAMPTZ,
  grace_days_left INTEGER,
  next_assessment_on DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r RECORD;
  v_active INTEGER;
  v_in_grace BOOLEAN;
  v_state TEXT;
  v_reason TEXT;
  v_due INTEGER;
BEGIN
  IF NOT (auth.uid() = p_coordinator_id
          OR public.is_workspace_member(auth.uid(), p_coordinator_id)
          OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorised to read this billing status'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.coordinator_billing_settings b
  WHERE b.coordinator_id = p_coordinator_id;

  -- No row is the normal state for an account that has never opened billing
  -- settings. Treat it as the advertised default -- ads on, no fee set -- so a
  -- missing row reads as "free", never as an error or an accidental charge.
  IF NOT FOUND THEN
    r.sponsored_enabled := true;
    r.monthly_fee_cents := 0;
    r.grace_ends_at := NULL;
  END IF;

  v_active := public.count_active_sponsorships(p_coordinator_id, NULL);
  v_in_grace := r.grace_ends_at IS NOT NULL AND r.grace_ends_at > now();

  IF r.sponsored_enabled AND v_active > 0 THEN
    v_state := 'free_sponsored';
    v_reason := format('%s sponsor%s running, so this calendar is free.',
                       v_active, CASE WHEN v_active = 1 THEN '' ELSE 's' END);
  ELSIF v_in_grace THEN
    v_state := 'grace';
    v_reason := 'Still in the getting-started window, so nothing is charged yet.';
  ELSIF COALESCE(r.monthly_fee_cents, 0) <= 0 THEN
    v_state := 'free_no_fee';
    v_reason := 'No monthly fee is set on this account.';
  ELSIF NOT r.sponsored_enabled THEN
    v_state := 'fee_due';
    v_reason := 'Sponsors are switched off for this calendar, so the monthly fee applies.';
  ELSE
    v_state := 'fee_due';
    v_reason := 'No sponsor is currently running, so the monthly fee applies.';
  END IF;

  v_due := CASE WHEN v_state = 'fee_due' THEN COALESCE(r.monthly_fee_cents, 0) ELSE 0 END;

  RETURN QUERY SELECT
    p_coordinator_id,
    v_state,
    v_reason,
    COALESCE(r.sponsored_enabled, true),
    v_active,
    COALESCE(r.monthly_fee_cents, 0),
    v_due,
    r.grace_ends_at,
    CASE WHEN v_in_grace
      THEN GREATEST(0, EXTRACT(DAY FROM r.grace_ends_at - now())::integer)
      ELSE 0 END,
    -- A month is only ever assessed once it is over; see assess_coordinator_billing.
    (date_trunc('month', now()) + INTERVAL '1 month')::date;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_coordinator_billing_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_coordinator_billing_status(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Recording it
-- ---------------------------------------------------------------------------

-- Closes one month for one coordinator, writing a pending ledger row if a fee
-- is owed. Returns the amount recorded, or 0.
--
-- Safe to call repeatedly: the unique index on (coordinator_id, period_month)
-- means a retry, an overlapping cron run, or an admin pressing the button twice
-- cannot bill the same month twice. A billing job that is not idempotent is a
-- billing job that eventually double-charges a customer, and that costs more
-- than the month is worth.
--
-- Only closed months are assessed. On the 20th it is not yet knowable whether a
-- sponsor will arrive on the 28th, and billing someone for a month they then
-- earn is a refund, an apology and a lost renewal.
CREATE OR REPLACE FUNCTION public.assess_coordinator_billing(
  p_coordinator_id UUID,
  p_month DATE DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r RECORD;
  v_month DATE;
  v_active INTEGER;
  v_fee INTEGER;
BEGIN
  -- Default to the month that just ended.
  v_month := date_trunc('month',
               COALESCE(p_month, (now() - INTERVAL '1 month')::date))::date;

  IF v_month >= date_trunc('month', now())::date THEN
    RAISE EXCEPTION 'Month % is not over yet', to_char(v_month, 'YYYY-MM')
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.coordinator_billing_settings b
  WHERE b.coordinator_id = p_coordinator_id;

  -- Nothing configured means nothing agreed. Never invent a charge.
  IF NOT FOUND OR COALESCE(r.monthly_fee_cents, 0) <= 0 THEN
    RETURN 0;
  END IF;

  -- The grace window is measured against the end of the month being assessed,
  -- so a coordinator who joined mid-month is not charged for the part of it
  -- that preceded them.
  IF r.grace_ends_at IS NOT NULL
     AND r.grace_ends_at >= (v_month + INTERVAL '1 month') THEN
    RETURN 0;
  END IF;

  v_active := public.count_active_sponsorships(p_coordinator_id, v_month);
  IF r.sponsored_enabled AND v_active > 0 THEN
    RETURN 0;
  END IF;

  v_fee := r.monthly_fee_cents;

  INSERT INTO public.billing
    (coordinator_id, amount_cents, status, period_month, description)
  VALUES (
    p_coordinator_id,
    v_fee,
    'pending',
    v_month,
    CASE WHEN r.sponsored_enabled
      THEN format('Calendar hosting for %s (no sponsor running)', to_char(v_month, 'FMMonth YYYY'))
      ELSE format('Calendar hosting for %s (sponsors switched off)', to_char(v_month, 'FMMonth YYYY'))
    END
  )
  ON CONFLICT (coordinator_id, period_month) WHERE period_month IS NOT NULL
  DO NOTHING;

  -- Zero when the conflict fired, which is the honest answer: this call
  -- recorded nothing.
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  RETURN v_fee;
END;
$fn$;

-- Writing the ledger is the platform's job, never a user's, signed in or not.
REVOKE EXECUTE ON FUNCTION public.assess_coordinator_billing(UUID, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assess_coordinator_billing(UUID, DATE) TO service_role;

-- Closes a month across the platform. Whatever ends up calling this -- a cron,
-- an edge function, an admin button -- gets the same idempotency guarantee, so
-- a half-finished run is simply re-run.
CREATE OR REPLACE FUNCTION public.assess_all_coordinator_billing(p_month DATE DEFAULT NULL)
RETURNS TABLE (coordinators_billed INTEGER, total_cents BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  c RECORD;
  v_amount INTEGER;
  v_count INTEGER := 0;
  v_total BIGINT := 0;
BEGIN
  FOR c IN
    SELECT b.coordinator_id FROM public.coordinator_billing_settings b
    WHERE COALESCE(b.monthly_fee_cents, 0) > 0
  LOOP
    v_amount := public.assess_coordinator_billing(c.coordinator_id, p_month);
    IF v_amount > 0 THEN
      v_count := v_count + 1;
      v_total := v_total + v_amount;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_count, v_total;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.assess_all_coordinator_billing(DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assess_all_coordinator_billing(DATE) TO service_role;
