-- Spec 07: unified email logs. One row per attempted send, across every
-- mail type (invitation/announcement/update/reminder) instead of only
-- invitations being tracked while the others silently never emailed at all.

CREATE TABLE IF NOT EXISTS public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  invitation_id UUID REFERENCES public.event_invitations(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('invitation','announcement','update','reminder')),
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','skipped','simulated','bounced','complained')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every write goes through a server fn on the service-role client (mirrors
-- event_invitations: coordinators never insert/update this table directly),
-- so authenticated only needs SELECT of its own rows.
GRANT SELECT ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators can view their own email sends" ON public.email_sends;
CREATE POLICY "Coordinators can view their own email sends"
  ON public.email_sends FOR SELECT
  TO authenticated
  USING (coordinator_id = auth.uid());

CREATE INDEX IF NOT EXISTS email_sends_coordinator_created_idx
  ON public.email_sends (coordinator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_sends_event_idx
  ON public.email_sends (event_id);
