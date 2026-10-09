-- Generic fixed-window rate-limit bucket for server actions that have no
-- API key to key off of (e.g. anonymous event submission). Same shape as
-- api_rate_buckets, but keyed by an arbitrary text bucket (e.g.
-- "submit_event:ip:1.2.3.4") instead of a coordinator_api_keys UUID, since
-- there's no FK target for an anonymous visitor.
CREATE TABLE IF NOT EXISTS public.anon_rate_buckets (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Only the service-role rate-limit check function touches this.
REVOKE ALL ON public.anon_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.anon_rate_buckets TO service_role;
ALTER TABLE public.anon_rate_buckets ENABLE ROW LEVEL SECURITY;
