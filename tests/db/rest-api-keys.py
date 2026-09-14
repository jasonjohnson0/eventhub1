"""Verifies the spec 09 REST API key/rate-limit migration against a real
Postgres: schema, that RLS only ever grants a coordinator SELECT on their
own keys (never secret_hash exposure beyond what's granted, never another
coordinator's row), and that api_rate_buckets is service_role-only.

See supabase/migrations/20260914101500_rest_api_keys.sql.
"""
import os
import tempfile
import glob
import shutil
import subprocess
import sys

import pgserver

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PG = os.path.join(tempfile.mkdtemp(prefix="eventhub-pg-"), "data")
shutil.rmtree(PG, ignore_errors=True)
os.makedirs(PG)
os.chmod(PG, 0o777)
uri = pgserver.get_server(PG).get_uri()

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


def as_user(uid, q):
    ok, out, err = sql(f"BEGIN; SET LOCAL ROLE authenticated; "
                       f"SELECT set_config('request.jwt.claim.sub','{uid}',true); {q} COMMIT;")
    noise = {"BEGIN", "COMMIT", "SET", "ROLLBACK", uid}
    return ok, "\n".join(l for l in out.splitlines() if l.strip() not in noise), err


MINE = "20260914101500_rest_api_keys.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

ok, out, err = sql("""
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('coordinator_api_keys', 'api_rate_buckets');""")
check("both tables exist", last(out) == "2", err[:200])

ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

COORD = "e1111111-1111-1111-1111-111111111111"
OTHER = "e2222222-2222-2222-2222-222222222222"
sql(f"""
INSERT INTO auth.users (id, email) VALUES
 ('{COORD}', 'coord@ex.com'), ('{OTHER}', 'other@ex.com')
ON CONFLICT DO NOTHING;""")

KEY_MINE = "f1111111-1111-1111-1111-111111111111"
KEY_OTHER = "f2222222-2222-2222-2222-222222222222"
sql(f"""
SET ROLE service_role;
INSERT INTO public.coordinator_api_keys (id, coordinator_id, name, prefix, secret_hash)
VALUES ('{KEY_MINE}', '{COORD}', 'My key', 'eh_live_aaaaaaaa', 'deadbeef')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coordinator_api_keys (id, coordinator_id, name, prefix, secret_hash)
VALUES ('{KEY_OTHER}', '{OTHER}', 'Other key', 'eh_live_bbbbbbbb', 'cafebabe')
ON CONFLICT (id) DO NOTHING;
""")

# --- RLS: SELECT only, own rows only -----------------------------------------
ok, out, err = as_user(COORD, "SELECT count(*) FROM public.coordinator_api_keys;")
check("a coordinator sees exactly their own key, not the other coordinator's",
      ok and last(out) == "1", (out + " " + err)[:200])

ok, out, err = as_user(COORD, "SELECT name, secret_hash FROM public.coordinator_api_keys;")
check("the row a coordinator can read still carries secret_hash at the DB layer (the server fn strips it before returning to the client, not RLS)",
      ok and "deadbeef" in out, (out + " " + err)[:200])

# --- authenticated cannot write this table directly (server-fn-only) --------
ok, out, err = as_user(
    COORD,
    f"INSERT INTO public.coordinator_api_keys (coordinator_id, name, prefix, secret_hash) "
    f"VALUES ('{COORD}', 'sneaky', 'eh_live_zzzzzzzz', 'forgedhash');",
)
check("authenticated cannot insert a key directly (no INSERT grant -- admin-client-only path)", not ok, out)

ok, out, err = as_user(
    COORD,
    f"UPDATE public.coordinator_api_keys SET revoked_at = now() WHERE id = '{KEY_OTHER}';",
)
check("authenticated cannot revoke -- or touch at all -- another coordinator's key (no UPDATE grant)", not ok, out)

# --- api_rate_buckets: authenticated has no access at all -------------------
ok, out, err = as_user(COORD, f"SELECT count(*) FROM public.api_rate_buckets;")
check("authenticated cannot even SELECT api_rate_buckets (service_role only)", not ok, out)

# --- service_role can do everything, including cross-coordinator writes -----
ok, out, err = sql(f"""
SET ROLE service_role;
UPDATE public.coordinator_api_keys SET revoked_at = now() WHERE id = '{KEY_OTHER}';
SELECT revoked_at IS NOT NULL FROM public.coordinator_api_keys WHERE id = '{KEY_OTHER}';""")
check("service_role can revoke any key (this is the path the server fn actually uses)",
      ok and last(out) == "t", (out + " " + err)[:200])

ok, out, err = sql(f"""
SET ROLE service_role;
INSERT INTO public.api_rate_buckets (key_id, window_start, count)
VALUES ('{KEY_MINE}', date_trunc('minute', now()), 1)
ON CONFLICT (key_id, window_start) DO UPDATE SET count = api_rate_buckets.count + 1;
INSERT INTO public.api_rate_buckets (key_id, window_start, count)
VALUES ('{KEY_MINE}', date_trunc('minute', now()), 1)
ON CONFLICT (key_id, window_start) DO UPDATE SET count = api_rate_buckets.count + 1;
SELECT count FROM public.api_rate_buckets WHERE key_id = '{KEY_MINE}';""")
check("the rate-bucket upsert-and-increment pattern actually increments (2 calls -> count 2)",
      ok and last(out) == "2", (out + " " + err)[:200])

ok, out, err = sql(f"""
SET ROLE service_role;
DELETE FROM public.coordinator_api_keys WHERE id = '{KEY_MINE}';
SELECT count(*) FROM public.api_rate_buckets WHERE key_id = '{KEY_MINE}';""")
check("deleting a key cascades to its rate-bucket rows (ON DELETE CASCADE)",
      ok and last(out) == "0", (out + " " + err)[:200])

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
