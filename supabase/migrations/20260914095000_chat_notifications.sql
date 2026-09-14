-- Spec 08: per-coordinator Slack/Discord incoming-webhook notifications.
-- Not stashed into coordinator_profiles.server_config (unused jsonb blob) --
-- a real table so RLS and the settings UI are both obvious, per the spec's
-- own instruction not to hide secrets in an undocumented column.

CREATE TABLE IF NOT EXISTS public.coordinator_chat_hooks (
  coordinator_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_webhook_url TEXT,
  discord_webhook_url TEXT,
  notify_submission BOOLEAN NOT NULL DEFAULT true,
  notify_rsvp_going BOOLEAN NOT NULL DEFAULT false,
  notify_ticket_sold BOOLEAN NOT NULL DEFAULT true,
  notify_event_cancelled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner all; no public read; service_role for the notify path (fired from
-- server-fn/webhook code, not the authenticated user's own request).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordinator_chat_hooks TO authenticated;
GRANT ALL ON public.coordinator_chat_hooks TO service_role;

ALTER TABLE public.coordinator_chat_hooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators manage their own chat hooks" ON public.coordinator_chat_hooks;
CREATE POLICY "Coordinators manage their own chat hooks"
  ON public.coordinator_chat_hooks FOR ALL
  TO authenticated
  USING (coordinator_id = auth.uid())
  WITH CHECK (coordinator_id = auth.uid());

DROP TRIGGER IF EXISTS coordinator_chat_hooks_updated_at ON public.coordinator_chat_hooks;
CREATE TRIGGER coordinator_chat_hooks_updated_at
  BEFORE UPDATE ON public.coordinator_chat_hooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
