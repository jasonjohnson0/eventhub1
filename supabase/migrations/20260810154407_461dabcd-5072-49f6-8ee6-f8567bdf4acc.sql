-- 1) Restrict social graph reads to rows involving the current user
DROP POLICY IF EXISTS "Follows visible to signed-in users" ON public.social_follows;
CREATE POLICY "Users can view their own follow relationships"
ON public.social_follows
FOR SELECT
TO authenticated
USING (follower_id = auth.uid() OR following_id = auth.uid());

-- 2) Remove direct client execution of the SECURITY DEFINER check-in function
DROP FUNCTION IF EXISTS public.check_in_ticket(text);

CREATE OR REPLACE FUNCTION public.check_in_ticket(_qr_token text, _actor_id uuid)
RETURNS TABLE(purchase_id uuid, event_id uuid, user_id uuid, check_in_count integer, quantity integer, ticket_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.ticket_purchases%ROWTYPE;
  v_coord UUID;
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_purchase FROM public.ticket_purchases WHERE qr_token = _qr_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  SELECT coordinator_id INTO v_coord FROM public.events WHERE id = v_purchase.event_id;
  IF v_coord IS DISTINCT FROM _actor_id AND NOT public.has_role(_actor_id, 'admin') THEN
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

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;