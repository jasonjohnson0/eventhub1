
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','coordinator','staff','user');
CREATE TYPE public.event_status AS ENUM ('draft','approved','removed');
CREATE TYPE public.slot_status AS ENUM ('available','reserved','paid','expired');
CREATE TYPE public.slot_type AS ENUM ('banner','featured','sidebar');
CREATE TYPE public.payment_status AS ENUM ('pending','succeeded','failed','refunded');
CREATE TYPE public.ban_scope AS ENUM ('user','event');
CREATE TYPE public.rsvp_status AS ENUM ('going','interested','declined');
CREATE TYPE public.share_platform AS ENUM ('facebook','twitter','email','link','other');
CREATE TYPE public.oauth_provider AS ENUM ('google','apple','facebook','email');
CREATE TYPE public.consent_status AS ENUM ('pending','confirmed','unsubscribed');
CREATE TYPE public.staff_role AS ENUM ('coordinator','staff');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are public" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ WORKSPACE STAFF ============
CREATE TABLE public.workspace_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role public.staff_role NOT NULL DEFAULT 'staff',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  invitation_token TEXT UNIQUE,
  invitation_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coordinator_id, invited_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_staff TO authenticated;
GRANT ALL ON public.workspace_staff TO service_role;
ALTER TABLE public.workspace_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coordinator manages own staff" ON public.workspace_staff FOR ALL TO authenticated
  USING (coordinator_id = auth.uid()) WITH CHECK (coordinator_id = auth.uid());
CREATE POLICY "Staff sees own membership" ON public.workspace_staff FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid());
CREATE POLICY "Admins manage staff" ON public.workspace_staff FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER workspace_staff_updated_at BEFORE UPDATE ON public.workspace_staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: is `_user_id` allowed to act on coordinator `_coord_id`'s events?
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _coord_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = _coord_id OR EXISTS (
    SELECT 1 FROM public.workspace_staff
    WHERE coordinator_id = _coord_id AND staff_user_id = _user_id AND accepted_at IS NOT NULL
  );
$$;

-- ============ EVENTS ============
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status public.event_status NOT NULL DEFAULT 'approved',
  removed_reason TEXT,
  removed_by UUID REFERENCES auth.users(id),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX events_coordinator_idx ON public.events(coordinator_id);
CREATE INDEX events_start_time_idx ON public.events(start_time);
CREATE INDEX events_status_idx ON public.events(status);
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads approved events" ON public.events FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "Workspace reads own events" ON public.events FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), coordinator_id));
CREATE POLICY "Workspace inserts events" ON public.events FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), coordinator_id));
CREATE POLICY "Workspace updates events" ON public.events FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), coordinator_id)) WITH CHECK (public.is_workspace_member(auth.uid(), coordinator_id));
CREATE POLICY "Workspace deletes events" ON public.events FOR DELETE TO authenticated USING (public.is_workspace_member(auth.uid(), coordinator_id));
CREATE POLICY "Admins manage events" ON public.events FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ EVENT DETAILS ============
CREATE TABLE public.event_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  landscape_image_url TEXT,
  portrait_image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_details TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_details TO authenticated;
GRANT ALL ON public.event_details TO service_role;
ALTER TABLE public.event_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads details of approved events" ON public.event_details FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'approved'));
CREATE POLICY "Workspace manages details" ON public.event_details FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));
CREATE POLICY "Admins manage details" ON public.event_details FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER event_details_updated_at BEFORE UPDATE ON public.event_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SPONSORED SLOTS ============
CREATE TABLE public.sponsored_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  slot_type public.slot_type NOT NULL DEFAULT 'featured',
  status public.slot_status NOT NULL DEFAULT 'available',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, position)
);
GRANT SELECT ON public.sponsored_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsored_slots TO authenticated;
GRANT ALL ON public.sponsored_slots TO service_role;
ALTER TABLE public.sponsored_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads slots for approved events" ON public.sponsored_slots FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'approved'));
CREATE POLICY "Workspace manages slots" ON public.sponsored_slots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));
CREATE POLICY "Admins manage slots" ON public.sponsored_slots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sponsored_slots_updated_at BEFORE UPDATE ON public.sponsored_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SPONSORS ============
CREATE TABLE public.sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.sponsored_slots(id) ON DELETE CASCADE,
  buyer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  external_name TEXT,
  external_contact TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO authenticated;
