
INSERT INTO public.schema_version (version, description)
VALUES ('2e.0', 'Distribution: event_format, virtual_link, coordinator_ical_feeds')
ON CONFLICT DO NOTHING;
