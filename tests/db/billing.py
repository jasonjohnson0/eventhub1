import os
"""Billing enforcement against a real Postgres.

The expensive failure modes here are silent: billing a month twice, billing a
month that was earned, or never billing anyone at all. Each gets a test.
"""
import glob, os, shutil, subprocess, sys
import pgserver

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PG = os.path.abspath(".pgdata")
shutil.rmtree(PG, ignore_errors=True)
os.makedirs(PG); os.chmod(PG, 0o777)
uri = pgserver.get_server(PG).get_uri()

failures = 0
def check(name, cond, extra=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f"  <-- {extra}"))
    if not cond: failures += 1

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

MINE = "20260912110000_billing_enforcement.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok and MINE in m:
        check(f"{os.path.basename(m)} applies", False, err[:500]); break
else:
    check("migration applies on a clean replay", True)

ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

# ---- who may write the ledger -------------------------------------------------
# A signed-in user being able to invoice the whole platform would be worse than
# never billing at all.
for fn, roles in [
    ("public.assess_coordinator_billing(uuid,date)", ["anon", "authenticated"]),
    ("public.assess_all_coordinator_billing(date)", ["anon", "authenticated"]),
    ("public.get_coordinator_billing_status(uuid)", ["anon"]),
    ("public.count_active_sponsorships(uuid,date)", ["anon"]),
]:
    for role in roles:
        ok, out, _ = sql(f"SELECT has_function_privilege('{role}', '{fn}', 'EXECUTE');")
        check(f"{role} cannot execute {fn.split('(')[0].split('.')[-1]}",
              last(out) == "f", last(out))
for fn, role in [
    ("public.assess_all_coordinator_billing(date)", "service_role"),
    ("public.get_coordinator_billing_status(uuid)", "authenticated"),
]:
    ok, out, _ = sql(f"SELECT has_function_privilege('{role}', '{fn}', 'EXECUTE');")
    check(f"{role} can still execute {fn.split('(')[0].split('.')[-1]}",
          last(out) == "t", last(out))

# ---- fixtures ---------------------------------------------------------------
# SPONSORED earns the free plan; BARE has ads on but sold nothing;
# OPTOUT deliberately switched ads off; NEWBIE is still in grace;
# NOFEE has no fee configured.
ok, _, err = sql("""
INSERT INTO auth.users (id, email) VALUES
 ('a0000000-0000-4000-8000-000000000001','sponsored@example.com'),
 ('a0000000-0000-4000-8000-000000000002','bare@example.com'),
 ('a0000000-0000-4000-8000-000000000003','optout@example.com'),
 ('a0000000-0000-4000-8000-000000000004','newbie@example.com'),
 ('a0000000-0000-4000-8000-000000000005','nofee@example.com');

INSERT INTO public.coordinator_billing_settings
  (coordinator_id, sponsored_enabled, monthly_fee_cents, grace_ends_at) VALUES
 ('a0000000-0000-4000-8000-000000000001', true,  4900, now() - interval '400 days'),
 ('a0000000-0000-4000-8000-000000000002', true,  4900, now() - interval '400 days'),
 ('a0000000-0000-4000-8000-000000000003', false, 4900, now() - interval '400 days'),
 ('a0000000-0000-4000-8000-000000000004', true,  4900, now() + interval '30 days'),
 ('a0000000-0000-4000-8000-000000000005', true,     0, now() - interval '400 days');

-- A sponsored event, live across last month and this one.
INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status) VALUES
 ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  'Sponsored Fair', now()+interval '5 days', now()+interval '5 days 3 hours','approved');
INSERT INTO public.sponsored_slots (id, event_id, position, status, starts_at, ends_at) VALUES
 ('50000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',1,'paid',
  now() - interval '90 days', now() + interval '90 days');
INSERT INTO public.sponsors (id, slot_id, cost_cents) VALUES
 ('50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000001',30000);
""")
check("fixtures load", ok, err[:400])

