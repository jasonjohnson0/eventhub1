"""Verifies get_public_coordinator_list against a real Postgres.

Backs the /submit-event "which community is this for?" picker -- the RPC that
replaced routing every submission to whichever coordinator owned the oldest
event on the platform (see 20260914010000_public_coordinator_list.sql).
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


sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    sql(open(m).read())

ok, out, err = sql("""
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='get_public_coordinator_list';""")
check("RPC applied", last(out) == "1", err[:200])

ok, _, err = sql(open(f"{REPO}/supabase/migrations/20260914010000_public_coordinator_list.sql").read())
check("migration is safe to re-run", ok, err[:200])

LIVE = "11111111-1111-1111-1111-111111111111"       # fully onboarded
UNFINISHED = "22222222-2222-2222-2222-222222222222"  # never completed setup
NO_SLUG = "33333333-3333-3333-3333-333333333333"     # completed but slug-less

sql(f"""
INSERT INTO auth.users (id,email) VALUES
 ('{LIVE}','live@ex.com'),('{UNFINISHED}','unfinished@ex.com'),('{NO_SLUG}','noslug@ex.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.coordinator_profiles
  (coordinator_id, slug, company_name, logo_url, contact_email, setup_completed_at)
VALUES
 ('{LIVE}','live-town','Live Town Events','https://ex.com/logo.png','live@ex.com', now()),
 ('{UNFINISHED}','half-done','Half Done','https://ex.com/logo2.png','unfinished@ex.com', NULL),
 ('{NO_SLUG}',NULL,'No Slug Co',NULL,'noslug@ex.com', now())
ON CONFLICT (coordinator_id) DO UPDATE SET
  slug=EXCLUDED.slug, company_name=EXCLUDED.company_name,
  setup_completed_at=EXCLUDED.setup_completed_at;
""")

ANON = "SET ROLE anon;\n"
ok, out, err = sql(ANON + "SELECT slug FROM public.get_public_coordinator_list();")
check("anon can call the RPC", ok, err[:200])
slugs = [l for l in out.splitlines() if l and l != "SET"]
check("returns the live coordinator", "live-town" in slugs, str(slugs))
check("excludes an unfinished onboarding", "half-done" not in slugs, str(slugs))
check("excludes a completed profile with no slug", len(slugs) == 1, str(slugs))

ok, out, _ = sql(ANON + """
SELECT string_agg(s::text, ',') FROM public.get_public_coordinator_list() s
WHERE s::text ILIKE '%@%';""")
leaked = [l for l in out.splitlines() if l and l != "SET"]
check("never leaks contact_email", leaked == [], str(leaked))

sql(f"UPDATE public.coordinator_profiles SET slug='' WHERE coordinator_id='{NO_SLUG}';")
ok, out, _ = sql(ANON + "SELECT count(*) FROM public.get_public_coordinator_list();")
check("an empty-string slug is excluded too", last(out) == "1", last(out))

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
