
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;

DROP POLICY "Anyone can opt in" ON public.marketing_consent;
CREATE POLICY "Anyone can opt in (pending only)" ON public.marketing_consent
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND confirmed_at IS NULL AND unsubscribed_at IS NULL);
