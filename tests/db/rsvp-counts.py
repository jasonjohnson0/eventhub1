"""Verifies get_event_rsvp_counts against a real Postgres.

The bug this replaces: events.$id.tsx counted event_rsvps directly, which
event_rsvps' own RLS only lets a caller read for themselves (or staff/admin),
so every other visitor -- anonymous or signed in -- silently got a count of
zero. This RPC is the fix, and these checks are here so a future change that
reintroduces a direct count on that table does not go unnoticed the same way.
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


MINE = "20260912180000_public_rsvp_counts.sql"

sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok and MINE in m:
        check(f"{os.path.basename(m)} applies", False, err[:500])
        break
else:
    check("migration applies on a clean replay", True)

ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

# ---- who may call it ----------------------------------------------------------
for role, fn in [
    ("anon", "public.get_event_rsvp_counts(uuid)"),
    ("authenticated", "public.get_event_rsvp_counts(uuid)"),
]:
    ok, out, _ = sql(f"SELECT has_function_privilege('{role}', '{fn}', 'EXECUTE');")
    check(f"{role} can call get_event_rsvp_counts", last(out) == "t", last(out))

# ---- fixtures -------------------------------------------------------------------
ok, out, err = sql("""
INSERT INTO auth.users (id, email) VALUES
 ('11111111-1111-1111-1111-111111111111','coord@example.com'),
 ('22222222-2222-2222-2222-222222222222','a@example.com'),
 ('33333333-3333-3333-3333-333333333333','b@example.com'),
 ('44444444-4444-4444-4444-444444444444','c@example.com');

INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  'Approved Event', now()+interval '5 days', now()+interval '5 days 2 hours','approved'),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
  'Draft Event', now()+interval '5 days', now()+interval '5 days 2 hours','draft'),
 ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',
  'Approved, Nobody RSVPed', now()+interval '5 days', now()+interval '5 days 2 hours','approved');

INSERT INTO public.event_rsvps (event_id, user_id, status) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','going'),
 ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','going'),
 ('aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','interested'),
 ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','going');
""")
check("fixtures load", ok, err[:400])

APPROVED = "'aaaaaaaa-0000-0000-0000-000000000001'"
DRAFT = "'aaaaaaaa-0000-0000-0000-000000000002'"
EMPTY = "'aaaaaaaa-0000-0000-0000-000000000003'"

# ---- as anon, exactly what a real visitor sees -------------------------------
def as_anon(q):
    """Runs q as anon, for real. SET LOCAL ROLE and set_config(...,true) are both
    transaction-scoped, and psql commits each bare statement in a -f script as
    its own implicit transaction -- so without an explicit BEGIN/COMMIT here,
    SET LOCAL ROLE anon would revert before q ever ran, and every "as anon"
    check would silently execute as the connecting superuser instead. (Verified
    directly: current_user after a bare "SET LOCAL ROLE anon; SELECT
    current_user;" comes back "postgres", not "anon".) This is the same bug
    fixed once already in tests/db/billing.py's as_user -- worth repeating the
    fix note here since it is easy to reintroduce by copying the wrong helper."""
    ok, out, err = sql(f"BEGIN; SET LOCAL ROLE anon; {q} COMMIT;")
    noise = {"BEGIN", "COMMIT", "SET", "ROLLBACK"}
    return ok, "\n".join(l for l in out.splitlines() if l.strip() not in noise), err


ok, out, err = as_anon(f"SELECT going||'/'||interested||'/'||declined "
                       f"FROM public.get_event_rsvp_counts({APPROVED});")
check("anon sees the real going/interested/declined split", last(out) == "2/1/0",
      last(out) or err[:200])

ok, out, _ = as_anon(f"SELECT count(*) FROM public.get_event_rsvp_counts({DRAFT});")
check("a draft event returns no row to anon", last(out) == "0", last(out))

ok, out, _ = as_anon("SELECT count(*) FROM public.get_event_rsvp_counts("
                     "'00000000-0000-0000-0000-000000000000');")
check("an unknown event id returns no row", last(out) == "0", last(out))

# ---- no user id is reachable, structurally ------------------------------------
# RETURNS TABLE fixes the output to three integers; there is no column a caller
# could ask for that would carry a user id. Confirmed directly rather than
# inferred, since a function signature is exactly the kind of thing that drifts
# quietly if someone "just adds one more field" later.
ok, out, _ = sql("""
SELECT pg_get_function_result(oid) FROM pg_proc
WHERE proname = 'get_event_rsvp_counts' AND pronamespace = 'public'::regnamespace;
""")
check("the return shape is exactly going/interested/declined, nothing else",
      last(out) == "TABLE(going integer, interested integer, declined integer)", last(out))

# ---- zero RSVPs still returns a real row of zeros, not no row at all -------
# The function joins events LEFT to event_rsvps precisely so this is true --
# distinguishing "no row" (not approved / does not exist) from "a real row that
# happens to be all zeros" matters to a caller deciding whether to render
# "0 going" versus nothing.
ok, out, err = as_anon(f"SELECT count(*) FROM public.get_event_rsvp_counts({EMPTY});")
check("an approved event with zero RSVPs returns exactly one row",
      last(out) == "1", last(out) or err[:200])
ok, out, err = as_anon(f"SELECT going||'/'||interested||'/'||declined "
                       f"FROM public.get_event_rsvp_counts({EMPTY});")
check("...and that row is all zeros, not nulls",
      last(out) == "0/0/0", last(out) or err[:200])

# ---- the bulk form matches the single form, for a mixed batch --------------
ok, out, err = as_anon(
    f"SELECT event_id||':'||going||'/'||interested||'/'||declined "
    f"FROM public.get_event_rsvp_counts_bulk(ARRAY[{APPROVED}::uuid, {DRAFT}::uuid, {EMPTY}::uuid, "
    f"'00000000-0000-0000-0000-000000000000'::uuid]) ORDER BY event_id;")
check("bulk EXECUTE is open to anon",
      ok, err[:200])
rows = out.split("\n") if ok else []
check("bulk returns exactly the approved events, one row each",
      len(rows) == 2, out or err[:200])
check("bulk agrees with the single-event RPC for the populated event",
      any(r.endswith(":2/1/0") for r in rows), out)
check("bulk agrees with the single-event RPC for the empty event",
      any(r.endswith(":0/0/0") for r in rows), out)
check("bulk silently drops the draft and the unknown id rather than erroring",
      not any("00000000-0000-0000-0000-000000000000" in r for r in rows)
      and not any(r.startswith(DRAFT.strip("'")) for r in rows), out)

print("\n" + ("ALL CHECKS PASSED" if failures == 0 else f"{failures} CHECK(S) FAILED"))
sys.exit(0 if failures == 0 else 1)
