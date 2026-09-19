"""Verifies the coordinator-scoped sponsor RPC against a real Postgres."""
import os
import tempfile
import glob
import shutil
import subprocess
import sys

import pgserver

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Outside the repo on purpose: an embedded Postgres data directory is ~40MB
# of files owned by another user, which git cannot read and eslint walks.
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

ok, out, _ = sql("""
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('get_public_sponsors','get_public_coordinator_sponsors');""")
check("both sponsor RPCs applied", last(out) == "2", last(out))

ok, _, err = sql(open(f"{REPO}/supabase/migrations/20260911120000_coordinator_sponsors.sql").read())
check("migration is safe to re-run", ok, err[:200])

A = "11111111-1111-1111-1111-111111111111"   # our coordinator
B = "22222222-2222-2222-2222-222222222222"   # a different coordinator

sql(f"""
INSERT INTO auth.users (id,email) VALUES ('{A}','a@ex.com'),('{B}','b@ex.com') ON CONFLICT DO NOTHING;

INSERT INTO public.events (id, coordinator_id, title, description, location, start_time, end_time, status) VALUES
 ('aaaaaaa1-0000-0000-0000-000000000001','{A}','Soonest','x','p', now()+interval '1 day', now()+interval '1 day 2 hours','approved'),
 ('aaaaaaa1-0000-0000-0000-000000000002','{A}','Later','x','p',  now()+interval '9 days', now()+interval '9 days 2 hours','approved'),
 ('aaaaaaa1-0000-0000-0000-000000000003','{A}','Draft','x','p',  now()+interval '3 days', now()+interval '3 days 2 hours','draft'),
 ('bbbbbbb1-0000-0000-0000-000000000001','{B}','Other coordinator','x','p', now()+interval '2 days', now()+interval '2 days 2 hours','approved');
""")
sql("""
INSERT INTO public.sponsored_slots (id, event_id, position, slot_type, status, cost_cents) VALUES
 ('51000000-0000-0000-0000-000000000001','aaaaaaa1-0000-0000-0000-000000000002',1,'banner','paid',1000),
 ('51000000-0000-0000-0000-000000000002','aaaaaaa1-0000-0000-0000-000000000001',1,'featured','paid',2000),
 ('51000000-0000-0000-0000-000000000003','aaaaaaa1-0000-0000-0000-000000000001',2,'sidebar','available',500),
 ('51000000-0000-0000-0000-000000000004','aaaaaaa1-0000-0000-0000-000000000003',1,'banner','paid',700),
 ('51000000-0000-0000-0000-000000000005','bbbbbbb1-0000-0000-0000-000000000001',1,'banner','paid',900);

INSERT INTO public.sponsors (id, slot_id, external_name, external_contact, cost_cents) VALUES
 ('52000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','Later Co','later@ex.com',1000),
 ('52000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','Soonest Co','soon@ex.com',2000),
 ('52000000-0000-0000-0000-000000000004','51000000-0000-0000-0000-000000000004','Draft Co','draft@ex.com',700),
 ('52000000-0000-0000-0000-000000000005','51000000-0000-0000-0000-000000000005','Other Co','other@ex.com',900);

INSERT INTO public.sponsor_creatives (sponsor_id, business_name, link_url) VALUES
 ('52000000-0000-0000-0000-000000000001','Later Co','https://later.example'),
 ('52000000-0000-0000-0000-000000000002','Soonest Co','https://soon.example'),
 ('52000000-0000-0000-0000-000000000004','Draft Co','https://draft.example'),
 ('52000000-0000-0000-0000-000000000005','Other Co','https://other.example');
""")

ANON = "SET ROLE anon;\n"
ok, out, err = sql(ANON + f"SELECT business_name FROM public.get_public_coordinator_sponsors('{A}', 10);")
check("anon can call the coordinator RPC", ok, err[:200])
names = [l for l in out.splitlines() if l and l != "SET"]
check("returns only this coordinator's paid, approved sponsors",
      names == ["Soonest Co", "Later Co"], str(names))
check("orders by event start time", names[:1] == ["Soonest Co"], str(names))
check("excludes another coordinator", "Other Co" not in names, str(names))
check("excludes unapproved events", "Draft Co" not in names, str(names))

ok, out, _ = sql(ANON + f"SELECT count(*) FROM public.get_public_coordinator_sponsors('{A}', 1);")
check("limit is honoured", last(out) == "1", last(out))

ok, out, _ = sql(ANON + f"SELECT count(*) FROM public.get_public_coordinator_sponsors('{A}', 9999);")
check("limit is capped server-side", last(out) == "2", last(out))

ok, out, _ = sql(ANON + f"""
SELECT count(*) FROM public.get_public_coordinator_sponsors('{A}', 10) s
WHERE s::text ILIKE '%@ex.com%';""")
check("never leaks advertiser contact", last(out) == "0", last(out))

ok, out, _ = sql("""
SELECT string_agg(p.attname, ',' ORDER BY p.attname) FROM (
  SELECT a.attname FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  JOIN unnest(pr.proargnames) WITH ORDINALITY AS a(attname, ord) ON true
  WHERE n.nspname='public' AND pr.proname='get_public_coordinator_sponsors'
    AND a.attname NOT IN ('p_coordinator_id','p_limit')
) p;""")
cols = last(out)
check("returns no cost or buyer columns",
      "cost" not in cols and "buyer" not in cols and "contact" not in cols, cols)

sql("UPDATE public.sponsored_slots SET ends_at = now() - interval '1 day' WHERE id='51000000-0000-0000-0000-000000000002';")
ok, out, _ = sql(ANON + f"SELECT count(*) FROM public.get_public_coordinator_sponsors('{A}', 10);")
check("expired run window drops out", last(out) == "1", last(out))

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
