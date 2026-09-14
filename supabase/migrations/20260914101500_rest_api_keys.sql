-- Spec 09: general REST API (/api/v1), authenticated with per-coordinator
-- API keys rather than a cookie session -- server-to-server (Zapier/Make/
-- curl), not a browser. Separate from spec 08's incoming webhooks and from
-- /mcp's OAuth-scoped agent tools (neither of those covers this).

CREATE TABLE IF NOT EXISTS public.coordinator_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,             -- eh_live_abcd1234, for UI lookup only
  secret_hash TEXT NOT NULL,        -- sha256 of the full secret; the secret itself is never stored
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coordinator can see their own keys' metadata (never secret_hash to the
-- client -- server fns strip it before returning); creation/revocation goes
-- through server fns on the service-role client so a client-side insert
-- can't forge a coordinator_id or hand-craft a hash. RLS-with-no-policy
-- already blocks INSERT/UPDATE/DELETE for authenticated even if a broader
-- default-privilege grant is in effect elsewhere, but the explicit REVOKE
-- here is the same defense-in-depth already used on every SECURITY DEFINER
-- function in this repo -- don't rely solely on RLS to catch a privilege
-- this table was never meant to have.
REVOKE ALL ON public.coordinator_api_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coordinator_api_keys TO authenticated;
GRANT ALL ON public.coordinator_api_keys TO service_role;

ALTER TABLE public.coordinator_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators can view their own API keys" ON public.coordinator_api_keys;
CREATE POLICY "Coordinators can view their own API keys"
  ON public.coordinator_api_keys FOR SELECT
  TO authenticated
  USING (coordinator_id = auth.uid());

CREATE INDEX IF NOT EXISTS coordinator_api_keys_prefix_idx ON public.coordinator_api_keys (prefix);

-- Rate limiting (60 req/min/key). A fixed-window counter keyed by key id +
-- minute bucket -- cheap to upsert, self-cleaning by construction (old
-- windows are just never incremented again; a periodic DELETE of rows older
-- than a few hours keeps the table from growing forever, but correctness
-- doesn't depend on that cleanup ever running).
CREATE TABLE IF NOT EXISTS public.api_rate_buckets (
  key_id UUID NOT NULL REFERENCES public.coordinator_api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

-- Only the service-role rate-limit check function touches this; nothing
-- about it needs to be readable by an authenticated coordinator directly.
REVOKE ALL ON public.api_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_rate_buckets TO service_role;
ALTER TABLE public.api_rate_buckets ENABLE ROW LEVEL SECURITY;
