"""Verifies the spec 07 unified email logs migration against a real
Postgres: email_sends columns + CHECK constraints, and that RLS actually
scopes SELECT to the owning coordinator (not any signed-in user, not another
coordinator) while leaving writes to service_role only.

See supabase/migrations/20260914090500_unified_email_logs.sql.
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


MINE = "20260914090500_unified_email_logs.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

ok, out, err = sql("""
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name='email_sends';""")
check("email_sends table exists", last(out) == "1", err[:200])

ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

# --- CHECK constraints on type/status ---------------------------------------
COORD = "b1111111-1111-1111-1111-111111111111"
OTHER_COORD = "b2222222-2222-2222-2222-222222222222"
sql(f"""
INSERT INTO auth.users (id, email) VALUES
 ('{COORD}', 'coord@ex.com'), ('{OTHER_COORD}', 'other-coord@ex.com')
ON CONFLICT DO NOTHING;""")

ok, out, err = sql(f"""
INSERT INTO public.email_sends (coordinator_id, type, recipient_email, status)
VALUES ('{COORD}', 'bogus_type', 'x@ex.com', 'sent');""")
check("a bogus type is rejected by the CHECK constraint", not ok, out)

ok, out, err = sql(f"""
INSERT INTO public.email_sends (coordinator_id, type, recipient_email, status)
VALUES ('{COORD}', 'reminder', 'x@ex.com', 'bogus_status');""")
check("a bogus status is rejected by the CHECK constraint", not ok, out)

ROW_MINE = "c1111111-1111-1111-1111-111111111111"
ROW_OTHER = "c2222222-2222-2222-2222-222222222222"
sql(f"""
INSERT INTO public.email_sends (id, coordinator_id, type, recipient_email, status, sent_at)
VALUES ('{ROW_MINE}', '{COORD}', 'announcement', 'attendee@ex.com', 'sent', now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.email_sends (id, coordinator_id, type, recipient_email, status, sent_at)
VALUES ('{ROW_OTHER}', '{OTHER_COORD}', 'announcement', 'someone-elses-attendee@ex.com', 'sent', now())
ON CONFLICT (id) DO NOTHING;
""")

# --- RLS: a coordinator sees only their own rows ----------------------------
ok, out, err = as_user(COORD, "SELECT count(*) FROM public.email_sends;")
check("the coordinator sees exactly their own row, not the other coordinator's",
      ok and last(out) == "1", (out + " " + err)[:200])

ok, out, err = as_user(OTHER_COORD, "SELECT count(*) FROM public.email_sends;")
check("the other coordinator sees exactly their own row too", ok and last(out) == "1", (out + " " + err)[:200])

ok, out, err = as_user(
    COORD,
    f"SELECT count(*) FROM public.email_sends WHERE id = '{ROW_OTHER}';",
)
check("a coordinator cannot read another coordinator's row even by id",
      ok and last(out) == "0", (out + " " + err)[:200])

# --- writes: authenticated cannot insert directly ---------------------------
ok, out, err = as_user(
    COORD,
    f"INSERT INTO public.email_sends (coordinator_id, type, recipient_email, status) "
    f"VALUES ('{COORD}', 'reminder', 'sneaky@ex.com', 'sent');",
)
check("authenticated cannot insert into email_sends directly (server-fn-only, service_role writes)",
      not ok, out)

# --- service_role can write and read everything -----------------------------
ROW_SVC = "c3333333-3333-3333-3333-333333333333"
ok, out, err = sql(f"""
SET ROLE service_role;
INSERT INTO public.email_sends (id, coordinator_id, type, recipient_email, status, sent_at)
VALUES ('{ROW_SVC}', '{COORD}', 'reminder', 'via-service-role@ex.com', 'sent', now());
SELECT count(*) FROM public.email_sends;""")
check("service_role can write, and reads unrestricted by RLS (sees all 3 rows)",
      ok and last(out) == "3", (out + " " + err)[:200])

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
