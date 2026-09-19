"""Verifies the spec 04 private-events migration against a real Postgres:
the events.visibility column/default/index, and that get_ical_feed_events
excludes unlisted rows while still returning public ones. RLS itself stays
unchanged on purpose (unlisted is a listing filter, not an ACL) -- verified
directly below.

search_events_nearby is also updated by this migration, but its CREATE OR
REPLACE (like its original definition) needs PostGIS types/functions that
aren't installed in this sandbox -- the exact same "(tolerated,
pre-existing)" gap every other db test in this suite already works around
for anything touching event_locations/geom. Since psql -v ON_ERROR_STOP=1
aborts the *rest* of a script on that failure, and search_events_nearby is
the last statement in the migration, everything before it (column, index,
ical function) still applies and commits cleanly -- confirmed below.

See supabase/migrations/20260914070315_private_events.sql.
"""
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


MINE = "20260914070315_private_events.sql"
POSTGIS_GAP = ("postgis", "event_category")  # substrings of the known tolerated failure


def apply_mine():
    ok, out, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
    if not ok and any(s in err for s in POSTGIS_GAP):
        print(f"(tolerated, pre-existing) {MINE}: search_events_nearby needs PostGIS, "
              f"unavailable in this sandbox -- {err[:160]}")
        return "tolerated"
    return ok


sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
others = [m for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")) if MINE not in m]
for m in others:
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

result = apply_mine()
check(f"{MINE} applies (or fails only at the known PostGIS-dependent statement)",
      result is True or result == "tolerated", str(result))

ok, out, err = sql("""
SELECT column_default, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='events' AND column_name='visibility';""")
check("visibility column landed with default 'public' and NOT NULL",
      "'public'" in out and out.endswith("|NO"), out)

ok, out, err = sql("""
SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='events' AND indexname='events_visibility_idx';""")
check("events_visibility_idx exists", last(out) == "1", err[:200])

result2 = apply_mine()
check("migration is safe to re-run (same tolerated-or-clean outcome both times)",
      result2 is True or result2 == "tolerated", str(result2))

# --- fixtures ---------------------------------------------------------------
COORD = "11111111-1111-1111-1111-111111111111"
sql(f"""
INSERT INTO auth.users (id,email) VALUES ('{COORD}','coord@ex.com') ON CONFLICT DO NOTHING;
INSERT INTO public.coordinator_profiles (coordinator_id) VALUES ('{COORD}')
  ON CONFLICT (coordinator_id) DO NOTHING;

INSERT INTO public.coordinator_ical_feeds (coordinator_id, feed_token)
VALUES ('{COORD}', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1')
ON CONFLICT (coordinator_id) DO UPDATE SET feed_token = EXCLUDED.feed_token;

INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status, visibility)
VALUES
  ('11111111-2222-4222-8222-000000000001', '{COORD}', 'Public Picnic', now(), now() + interval '1 hour', 'approved', 'public'),
  ('11111111-2222-4222-8222-000000000002', '{COORD}', 'Secret Book Club', now(), now() + interval '1 hour', 'approved', 'unlisted')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, visibility = EXCLUDED.visibility;
""")

# --- get_ical_feed_events: the one visibility-filtered RPC that doesn't -----
# --- need PostGIS, so it's fully verifiable here -----------------------------
ok, out, err = sql("""
SET ROLE service_role;
SELECT title FROM public.get_ical_feed_events('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1') ORDER BY title;""")
titles = [l for l in out.splitlines() if l and l != "SET"]
check("ical feed includes the public event", "Public Picnic" in titles, str(titles))
check("ical feed excludes the unlisted event", "Secret Book Club" not in titles, str(titles))

# --- RLS is unchanged: a direct-by-id select still finds the unlisted row ----
# (spec 04: unlisted is a listing filter, not an ACL -- the point of this
# migration is that application code filters listings, RLS does not.)
ok, out, err = sql("""
SET ROLE anon;
SELECT title FROM public.events WHERE id = '11111111-2222-4222-8222-000000000002';""")
titles = [l for l in out.splitlines() if l and l != "SET"]
check("RLS still lets anon SELECT an unlisted-but-approved row by id (unlisted != ACL)",
      "Secret Book Club" in titles, str(titles))

# --- new events default to public --------------------------------------------
sql(f"""
INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status)
VALUES ('11111111-2222-4222-8222-000000000003', '{COORD}', 'No visibility specified',
        now(), now() + interval '1 hour', 'approved')
ON CONFLICT (id) DO NOTHING;
""")
ok, out, _ = sql("SELECT visibility FROM public.events WHERE id = '11111111-2222-4222-8222-000000000003';")
check("an insert that omits visibility defaults to public", last(out) == "public", last(out))

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
