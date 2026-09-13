"""The annual $100/year plan against a real Postgres.

The one thing this must never allow: a coordinator writing their own
subscription status. Every other billing table in this app lets a
coordinator manage their own row (sponsored_enabled, monthly_fee_cents,
etc.) -- fine, because those never represent "a real payment happened".
coordinator_subscriptions does, so it has no coordinator write policy at
all; the Stripe webhook (running as service_role, which bypasses RLS
entirely) is the only path that can ever set someone's plan to active.
"""
import os
import tempfile
import glob
import shutil
import subprocess

import pgserver

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PG = os.path.join(tempfile.mkdtemp(prefix="eventhub-pg-"), "data")
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

MINE = "20260913220000_annual_plan_subscriptions.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())

others = [m for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")) if MINE not in m]
for m in others:
    ok, out, err = sql(open(m).read())
    # Same tolerance the repo's other db suites use: postgis is unavailable in
    # this sandbox, so a handful of unrelated earlier migrations fail here
    # regardless of this change. Nothing this test touches depends on them.
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

mine_path = os.path.join(REPO, "supabase/migrations", MINE)
ok, out, err = sql(open(mine_path).read())
check(f"{MINE} applies", ok, err[:400])
ok, out, err = sql(open(mine_path).read())
check("migration is re-runnable", ok, err[:400])

ok, out, err = sql("""
  select coordinator_id, stripe_customer_id, stripe_subscription_id, status,
         current_period_end, cancel_at_period_end
  from public.coordinator_subscriptions limit 0;
""")
check("coordinator_subscriptions has the expected columns", ok, err)

ok, out, _ = sql("select unnest(enum_range(null::public.annual_plan_status))::text;")
check("annual_plan_status has exactly none/active/past_due/canceled",
      set(out.splitlines()) == {"none", "active", "past_due", "canceled"}, out)

COORD = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
ADMIN = "33333333-3333-3333-3333-333333333333"

sql(f"""
  insert into auth.users (id, email) values
    ('{COORD}', 'coord@example.com'),
    ('{OTHER}', 'other@example.com'),
    ('{ADMIN}', 'admin@example.com')
  on conflict do nothing;
  insert into public.user_roles (user_id, role) values ('{ADMIN}', 'admin')
  on conflict do nothing;
""")

# Only service_role (which the Stripe webhook runs as) can ever create or
# change a row -- this is the whole point of the table.
ok, out, err = sql(f"""
  insert into public.coordinator_subscriptions
    (coordinator_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
  values ('{COORD}', 'cus_test123', 'sub_test123', 'active', now() + interval '365 days');
""")
check("service_role can create a subscription row", ok, err)

ok, out, err = as_user(COORD, f"select status from public.coordinator_subscriptions where coordinator_id = '{COORD}';")
check("a coordinator can read their own subscription", ok and last(out) == "active", f"out={out} err={err}")

ok, out, err = as_user(OTHER, f"select status from public.coordinator_subscriptions where coordinator_id = '{COORD}';")
check("a different coordinator cannot read someone else's subscription",
      ok and out.strip() == "", f"out={out} err={err}")

ok, out, err = as_user(COORD, f"update public.coordinator_subscriptions set status = 'past_due' where coordinator_id = '{COORD}';")
check("UPDATE runs but RLS matches zero rows (no update policy exists at all)",
      ok and "UPDATE 0" in out, f"out={out} err={err}")
ok, out, err = sql(f"select status from public.coordinator_subscriptions where coordinator_id = '{COORD}';")
check("...and the row is unchanged", ok and last(out) == "active", f"out={out} err={err}")

ok, out, err = as_user(COORD, f"""
  insert into public.coordinator_subscriptions (coordinator_id, status)
  values ('{OTHER}', 'active')
  on conflict (coordinator_id) do update set status = 'active';
""")
check("a coordinator cannot INSERT/upsert a subscription row at all", not ok, f"unexpectedly succeeded: out={out}")

ok, out, err = as_user(ADMIN, f"select status from public.coordinator_subscriptions where coordinator_id = '{COORD}';")
check("an admin can read any coordinator's subscription", ok and last(out) == "active", f"out={out} err={err}")

ok, _, err = sql(f"""
  update public.coordinator_subscriptions set status = 'past_due'
  where coordinator_id = '{COORD}';
""")
ok2, out2, err2 = sql(f"select status from public.coordinator_subscriptions where coordinator_id = '{COORD}';")
check("service_role can update a subscription (what the webhook does on invoice.payment_failed)",
      ok and ok2 and last(out2) == "past_due", f"err={err} err2={err2} out2={out2}")

print("\n" + ("ALL CHECKS PASSED" if failures == 0 else f"{failures} FAILURES"))
import sys
sys.exit(1 if failures else 0)
