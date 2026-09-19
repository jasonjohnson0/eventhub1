"""Verifies the P0 branding/custom-CSS migration against a real Postgres:
the column exists, the migration is re-runnable, and the public RPC both
grants anon access and returns custom_css only for a live coordinator.

See supabase/migrations/20260916000000_branding_custom_css.sql.
"""
import os
import sys
import tempfile
import glob
import shutil
import subprocess

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


def as_role(role, q):
    ok, out, err = sql(f"BEGIN; SET LOCAL ROLE {role}; {q} COMMIT;")
    noise = {"BEGIN", "COMMIT", "SET", "ROLLBACK"}
    return ok, "\n".join(l for l in out.splitlines() if l.strip() not in noise), err


MINE = "20260916000000_branding_custom_css.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

ok, out, err = sql("""
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='coordinator_profiles' AND column_name='custom_css';""")
check("coordinator_profiles.custom_css exists", last(out) == "custom_css", err[:200])

ok, out, err = sql("""
SELECT count(*) FROM information_schema.routines
WHERE routine_schema='public' AND routine_name='get_public_coordinator_profile';""")
check("get_public_coordinator_profile exists", last(out) == "1", err[:200])

ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

LIVE = "c1111111-1111-1111-1111-111111111111"
PENDING = "c2222222-2222-2222-2222-222222222222"
sql(f"""
INSERT INTO auth.users (id, email) VALUES
 ('{LIVE}', 'live@ex.com'), ('{PENDING}', 'pending@ex.com')
ON CONFLICT DO NOTHING;
SET ROLE service_role;
INSERT INTO public.coordinator_profiles (coordinator_id, slug, custom_css, setup_completed_at)
VALUES ('{LIVE}', 'live-coord', '.marker {{ color: red; }}', now())
ON CONFLICT (coordinator_id) DO UPDATE SET
  slug = EXCLUDED.slug, custom_css = EXCLUDED.custom_css, setup_completed_at = EXCLUDED.setup_completed_at;
INSERT INTO public.coordinator_profiles (coordinator_id, slug, custom_css, setup_completed_at)
VALUES ('{PENDING}', 'pending-coord', '.should-not-be-public {{ color: blue; }}', NULL)
ON CONFLICT (coordinator_id) DO UPDATE SET
  slug = EXCLUDED.slug, custom_css = EXCLUDED.custom_css, setup_completed_at = NULL;
""")

# --- anon can call the RPC and gets custom_css back for a live coordinator --
ok, out, err = as_role(
    "anon", "SELECT custom_css FROM public.get_public_coordinator_profile('live-coord');"
)
check("anon can call get_public_coordinator_profile", ok, err[:300])
check("it returns the live coordinator's custom_css", last(out) == ".marker { color: red; }", (out + err)[:300])

# --- a coordinator who never went live is not exposed via the public RPC ---
ok, out, err = as_role(
    "anon", "SELECT count(*) FROM public.get_public_coordinator_profile('pending-coord');"
)
check("a coordinator who isn't live returns no row (custom_css never leaks pre-launch)",
      ok and last(out) == "0", (out + err)[:300])

print(f"\n{failures} FAILURE(S)" if failures else "\nALL CHECKS PASSED")
exit(1 if failures else 0)
