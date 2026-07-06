
-- Phase 2d: Communications

DO $$ BEGIN
  CREATE TYPE public.invitation_rsvp_status AS ENUM ('pending', 'going', 'interested', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('reminder', 'announcement', 'update');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- event_invitations
CREATE TABLE IF NOT EXISTS public.event_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sent_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  custom_message TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  rsvp_status public.invitation_rsvp_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS event_invitations_event_idx ON public.event_invitations (event_id);
CREATE INDEX IF NOT EXISTS event_invitations_token_idx ON public.event_invitations (token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_invitations TO authenticated;
GRANT SELECT, UPDATE ON public.event_invitations TO anon; -- open/click pixels via public route
GRANT ALL ON public.event_invitations TO service_role;

ALTER TABLE public.event_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coordinators manage invitations for own events"
  ON public.event_invitations FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_invitations.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_invitations.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ));

CREATE POLICY "Admins manage invitations"
  ON public.event_invitations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER event_invitations_updated_at
  BEFORE UPDATE ON public.event_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_reminders BOOLEAN NOT NULL DEFAULT true,
  push_reminders BOOLEAN NOT NULL DEFAULT false,
  days_before INT[] NOT NULL DEFAULT ARRAY[1, 7],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prefs"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  custom_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON public.user_notifications (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_event_idx ON public.user_notifications (event_id);
CREATE INDEX IF NOT EXISTS user_notifications_pending_idx
  ON public.user_notifications (scheduled_for) WHERE sent_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.user_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.user_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Coordinators manage notifications for own events"
  ON public.user_notifications FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = user_notifications.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = user_notifications.event_id
      AND public.is_workspace_member(auth.uid(), e.coordinator_id)
  ));

CREATE POLICY "Admins manage notifications"
  ON public.user_notifications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_notifications_updated_at
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.schema_version (version, description)
VALUES ('2d.0', 'Phase 2d: communications (invitations, preferences, notifications)')
ON CONFLICT DO NOTHING;