SPON = "a0000000-0000-4000-8000-000000000001"
BARE = "a0000000-0000-4000-8000-000000000002"
OPT  = "a0000000-0000-4000-8000-000000000003"
NEW  = "a0000000-0000-4000-8000-000000000004"
NOFEE= "a0000000-0000-4000-8000-000000000005"

# ---- the status a coordinator sees -------------------------------------------
def state(uid, viewer=None):
    ok, out, err = as_user(viewer or uid,
      f"SELECT state||'|'||amount_due_cents||'|'||active_sponsorships "
      f"FROM public.get_coordinator_billing_status('{uid}');")
    return last(out), err

s, _ = state(SPON)
check("a sponsored calendar is free", s == "free_sponsored|0|1", s)
s, _ = state(BARE)
check("ads on but nothing sold owes the fee", s == "fee_due|4900|0", s)
s, _ = state(OPT)
check("ads deliberately off owes the fee", s == "fee_due|4900|0", s)
s, _ = state(NEW)
check("a new coordinator is in grace, owing nothing", s == "grace|0|0", s)
s, _ = state(NOFEE)
check("no configured fee means nothing is owed", s == "free_no_fee|0|0", s)

ok, out, err = as_user(BARE,
  f"SELECT count(*) FROM public.get_coordinator_billing_status('{SPON}');")
check("one coordinator cannot read another's billing",
      (not ok) and "not authorised" in err.lower(), (err or out)[:160])

# A coordinator who has never opened billing settings must read as free, not error.
sql("INSERT INTO auth.users (id,email) VALUES "
    "('a0000000-0000-4000-8000-000000000009','norow@example.com');")
s, err = state("a0000000-0000-4000-8000-000000000009")
check("an account with no billing row reads as free", s.startswith("free_no_fee|0"), s or err[:160])

# ---- the reason text is for a human ------------------------------------------
ok, out, _ = as_user(BARE, f"SELECT reason FROM public.get_coordinator_billing_status('{BARE}');")
check("the reason explains itself in a sentence",
      "no sponsor" in last(out).lower() and last(out).endswith("."), last(out))

