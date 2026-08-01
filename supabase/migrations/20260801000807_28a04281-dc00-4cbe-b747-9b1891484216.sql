ALTER TABLE public.platform_config
  ADD COLUMN IF NOT EXISTS use_custom_stripe BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT;