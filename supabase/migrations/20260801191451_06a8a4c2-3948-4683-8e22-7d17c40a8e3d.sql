DO $$
BEGIN
  EXECUTE 'REVOKE SELECT ON TABLE public.spatial_ref_sys FROM PUBLIC';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipped: not owner of spatial_ref_sys';
END $$;