GRANT ALL ON public.sponsors TO service_role;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyer sees own sponsorships" ON public.sponsors FOR SELECT TO authenticated USING (buyer_user_id = auth.uid());
CREATE POLICY "Workspace sees sponsors for own events" ON public.sponsors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sponsored_slots s JOIN public.events e ON e.id = s.event_id WHERE s.id = slot_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));
CREATE POLICY "Admins manage sponsors" ON public.sponsors FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ COORDINATOR BILLING SETTINGS ============
CREATE TABLE public.coordinator_billing_settings (
  coordinator_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sponsored_enabled BOOLEAN NOT NULL DEFAULT false,
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.coordinator_billing_settings TO authenticated;
GRANT ALL ON public.coordinator_billing_settings TO service_role;
ALTER TABLE public.coordinator_billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coordinator manages own billing" ON public.coordinator_billing_settings FOR ALL TO authenticated
  USING (coordinator_id = auth.uid()) WITH CHECK (coordinator_id = auth.uid());
CREATE POLICY "Admins manage billing settings" ON public.coordinator_billing_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER coordinator_billing_updated_at BEFORE UPDATE ON public.coordinator_billing_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ BILLING (ledger) ============
CREATE TABLE public.billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sponsor_id UUID REFERENCES public.sponsors(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status public.payment_status NOT NULL DEFAULT 'pending',
  external_ref TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX billing_coord_idx ON public.billing(coordinator_id);
GRANT SELECT ON public.billing TO authenticated;
GRANT ALL ON public.billing TO service_role;
ALTER TABLE public.billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coordinator sees own billing" ON public.billing FOR SELECT TO authenticated USING (coordinator_id = auth.uid());
CREATE POLICY "Admins manage billing" ON public.billing FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER billing_updated_at BEFORE UPDATE ON public.billing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ BANS ============
CREATE TABLE public.bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope public.ban_scope NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  reason TEXT,
  banned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CHECK ((scope = 'user' AND target_user_id IS NOT NULL AND target_event_id IS NULL)
     OR  (scope = 'event' AND target_event_id IS NOT NULL AND target_user_id IS NULL))
);
GRANT SELECT ON public.bans TO authenticated;
GRANT ALL ON public.bans TO service_role;
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own bans" ON public.bans FOR SELECT TO authenticated USING (target_user_id = auth.uid());
CREATE POLICY "Admins manage bans" ON public.bans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ ADMIN AUDIT LOG ============
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  change_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_created_idx ON public.admin_audit_log(created_at DESC);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit log" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ SCHEMA VERSION ============
CREATE TABLE public.schema_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schema_version TO authenticated;
GRANT ALL ON public.schema_version TO service_role;
ALTER TABLE public.schema_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins see schema version" ON public.schema_version FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.schema_version(version, description) VALUES ('1a.0','EventHub Phase 1a initial schema');

-- ============ AUTH OAUTH EMAILS ============
CREATE TABLE public.auth_oauth_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider public.oauth_provider NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  added_to_marketing_list BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, email)
);
GRANT SELECT ON public.auth_oauth_emails TO authenticated;
GRANT ALL ON public.auth_oauth_emails TO service_role;
ALTER TABLE public.auth_oauth_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own oauth emails" ON public.auth_oauth_emails FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage oauth emails" ON public.auth_oauth_emails FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ SOCIAL FOLLOWS ============
CREATE TABLE public.social_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX social_follows_following_idx ON public.social_follows(following_id);
GRANT SELECT ON public.social_follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.social_follows TO authenticated;
GRANT ALL ON public.social_follows TO service_role;
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Follows are public" ON public.social_follows FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users manage own follows" ON public.social_follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "Users unfollow" ON public.social_follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- ============ EVENT RSVPS ============
CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.rsvp_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rsvps TO authenticated;
GRANT ALL ON public.event_rsvps TO service_role;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rsvp" ON public.event_rsvps FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Workspace sees rsvps for own events" ON public.event_rsvps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));
CREATE POLICY "Admins see rsvps" ON public.event_rsvps FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER event_rsvps_updated_at BEFORE UPDATE ON public.event_rsvps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SHARE TRACKING ============
CREATE TABLE public.share_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  share_platform public.share_platform NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX share_tracking_event_idx ON public.share_tracking(event_id);
GRANT INSERT ON public.share_tracking TO anon;
GRANT SELECT, INSERT ON public.share_tracking TO authenticated;
GRANT ALL ON public.share_tracking TO service_role;
ALTER TABLE public.share_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone records a share" ON public.share_tracking FOR INSERT TO anon, authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Users see own shares" ON public.share_tracking FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Workspace sees shares for own events" ON public.share_tracking FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));
CREATE POLICY "Admins see shares" ON public.share_tracking FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ CLICK TRACKING ============
CREATE TABLE public.click_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  click_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  device_type TEXT,
  referrer TEXT,
  UNIQUE(event_id, user_id, click_date)
);
CREATE INDEX click_tracking_event_idx ON public.click_tracking(event_id);
GRANT SELECT, INSERT ON public.click_tracking TO authenticated;
GRANT ALL ON public.click_tracking TO service_role;
ALTER TABLE public.click_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users record own clicks" ON public.click_tracking FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own clicks" ON public.click_tracking FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Workspace sees clicks for own events" ON public.click_tracking FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND public.is_workspace_member(auth.uid(), e.coordinator_id)));
CREATE POLICY "Admins see clicks" ON public.click_tracking FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ MARKETING CONSENT ============
CREATE TABLE public.marketing_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.consent_status NOT NULL DEFAULT 'pending',
  confirmation_token TEXT UNIQUE,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  source TEXT
);
GRANT INSERT ON public.marketing_consent TO anon;
GRANT SELECT, INSERT, UPDATE ON public.marketing_consent TO authenticated;
GRANT ALL ON public.marketing_consent TO service_role;
ALTER TABLE public.marketing_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can opt in" ON public.marketing_consent FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Users see own consent" ON public.marketing_consent FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own consent" ON public.marketing_consent FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage consent" ON public.marketing_consent FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ NEW USER TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider public.oauth_provider;
BEGIN
  INSERT INTO public.profiles(id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;

  -- Capture OAuth email for marketing pipeline (consent still required)
  IF NEW.raw_app_meta_data ? 'provider' AND NEW.email IS NOT NULL THEN
    BEGIN
      v_provider := (NEW.raw_app_meta_data->>'provider')::public.oauth_provider;
    EXCEPTION WHEN invalid_text_representation THEN
      v_provider := NULL;
    END;
    IF v_provider IS NOT NULL THEN
      INSERT INTO public.auth_oauth_emails(user_id, email, provider, verified)
      VALUES (NEW.id, NEW.email, v_provider, COALESCE(NEW.email_confirmed_at IS NOT NULL, false))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
