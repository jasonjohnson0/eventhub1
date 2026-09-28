ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.coordinator_profiles ADD COLUMN IF NOT EXISTS demo_seeded_at timestamptz;

CREATE TABLE public.demo_event_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  location text,
  category public.event_category NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT '{}',
  start_offset interval NOT NULL,
  duration interval NOT NULL
);
GRANT ALL ON public.demo_event_templates TO service_role;
ALTER TABLE public.demo_event_templates ENABLE ROW LEVEL SECURITY;

INSERT INTO public.demo_event_templates (title, description, location, category, tags, start_offset, duration)
SELECT e.title, e.description, e.location, e.category, e.tags,
       e.start_time - date_trunc('day', m.mn), e.end_time - e.start_time
FROM public.events e
CROSS JOIN (SELECT min(start_time) mn FROM public.events
            WHERE coordinator_id = '2c160a98-bbba-41fc-9e31-6ff10d150df0' AND status = 'approved') m
WHERE e.coordinator_id = '2c160a98-bbba-41fc-9e31-6ff10d150df0' AND e.status = 'approved';

CREATE OR REPLACE FUNCTION public.seed_demo_events(_coordinator_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM coordinator_profiles WHERE coordinator_id = _coordinator_id AND demo_seeded_at IS NOT NULL) THEN
    RETURN 0;
  END IF;
  INSERT INTO events (coordinator_id, title, description, location, start_time, end_time, status, category, tags, is_demo)
  SELECT _coordinator_id, t.title, t.description, t.location,
         date_trunc('day', now()) + interval '1 day' + t.start_offset,
         date_trunc('day', now()) + interval '1 day' + t.start_offset + t.duration,
         'approved', t.category, t.tags, true
  FROM demo_event_templates t;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE coordinator_profiles SET demo_seeded_at = now() WHERE coordinator_id = _coordinator_id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.seed_demo_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_events(uuid) TO service_role;