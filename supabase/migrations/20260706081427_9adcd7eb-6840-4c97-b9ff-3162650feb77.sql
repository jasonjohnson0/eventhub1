
INSERT INTO public.schema_version (version, description) VALUES ('2f.0', 'Monetization: tickets, purchases, photos, analytics') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.event_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  quantity_available INT NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_sold INT NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  early_bird BOOLEAN NOT NULL DEFAULT false,
  early_bird_price_cents INT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tickets TO authenticated;
GRANT SELECT ON public.event_tickets TO anon;
GRANT ALL ON public.event_tickets TO service_role;
ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets_public_view" ON public.event_tickets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'approved'));
CREATE POLICY "tickets_coord_manage" ON public.event_tickets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));
CREATE POLICY "tickets_admin_manage" ON public.event_tickets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_event_tickets_event ON public.event_tickets(event_id);
CREATE TRIGGER trg_event_tickets_updated BEFORE UPDATE ON public.event_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ticket_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.event_tickets(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount_cents INT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  stripe_charge_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','refunded','cancelled')),
  qr_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex') UNIQUE,
  check_in_count INT NOT NULL DEFAULT 0,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_purchases TO authenticated;
GRANT ALL ON public.ticket_purchases TO service_role;
ALTER TABLE public.ticket_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_view_own" ON public.ticket_purchases FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "purchases_view_coord" ON public.ticket_purchases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));
CREATE POLICY "purchases_create_own" ON public.ticket_purchases FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "purchases_update_coord" ON public.ticket_purchases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));
CREATE POLICY "purchases_admin_manage" ON public.ticket_purchases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_purchases_event ON public.ticket_purchases(event_id);
CREATE INDEX idx_purchases_user ON public.ticket_purchases(user_id);
CREATE INDEX idx_purchases_qr ON public.ticket_purchases(qr_token);

CREATE TABLE public.event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_photos TO authenticated;
GRANT SELECT ON public.event_photos TO anon;
GRANT ALL ON public.event_photos TO service_role;
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos_public_view" ON public.event_photos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status = 'approved'));
CREATE POLICY "photos_upload" ON public.event_photos FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "photos_delete" ON public.event_photos FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.coordinator_id = auth.uid()));
CREATE INDEX idx_event_photos_event ON public.event_photos(event_id);

CREATE OR REPLACE VIEW public.event_analytics
WITH (security_invoker = true) AS
SELECT
  e.id AS event_id,
  e.title,
  e.coordinator_id,
  e.start_time,
  e.max_capacity,
  COALESCE((SELECT COUNT(*) FROM public.click_tracking c WHERE c.event_id = e.id), 0) AS view_count,
  COALESCE((SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.status = 'going'), 0) AS rsvp_going,
  COALESCE((SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested'), 0) AS rsvp_interested,
  COALESCE((SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.status = 'declined'), 0) AS rsvp_declined,
  COALESCE((SELECT COUNT(*) FROM public.event_waitlist w WHERE w.event_id = e.id AND w.status = 'waitlisted'), 0) AS rsvp_waitlist,
  COALESCE((SELECT SUM(amount_cents) FROM public.ticket_purchases tp WHERE tp.event_id = e.id AND tp.status = 'confirmed'), 0)::bigint AS ticket_revenue_cents,
  COALESCE((SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.checked_in_at IS NOT NULL), 0) AS check_ins,
  CASE
    WHEN COALESCE((SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.status = 'going'), 0) = 0 THEN 0
    ELSE ROUND(100.0 * (SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.checked_in_at IS NOT NULL)::numeric
              / (SELECT COUNT(*) FROM public.event_rsvps r WHERE r.event_id = e.id AND r.status = 'going')::numeric, 1)
  END AS attendance_rate_pct
FROM public.events e;
GRANT SELECT ON public.event_analytics TO authenticated;
GRANT SELECT ON public.event_analytics TO service_role;

CREATE OR REPLACE FUNCTION public.check_in_ticket(_qr_token TEXT)
RETURNS TABLE(purchase_id UUID, event_id UUID, user_id UUID, check_in_count INT, quantity INT, ticket_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_purchase public.ticket_purchases%ROWTYPE;
  v_coord UUID;
BEGIN
  SELECT * INTO v_purchase FROM public.ticket_purchases WHERE qr_token = _qr_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  SELECT coordinator_id INTO v_coord FROM public.events WHERE id = v_purchase.event_id;
  IF v_coord IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to check in this ticket';
  END IF;
  IF v_purchase.check_in_count >= v_purchase.quantity THEN
    RAISE EXCEPTION 'All % ticket(s) already checked in', v_purchase.quantity;
  END IF;
  UPDATE public.ticket_purchases SET check_in_count = check_in_count + 1 WHERE id = v_purchase.id
  RETURNING id, ticket_purchases.event_id, ticket_purchases.user_id, ticket_purchases.check_in_count, ticket_purchases.quantity
  INTO purchase_id, event_id, user_id, check_in_count, quantity;
  SELECT name INTO ticket_name FROM public.event_tickets WHERE id = v_purchase.ticket_id;
  UPDATE public.event_rsvps SET checked_in_at = COALESCE(checked_in_at, now())
    WHERE event_rsvps.event_id = v_purchase.event_id AND event_rsvps.user_id = v_purchase.user_id;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT) TO authenticated;