# ---- assessment ---------------------------------------------------------------
LAST = "(date_trunc('month', now() - interval '1 month'))::date"
ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{BARE}', {LAST});")
check("an unsponsored month is billed", last(out) == "4900", last(out))

ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{BARE}', {LAST});")
check("running it again bills nothing", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.billing WHERE coordinator_id='{BARE}';")
check("and leaves exactly one ledger row", last(out) == "1", last(out))

ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{SPON}', {LAST});")
check("a month that carried a sponsor is not billed", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{NEW}', {LAST});")
check("a coordinator in grace is not billed", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{NOFEE}', {LAST});")
check("an account with no fee is never invented a charge", last(out) == "0", last(out))
ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{OPT}', {LAST});")
check("switching ads off is billed", last(out) == "4900", last(out))
ok, out, _ = sql(f"SELECT description FROM public.billing WHERE coordinator_id='{OPT}';")
check("the ledger line says why", "switched off" in last(out).lower(), last(out))

# ---- the month must be closed --------------------------------------------------
ok, out, err = sql(f"SELECT public.assess_coordinator_billing('{BARE}', date_trunc('month', now())::date);")
check("the current month cannot be billed early",
      (not ok) and "not over yet" in err.lower(), (err or out)[:160])

# ---- a sponsor for part of the month still earns it ----------------------------
sql(f"""UPDATE public.sponsored_slots
        SET starts_at = date_trunc('month', now() - interval '1 month'),
            ends_at   = date_trunc('month', now() - interval '1 month') + interval '10 days'
        WHERE id='50000000-0000-4000-8000-000000000001';""")
ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{SPON}', {LAST});")
check("a sponsor who ran for part of the month still earns it", last(out) == "0", last(out))

# ...but a sponsor who only ran in a different month does not
sql(f"""UPDATE public.sponsored_slots
        SET starts_at = now() + interval '10 days', ends_at = now() + interval '40 days'
        WHERE id='50000000-0000-4000-8000-000000000001';""")
ok, out, _ = sql(f"SELECT public.assess_coordinator_billing('{SPON}', {LAST});")
check("a sponsor running only in a later month does not earn the earlier one",
      last(out) == "4900", last(out))

# ---- platform-wide run ----------------------------------------------------------
sql("DELETE FROM public.billing;")
ok, out, _ = sql(f"SELECT coordinators_billed||'/'||total_cents "
                 f"FROM public.assess_all_coordinator_billing({LAST});")
check("a platform-wide run bills exactly the accounts that owe", last(out) == "3/14700", last(out))
ok, out, _ = sql(f"SELECT coordinators_billed||'/'||total_cents "
                 f"FROM public.assess_all_coordinator_billing({LAST});")
check("re-running the platform-wide job charges nobody twice", last(out) == "0/0", last(out))
ok, out, _ = sql("SELECT count(*) FROM public.billing;")
check("the ledger still holds one row per account", last(out) == "3", last(out))

# ---- a coordinator can read their own invoice ----------------------------------
ok, out, err = as_user(BARE, "SELECT amount_cents||'|'||status FROM public.billing;")
check("a coordinator sees their own charge", last(out) == "4900|pending", last(out) or err[:160])
ok, out, _ = as_user(SPON, "SELECT count(*) FROM public.billing;")
check("and only their own", last(out) == "1", last(out))

# ---- the platform-wide admin view --------------------------------------------
# Give the admin role to one user so the authorisation branch is exercised
# rather than skipped.
sql(f"""INSERT INTO auth.users (id,email) VALUES
  ('a0000000-0000-4000-8000-0000000000ad','admin@example.com')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES ('a0000000-0000-4000-8000-0000000000ad','admin') ON CONFLICT DO NOTHING;""")
ADMIN = "a0000000-0000-4000-8000-0000000000ad"

ok, out, err = as_user(BARE, "SELECT count(*) FROM public.get_all_coordinator_billing();")
check("a non-admin cannot read the platform billing view",
      (not ok) and "admins only" in err.lower(), (err or out)[:160])

ok, out, err = as_user(ADMIN, "SELECT count(*) FROM public.get_all_coordinator_billing();")
check("an admin sees every priced coordinator", last(out) == "5", last(out) or err[:200])

ok, out, err = as_user(ADMIN,
  "SELECT state||'|'||amount_due_cents||'|'||has_billing_row "
  f"FROM public.get_all_coordinator_billing() WHERE coordinator_id='{BARE}';")
check("it agrees with the per-coordinator function", last(out) == "fee_due|4900|true",
      last(out) or err[:200])

# The ones owing money must sort first: that is the list an operator acts on.
ok, out, err = as_user(ADMIN,
  "SELECT string_agg(state, ',' ORDER BY ord) FROM ("
  "  SELECT state, row_number() OVER () AS ord FROM public.get_all_coordinator_billing()) t;")
check("fee_due sorts to the top", last(out).startswith("fee_due"), last(out) or err[:200])

# Unsettled invoices are what you chase, so they are surfaced per coordinator.
ok, out, err = as_user(ADMIN,
  f"SELECT unpaid_cents FROM public.get_all_coordinator_billing() WHERE coordinator_id='{BARE}';")
check("unpaid invoices are totalled", last(out) == "4900", last(out) or err[:200])

# A coordinator nobody has priced still appears -- that set is the revenue leak.
ok, out, err = as_user(ADMIN,
  "SELECT count(*) FROM public.get_all_coordinator_billing() WHERE state='free_no_fee';")
check("unpriced coordinators are visible, not hidden", int(last(out) or 0) >= 1, last(out))

print("\n" + ("ALL CHECKS PASSED" if failures == 0 else f"{failures} CHECK(S) FAILED"))
sys.exit(0 if failures == 0 else 1)
