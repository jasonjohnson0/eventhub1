
CREATE TYPE public.email_provider_type AS ENUM ('lovable','sendgrid','postmark','mailgun','none');

CREATE TABLE public.platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_connect_account_id TEXT,
  stripe_connected BOOLEAN NOT NULL DEFAULT false,
  stripe_connected_at TIMESTAMPTZ,
  email_provider public.email_provider_type NOT NULL DEFAULT 'lovable',
  email_api_key TEXT,
  email_extra JSONB,
  email_from_name TEXT,
  email_from_address TEXT,
  email_configured BOOLEAN NOT NULL DEFAULT false,
  configured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_config TO authenticated;
GRANT ALL ON public.platform_config TO service_role;

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view platform config"
  ON public.platform_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert platform config"
  ON public.platform_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update platform config"
  ON public.platform_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete platform config"
  ON public.platform_config FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.platform_config_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_platform_config_updated_at
  BEFORE UPDATE ON public.platform_config
  FOR EACH ROW EXECUTE FUNCTION public.platform_config_touch_updated_at();

INSERT INTO public.platform_config (email_provider) VALUES ('lovable');
