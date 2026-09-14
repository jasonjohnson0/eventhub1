-- Defense-in-depth follow-up, not a new feature. Writing spec 09's
-- migration surfaced that this sandbox's own default-privilege setup
-- (ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON
-- TABLES TO anon, authenticated -- mirroring Supabase's real default for
-- newly created tables) means every table this session added *without* an
-- explicit REVOKE first picked up a broader table-level grant than its own
-- GRANT line implied. RLS with a policy for only some commands already
-- blocks the rest correctly (verified directly: an authenticated UPDATE or
-- SELECT against a command with no matching policy touches/returns zero
-- rows, not a privilege bypass) -- this migration doesn't change behavior,
-- it just stops relying solely on "RLS happens to have no policy for this"
-- and matches the explicit-REVOKE convention every SECURITY DEFINER
-- function in this repo already uses.
--
-- Scoped to the two tables from tonight's earlier specs that were missing
-- it (email_sends from spec 07, coordinator_chat_hooks from spec 08). The
-- rest of the schema predates this session and is out of scope for a
-- drive-by hardening pass.

REVOKE ALL ON public.email_sends FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;

REVOKE ALL ON public.coordinator_chat_hooks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordinator_chat_hooks TO authenticated;
GRANT ALL ON public.coordinator_chat_hooks TO service_role;
