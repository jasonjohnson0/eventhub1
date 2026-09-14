-- Paid ticketing: real Stripe charge execution (spec docs/specs/01-paid-ticketing.md).
--
-- Adds hold/refund columns to ticket_purchases, a race-safe reservation
-- function so two concurrent buyers can't oversell a tier, and tightens
-- check_in_ticket to reject anything that isn't actually confirmed --
-- previously a pending/cancelled/refunded ticket still checked in fine.

ALTER TABLE public.ticket_purchases
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_stripe_id TEXT;

CREATE INDEX IF NOT EXISTS ticket_purchases_hold_idx
  ON public.ticket_purchases (ticket_id)
  WHERE status = 'pending' AND reserved_until IS NOT NULL;

-- Locks the tier row so two concurrent checkouts can't both see the same
-- "available" count and both succeed. Confirmed sales plus not-yet-expired
-- pending holds both count against availability; an expired hold does not
-- (it was never added to quantity_sold, so there's nothing to release).
CREATE OR REPLACE FUNCTION public.reserve_ticket(
  _ticket_id UUID,
  _user_id UUID,
  _quantity INT,
  _amount_cents INT,
  _hold_minutes INT DEFAULT 30
)
RETURNS public.ticket_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tier public.event_tickets%ROWTYPE;
  v_held INT;
  v_purchase public.ticket_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_tier FROM public.event_tickets WHERE id = _ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_held
    FROM public.ticket_purchases
    WHERE ticket_id = _ticket_id AND status = 'pending' AND reserved_until > now();

  IF v_tier.quantity_sold + v_held + _quantity > v_tier.quantity_available THEN
    RAISE EXCEPTION 'Sold out';
  END IF;

  INSERT INTO public.ticket_purchases (
    ticket_id, event_id, user_id, quantity, amount_cents, status, reserved_until
  ) VALUES (
    _ticket_id, v_tier.event_id, _user_id, _quantity, _amount_cents, 'pending',
    now() + make_interval(mins => _hold_minutes)
  )
  RETURNING * INTO v_purchase;

  RETURN v_purchase;
END;
$$;
-- Revoking from PUBLIC is not enough -- Supabase's default privileges grant
-- EXECUTE on every new function in public to anon/authenticated DIRECTLY,
-- not through PUBLIC (see record_ad_event's migration, found the hard way).
-- Without naming the roles, any signed-in user could call this directly and
-- mint themselves a hold with no Checkout Session behind it.
REVOKE EXECUTE ON FUNCTION public.reserve_ticket(UUID, UUID, INT, INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ticket(UUID, UUID, INT, INT, INT) TO service_role;

-- Confirms a hold once Stripe reports payment succeeded. Only the webhook
-- (service_role) calls this -- a coordinator or buyer confirming their own
-- pending purchase would be able to mint themselves a free ticket.
CREATE OR REPLACE FUNCTION public.confirm_ticket_purchase(
  _purchase_id UUID,
  _stripe_charge_id TEXT
)
RETURNS public.ticket_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_purchase public.ticket_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase FROM public.ticket_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;
  IF v_purchase.status = 'confirmed' THEN
    RETURN v_purchase; -- already confirmed (webhook retry) -- do not double-count
  END IF;
  IF v_purchase.status <> 'pending' THEN
    RAISE EXCEPTION 'Purchase is % , cannot confirm', v_purchase.status;
  END IF;

  UPDATE public.ticket_purchases
    SET status = 'confirmed', stripe_charge_id = _stripe_charge_id, reserved_until = NULL
    WHERE id = _purchase_id
    RETURNING * INTO v_purchase;

  UPDATE public.event_tickets
    SET quantity_sold = quantity_sold + v_purchase.quantity
    WHERE id = v_purchase.ticket_id;

  RETURN v_purchase;
END;
$$;
-- Same reasoning as reserve_ticket above: named roles, not PUBLIC. Letting
-- a buyer call this directly would let them confirm their own unpaid hold
-- with a made-up charge id and get a free ticket.
REVOKE EXECUTE ON FUNCTION public.confirm_ticket_purchase(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_purchase(UUID, TEXT) TO service_role;

-- Releases an expired or abandoned hold. quantity_sold was never
-- incremented for a pending purchase, so there's nothing to decrement --
-- this just stops it counting against availability.
CREATE OR REPLACE FUNCTION public.release_ticket_hold(_purchase_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ticket_purchases
    SET status = 'cancelled', reserved_until = NULL
    WHERE id = _purchase_id AND status = 'pending';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.release_ticket_hold(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ticket_hold(UUID) TO service_role;

-- Refunds a confirmed purchase's inventory hold (the Stripe refund call
-- itself happens in application code -- this function is the DB-side of it,
-- called only after Stripe confirms the refund succeeded).
CREATE OR REPLACE FUNCTION public.mark_ticket_refunded(
  _purchase_id UUID,
  _refund_stripe_id TEXT
)
RETURNS public.ticket_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_purchase public.ticket_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase FROM public.ticket_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RETURN v_purchase; -- already refunded (webhook retry / double click)
  END IF;
  IF v_purchase.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Purchase is %, cannot refund', v_purchase.status;
  END IF;

  UPDATE public.ticket_purchases
    SET status = 'refunded', refunded_at = now(), refund_stripe_id = _refund_stripe_id
    WHERE id = _purchase_id
    RETURNING * INTO v_purchase;

  UPDATE public.event_tickets
    SET quantity_sold = GREATEST(0, quantity_sold - v_purchase.quantity)
    WHERE id = v_purchase.ticket_id;

  RETURN v_purchase;
END;
$$;
-- Named roles again -- a coordinator calling this directly (bypassing the
-- actual Stripe refund) would mark a ticket refunded without any money
-- moving, and reopen inventory for free.
REVOKE EXECUTE ON FUNCTION public.mark_ticket_refunded(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ticket_refunded(UUID, TEXT) TO service_role;

-- A pending/cancelled/refunded ticket used to check in fine -- only a
-- confirmed one should ever scan successfully.
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
  IF v_purchase.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Ticket is % , not valid for check-in', v_purchase.status;
  END IF;
  SELECT coordinator_id INTO v_coord FROM public.events WHERE id = v_purchase.event_id;
  IF v_coord IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to check in this ticket';
  END IF;
  IF v_purchase.check_in_count >= v_purchase.quantity THEN
    RAISE EXCEPTION 'All % ticket(s) already checked in', v_purchase.quantity;
  END IF;
  -- The right-hand side has to be schema-qualified: check_in_count is both
  -- a table column and one of this function's OUT parameters, and the two
  -- are ambiguous to the planner without it (same pitfall existed in the
  -- pre-existing version of this function, apparently never hit because
  -- nothing had reached a confirmed paid check-in before now).
  UPDATE public.ticket_purchases SET check_in_count = ticket_purchases.check_in_count + 1
  WHERE id = v_purchase.id
  RETURNING id, ticket_purchases.event_id, ticket_purchases.user_id, ticket_purchases.check_in_count, ticket_purchases.quantity
  INTO purchase_id, event_id, user_id, check_in_count, quantity;
  SELECT name INTO ticket_name FROM public.event_tickets WHERE id = v_purchase.ticket_id;
  UPDATE public.event_rsvps SET checked_in_at = COALESCE(checked_in_at, now())
    WHERE event_rsvps.event_id = v_purchase.event_id AND event_rsvps.user_id = v_purchase.user_id;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT) TO authenticated;
