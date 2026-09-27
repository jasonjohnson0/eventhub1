"""Gap-closure phase 2: supabase/migrations/20260927100000_timezone_per_event.sql
against a real Postgres.

Replays every migration EXCEPT that one, seeds rows with invalid zones (which
the schema accepted until now), applies it, and checks:
  - the backfill leaves every events/event_series row with a valid IANA zone,
    preferring the coordinator's own (valid) profile zone;
  - inserts/updates with a non-IANA zone are rejected at the table, whoever
    the writer is -- including abbreviations and POSIX strings Postgres would
    otherwise happily interpret;
  - omitted zones still default from the profile (spec 03 behavior kept);
  - get_ical_feed_events returns `timezone` and is still service_role-only;
  - the migration is safe to re-run.
"""
import glob
import os
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "tests", "support"))
from pg_temp import temp_pg_uri  # noqa: E402

uri = temp_pg_uri()
failures = 0
MIGRATION = f"{REPO}/supabase/migrations/20260927100000_timezone_per_event.sql"


def check(name, cond, extra=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f"  <-- {extra}"))
    if not cond:
        failures += 1


def sql(text):
    p = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-X", "-t", "-A", "-f", "-"],
                       input=text, text=True, capture_output=True)
    return p.returncode == 0, p.stdout.strip(), p.stderr.strip()


def last(o):
    return o.splitlines()[-1] if o.splitlines() else ""


