"""Verifies delete_own_calendar() against a real Postgres: it must remove
every table a calendar owns, release the slug, leave the account itself
(and any other coordinator's data) untouched, and refuse a mismatched
confirmation rather than deleting anything."""
import os
import tempfile
import glob
import shutil
import subprocess
import sys

import pgserver

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "tests", "support"))
from pg_temp import temp_pg_uri
uri = temp_pg_uri()

failures = 0


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


sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    sql(open(m).read())

# This sandbox's embedded Postgres ships without the postgis or pgcrypto
# extensions, so event_series's real migration (needs postgis's dependent
# event_category setup) and coordinator_ical_feeds's (needs pgcrypto's
# gen_random_bytes) never actually create those two tables here -- confirmed
# against production directly, both are real tables there with the same
# coordinator_id -> auth.users FK every other table in this list has. Stand
# in minimal versions so delete_own_calendar's own DELETE statements have a
# real relation to run against; this only needs the FK to exist, not the
# extension-dependent columns those tables carry in production.
sql("""
CREATE TABLE IF NOT EXISTS public.event_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL, dtstart timestamptz NOT NULL,
  duration_minutes integer NOT NULL, rrule text NOT NULL, timezone text NOT NULL DEFAULT 'UTC'
);
CREATE TABLE IF NOT EXISTS public.coordinator_ical_feeds (
  coordinator_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
""")

ok, out, err = sql("""
SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname='delete_own_calendar';""")
check("RPC applied", last(out) == "1", err[:200])

ok, _, err = sql(open(f"{REPO}/supabase/migrations/20260914012903_delete_own_calendar.sql").read())
check("migration is safe to re-run", ok, err[:200])

A = "11111111-1111-1111-1111-111111111111"  # the coordinator being deleted
B = "22222222-2222-2222-2222-222222222222"  # a different coordinator, must survive untouched

sql(f"""
INSERT INTO auth.users (id, email) VALUES ('{A}','a@ex.com'), ('{B}','b@ex.com') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('{A}','admin') ON CONFLICT DO NOTHING;

INSERT INTO public.coordinator_profiles (coordinator_id, slug, company_name, setup_completed_at) VALUES
 ('{A}','doomed-calendar','Doomed Co', now()),
 ('{B}','survivor','Survivor Co', now());

INSERT INTO public.events (id, coordinator_id, title, description, location, start_time, end_time, status) VALUES
 ('aaaaaaa1-0000-0000-0000-000000000001','{A}','A event','x','p', now()+interval '1 day', now()+interval '1 day 2 hours','approved'),
 ('bbbbbbb1-0000-0000-0000-000000000001','{B}','B event','x','p', now()+interval '1 day', now()+interval '1 day 2 hours','approved');

INSERT INTO public.venues (coordinator_id, name, address, lat, lng) VALUES
 ('{A}','A Venue','1 Main St', 30.0, -85.0),
 ('{B}','B Venue','2 Main St', 30.0, -85.0);

INSERT INTO public.organizers (coordinator_id, name) VALUES ('{A}','A Org'), ('{B}','B Org');

INSERT INTO public.event_series (id, coordinator_id, title, dtstart, duration_minutes, rrule, timezone) VALUES
 ('cccccc01-0000-0000-0000-000000000001','{A}','A Series', now(), 60, 'FREQ=DAILY', 'UTC');

INSERT INTO public.event_submissions (id, coordinator_id, submitted_by_email, status, event_data) VALUES
 ('dddddd01-0000-0000-0000-000000000001','{A}','submitter@ex.com','pending','{{"title":"Pending"}}'),
 ('dddddd01-0000-0000-0000-000000000002','{B}','submitter@ex.com','pending','{{"title":"Pending B"}}');

INSERT INTO public.coordinator_ical_feeds (coordinator_id) VALUES ('{A}');
""")

ANON_ADMIN_CHECK = f"SELECT role FROM public.user_roles WHERE user_id='{A}';"

# --- a mismatched confirmation deletes nothing ---------------------------------
ok, out, err = sql(f"SELECT * FROM public.delete_own_calendar('{A}'::uuid, 'wrong-slug');")
check("a mismatched confirmation raises", not ok, "expected an error")
ok, out, _ = sql(f"SELECT count(*) FROM public.coordinator_profiles WHERE coordinator_id='{A}';")
check("...and the calendar is still there", last(out) == "1", last(out))

# --- the real deletion ----------------------------------------------------------
ok, out, err = sql(f"SELECT deleted_slug, deleted_events FROM public.delete_own_calendar('{A}'::uuid, 'doomed-calendar');")
check("delete_own_calendar succeeds with the right confirmation", ok, err[:300])
check("it reports the slug and event count it deleted", out.strip() == "doomed-calendar|1", out)

ok, out, _ = sql(f"SELECT count(*) FROM public.coordinator_profiles WHERE coordinator_id='{A}';")
check("the coordinator_profiles row is gone", last(out) == "0", last(out))
ok, out, _ = sql("SELECT count(*) FROM public.coordinator_profiles WHERE slug='doomed-calendar';")
check("the slug is released", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.events WHERE coordinator_id='{A}';")
check("its events are gone", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.venues WHERE coordinator_id='{A}';")
check("its venues are gone", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.organizers WHERE coordinator_id='{A}';")
check("its organizers are gone", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.event_submissions WHERE coordinator_id='{A}';")
check("its pending submissions are gone", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.event_series WHERE coordinator_id='{A}';")
check("its recurring series are gone", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.coordinator_ical_feeds WHERE coordinator_id='{A}';")
check("its iCal feed is gone", last(out) == "0", last(out))

ok, out, _ = sql(f"SELECT count(*) FROM auth.users WHERE id='{A}';")
check("the account itself still exists", last(out) == "1", last(out))
ok, out, _ = sql(ANON_ADMIN_CHECK)
check("...and keeps its admin role", last(out) == "admin", last(out))

# --- a second coordinator's data is completely untouched ------------------------
ok, out, _ = sql(f"SELECT count(*) FROM public.coordinator_profiles WHERE coordinator_id='{B}';")
check("a different coordinator's calendar survives", last(out) == "1", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.events WHERE coordinator_id='{B}';")
check("...and its events survive", last(out) == "1", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.event_submissions WHERE coordinator_id='{B}';")
check("...and its pending submissions survive", last(out) == "1", last(out))

# --- deleting an already-deleted calendar fails cleanly, not silently -----------
ok, out, err = sql(f"SELECT * FROM public.delete_own_calendar('{A}'::uuid, 'doomed-calendar');")
check("deleting a calendar that no longer exists raises, not a silent no-op", not ok, "expected an error")

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
