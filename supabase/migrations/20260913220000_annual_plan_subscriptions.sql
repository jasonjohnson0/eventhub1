-- The $100/year coordinator plan: a real, auto-renewing Stripe subscription,
-- tracked in its own table rather than bolted onto coordinator_billing_settings.
--
-- coordinator_billing_settings' own RLS policy ("Coordinator manages own
-- billing" FOR ALL USING (coordinator_id = auth.uid())) lets a coordinator
-- write their own row directly. That's fine for a sponsored_enabled toggle;
-- it is not fine for a field that says whether real money was charged --
-- a coordinator could PATCH their own subscription status to "active" over
-- the REST API and it would silently work. This table is SELECT-only for the
-- coordinator it belongs to; every write comes from the Stripe webhook
-- handler via the service-role client, which is the only thing that should
-- ever be able to say a payment happened.

DO $guard$
BEGIN
  IF to_regclass('public.coordinator_billing_settings') IS NULL THEN
    RAISE EXCEPTION
      'Wrong project. This migration belongs to EventHub (ref fopxmuaogwchohwhrclk).';
  END IF;
END
$guard$;

DO $$ BEGIN
  CREATE TYPE public.annual_plan_status AS ENUM ('none', 'active', 'past_due', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.coordinator_subscriptions (
  coordinator_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  status public.annual_plan_status NOT NULL DEFAULT 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coordinator_subscriptions_stripe_customer_idx
  ON public.coordinator_subscriptions(stripe_customer_id);

-- Read-only for the coordinator it belongs to; no INSERT/UPDATE/DELETE grant
-- to authenticated at all. service_role bypasses RLS by design (see
-- pg-bootstrap: service_role is created NOLOGIN BYPASSRLS), which is the only
-- way this table is ever written to.
GRANT SELECT ON public.coordinator_subscriptions TO authenticated;
GRANT ALL ON public.coordinator_subscriptions TO service_role;
ALTER TABLE public.coordinator_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinator reads own subscription" ON public.coordinator_subscriptions;
CREATE POLICY "Coordinator reads own subscription" ON public.coordinator_subscriptions
  FOR SELECT TO authenticated USING (coordinator_id = auth.uid());
DROP POLICY IF EXISTS "Admins read all subscriptions" ON public.coordinator_subscriptions;
CREATE POLICY "Admins read all subscriptions" ON public.coordinator_subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS coordinator_subscriptions_updated_at ON public.coordinator_subscriptions;
CREATE TRIGGER coordinator_subscriptions_updated_at
  BEFORE UPDATE ON public.coordinator_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

INSERT INTO public.schema_version (version, description)
VALUES ('2f.0', 'Annual $100/year coordinator plan: coordinator_subscriptions table (Stripe-backed, service-role write only)')
ON CONFLICT DO NOTHING;