sql(open(os.path.join(REPO, "tests", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    if os.path.abspath(m) == os.path.abspath(MIGRATION):
        continue
    if os.path.basename(m) > os.path.basename(MIGRATION):
        continue  # later migrations are replayed after this one, below
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

# event_series needs the event_category enum, which is created by a migration
# that starts with CREATE EXTENSION postgis -- unavailable in this sandbox, so
# that whole file (enum included) is skipped and event_series never gets
# created either. Production has both. Recreate the enum (values copied from
# 20260706034150) and re-apply event_series' own migration, so the series
# checks below run against the real table rather than silently not at all.
ok, out, _ = sql("SELECT to_regclass('public.event_series') IS NOT NULL;")
if last(out) != "t":
    sql("""DO $$ BEGIN
             CREATE TYPE public.event_category AS ENUM
               ('sports','networking','education','social','fundraiser','workshop','other');
           EXCEPTION WHEN duplicate_object THEN NULL; END $$;""")
    ok, _, err = sql(open(glob.glob(f"{REPO}/supabase/migrations/20260706034708_*.sql")[0]).read())
    check("event_series recreated for this test (it exists in production)", ok, err[:200])

GOOD = "11111111-1111-1111-1111-111111111111"   # profile zone America/Denver (valid)
BAD = "22222222-2222-2222-2222-222222222222"    # profile zone 'Mountain Time' (invalid)
NONE = "33333333-3333-3333-3333-333333333333"   # no profile row
ok, _, err = sql(f"""
INSERT INTO auth.users (id,email) VALUES ('{GOOD}','g@ex.com'),('{BAD}','b@ex.com'),('{NONE}','n@ex.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.coordinator_profiles (coordinator_id, timezone) VALUES
  ('{GOOD}','America/Denver'), ('{BAD}','Mountain Time')
ON CONFLICT (coordinator_id) DO UPDATE SET timezone = EXCLUDED.timezone;
INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status, timezone) VALUES
  ('a0000000-0000-4000-8000-000000000001','{GOOD}','bad zone, good profile', now(), now()+interval '1h','approved','Central Time'),
  ('a0000000-0000-4000-8000-000000000002','{BAD}','bad zone, bad profile',  now(), now()+interval '1h','approved','CST'),
  ('a0000000-0000-4000-8000-000000000003','{NONE}','bad zone, no profile',  now(), now()+interval '1h','approved','UTC+5'),
  ('a0000000-0000-4000-8000-000000000004','{GOOD}','already valid',         now(), now()+interval '1h','approved','Asia/Tokyo');
INSERT INTO public.event_series (id, coordinator_id, title, rrule, dtstart, duration_minutes, timezone) VALUES
  ('b0000000-0000-4000-8000-000000000001','{GOOD}','bad series zone','FREQ=WEEKLY', now(), 60, 'Denver');
""")
check("seeded invalid zones (the old schema accepted them)", ok, err[:300])

ok, _, err = sql(open(MIGRATION).read())
check("migration applies", ok, err[:300])
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    if os.path.basename(m) > os.path.basename(MIGRATION):
        sql(open(m).read())
ok, _, err = sql(open(MIGRATION).read())
check("migration is safe to re-run", ok, err[:300])

# ---- backfill ---------------------------------------------------------------
ok, out, _ = sql("SELECT id, timezone FROM public.events WHERE id::text LIKE 'a0000000%' ORDER BY id;")
rows = dict(line.split("|") for line in out.splitlines())
check("invalid zone + valid profile zone -> the coordinator's profile zone",
      rows.get("a0000000-0000-4000-8000-000000000001") == "America/Denver", rows)
check("invalid zone + invalid profile zone -> America/Chicago (never copies the bad profile value)",
      rows.get("a0000000-0000-4000-8000-000000000002") == "America/Chicago", rows)
check("invalid POSIX-style zone + no profile -> America/Chicago",
      rows.get("a0000000-0000-4000-8000-000000000003") == "America/Chicago", rows)
check("an already-valid zone is left alone", rows.get("a0000000-0000-4000-8000-000000000004") == "Asia/Tokyo", rows)
ok, out, _ = sql("SELECT count(*) FROM public.events WHERE timezone IS NULL OR timezone NOT IN (SELECT name FROM pg_timezone_names);")
check("every event now has a non-null, valid IANA zone", last(out) == "0", out)
ok, out, _ = sql("SELECT timezone FROM public.event_series WHERE id='b0000000-0000-4000-8000-000000000001';")
check("an invalid series zone is repaired to the coordinator's profile zone", last(out) == "America/Denver", out)

# ---- the rule holds for every writer ----------------------------------------
def insert_tz(tz):
    return sql(f"""INSERT INTO public.events (coordinator_id, title, start_time, end_time, status, timezone)
                   VALUES ('{GOOD}','x', now(), now()+interval '1h','approved', '{tz}');""")

for tz in ["Central Time", "CDT", "UTC+5", "America/Chicag", "posix nonsense"]:
    ok, _, err = insert_tz(tz)
    check(f"insert with '{tz}' is rejected", not ok and "invalid timezone" in err, err[:200])
for tz in ["America/Chicago", "America/Phoenix", "Asia/Kolkata", "UTC", "Australia/Lord_Howe"]:
    ok, _, err = insert_tz(tz)
    check(f"insert with valid IANA '{tz}' is accepted", ok, err[:200])
ok, _, err = sql("UPDATE public.events SET timezone='Eastern' WHERE id='a0000000-0000-4000-8000-000000000004';")
check("an UPDATE to an invalid zone is rejected too (not just INSERT)", not ok and "invalid timezone" in err, err[:200])
ok, _, err = sql("UPDATE public.events SET title='renamed' WHERE id='a0000000-0000-4000-8000-000000000004';")
check("an UPDATE not touching timezone is unaffected", ok, err[:200])
ok, _, err = sql(f"""INSERT INTO public.event_series (coordinator_id, title, rrule, dtstart, duration_minutes, timezone)
                     VALUES ('{GOOD}','s','FREQ=DAILY', now(), 30, 'Pacific');""")
check("a series with an invalid zone is rejected", not ok and "invalid timezone" in err, err[:200])

# ---- defaulting kept ----------------------------------------------------------
ok, out, err = sql(f"""INSERT INTO public.events (coordinator_id, title, start_time, end_time, status)
                        VALUES ('{GOOD}','omitted', now(), now()+interval '1h','approved') RETURNING timezone;""")
check("an omitted zone still defaults to the coordinator's profile zone", out.splitlines()[:1] == ["America/Denver"], out + err)
ok, out, err = sql(f"""INSERT INTO public.events (coordinator_id, title, start_time, end_time, status)
                        VALUES ('{BAD}','omitted, bad profile', now(), now()+interval '1h','approved') RETURNING timezone;""")
check("...and falls back to America/Chicago when the profile zone is invalid", out.splitlines()[:1] == ["America/Chicago"], out + err)

# ---- iCal RPC -----------------------------------------------------------------
ok, out, err = sql(f"""
INSERT INTO public.coordinator_ical_feeds (coordinator_id, feed_token) VALUES ('{GOOD}', 'feedtoken-0123456789abcdef')
ON CONFLICT DO NOTHING;
SET ROLE service_role;
SELECT timezone FROM public.get_ical_feed_events('feedtoken-0123456789abcdef') WHERE id='a0000000-0000-4000-8000-000000000004';""")
check("get_ical_feed_events returns each event's timezone", last(out) == "Asia/Tokyo", out + " | " + err[:300])
for role in ["anon", "authenticated"]:
    ok, out, err = sql(f"SET ROLE {role}; SELECT count(*) FROM public.get_ical_feed_events('feedtoken-0123456789abcdef');")
    check(f"{role} still cannot call get_ical_feed_events", not ok, out)
ok, out, err = sql("SET ROLE authenticated; SELECT public.event_series_validate_timezone();")
check("the series trigger function is not directly callable", not ok, out)

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
