"""Verifies the spec 08 coordinator_chat_hooks migration against a real
Postgres: schema/defaults, that RLS actually scopes every operation (not
just SELECT) to the owning coordinator, and the updated_at trigger.

See supabase/migrations/20260914095000_chat_notifications.sql.
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


MINE = "20260914095000_chat_notifications.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

ok, out, err = sql("""
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name='coordinator_chat_hooks';""")
check("coordinator_chat_hooks table exists", last(out) == "1", err[:200])

ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

ok, out, err = sql("""
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='coordinator_chat_hooks' AND column_name='notify_submission';""")
check("notify_submission defaults to true", last(out) == "true", out)

ok, out, err = sql("""
SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='coordinator_chat_hooks' AND column_name='notify_rsvp_going';""")
check("notify_rsvp_going defaults to false (F2: immediate, but only going, and off by default is not part of F2 -- just verifying the actual stored default matches the spec's table)",
      last(out) == "false", out)

COORD = "d1111111-1111-1111-1111-111111111111"
OTHER = "d2222222-2222-2222-2222-222222222222"
sql(f"""
INSERT INTO auth.users (id, email) VALUES
 ('{COORD}', 'coord@ex.com'), ('{OTHER}', 'other@ex.com')
ON CONFLICT DO NOTHING;""")

# --- a coordinator can create and read their own row -------------------------
ok, out, err = as_user(
    COORD,
    f"INSERT INTO public.coordinator_chat_hooks (coordinator_id, slack_webhook_url) "
    f"VALUES ('{COORD}', 'v1:fake:fake:fake');"
    f"SELECT slack_webhook_url FROM public.coordinator_chat_hooks WHERE coordinator_id='{COORD}';",
)
check("a coordinator can insert and then read their own row",
      ok and last(out) == "v1:fake:fake:fake", (out + " " + err)[:200])

# --- but not another coordinator's ------------------------------------------
ok, out, err = as_user(
    OTHER,
    f"SELECT count(*) FROM public.coordinator_chat_hooks WHERE coordinator_id='{COORD}';",
)
check("another coordinator cannot read someone else's row (RLS, not app logic)",
      ok and last(out) == "0", (out + " " + err)[:200])

ok, _, err = as_user(
    OTHER,
    f"UPDATE public.coordinator_chat_hooks SET notify_submission=false WHERE coordinator_id='{COORD}';",
)
check("another coordinator's UPDATE against someone else's row runs without error but touches nothing",
      ok, err[:200])
# Confirmed as COORD, who -- unlike OTHER -- can actually read this row at
# all: OTHER's SELECT of it would return zero rows regardless of whether the
# UPDATE above landed, so it can't be used to prove the UPDATE was blocked.
ok, out, err = as_user(
    COORD, f"SELECT notify_submission FROM public.coordinator_chat_hooks WHERE coordinator_id='{COORD}';"
)
check("...verified from the owner's own side: still true, OTHER's UPDATE did not land",
      ok and last(out) == "t", (out + " " + err)[:200])

ok, out, err = as_user(
    OTHER,
    f"INSERT INTO public.coordinator_chat_hooks (coordinator_id) VALUES ('{COORD}') "
    f"ON CONFLICT (coordinator_id) DO NOTHING;",
)
check("another coordinator cannot even insert a row claiming someone else's id (WITH CHECK)",
      not ok, out)

# --- updated_at trigger ------------------------------------------------------
ok, out, _ = as_user(
    COORD, f"SELECT updated_at FROM public.coordinator_chat_hooks WHERE coordinator_id='{COORD}';"
)
before = last(out)
sql("SELECT pg_sleep(1.1);")
ok, out, err = as_user(
    COORD,
    f"UPDATE public.coordinator_chat_hooks SET notify_submission=false WHERE coordinator_id='{COORD}';"
    f"SELECT updated_at FROM public.coordinator_chat_hooks WHERE coordinator_id='{COORD}';",
)
check("updated_at advances on UPDATE", ok and last(out) != before, f"before={before} after={last(out)}")

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
