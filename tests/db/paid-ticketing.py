"""Paid ticketing's hold/confirm/refund machinery against a real Postgres.

The thing this has to get right: two people buying the last ticket at the
same instant can't both succeed (reserve_ticket locks the tier row), a
webhook retry can't double-count a sale (confirm_ticket_purchase is
idempotent once confirmed), and a check-in scan has to actually mean
something now -- a pending/cancelled/refunded ticket used to check in fine,
which this migration closes.

All four new functions are service_role-only (SECURITY DEFINER, granted
only to service_role) -- a coordinator or buyer calling reserve_ticket
directly could mint themselves a hold without ever creating a Stripe
Checkout Session, and confirm_ticket_purchase directly would let them
"confirm" their own unpaid purchase.
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

MINE = "20260914044713_paid_ticketing_checkout.sql"
sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())

others = [m for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")) if MINE not in m]
for m in others:
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

mine_path = os.path.join(REPO, "supabase/migrations", MINE)
ok, out, err = sql(open(mine_path).read())
check(f"{MINE} applies", ok, err[:400])
ok, out, err = sql(open(mine_path).read())
check("migration is re-runnable", ok, err[:400])

COORD = "11111111-1111-1111-1111-111111111111"
BUYER1 = "22222222-2222-2222-2222-222222222222"
BUYER2 = "33333333-3333-3333-3333-333333333333"
EVENT = "44444444-4444-4444-4444-444444444444"
TIER = "55555555-5555-5555-5555-555555555555"

sql(f"""
  insert into auth.users (id, email) values
    ('{COORD}', 'coord@example.com'),
    ('{BUYER1}', 'buyer1@example.com'),
    ('{BUYER2}', 'buyer2@example.com')
  on conflict do nothing;
  insert into public.events (id, coordinator_id, title, start_time, end_time, status)
  values ('{EVENT}', '{COORD}', 'Test Event', now() + interval '7 days', now() + interval '7 days 2 hours', 'approved')
  on conflict do nothing;
  insert into public.event_tickets (id, event_id, name, price_cents, quantity_available, quantity_sold)
  values ('{TIER}', '{EVENT}', 'GA', 2000, 2, 0)
  on conflict do nothing;
""")

# ---- reserve_ticket: happy path + oversell protection -------------------
ok, out, err = sql(f"select id, status, reserved_until from public.reserve_ticket('{TIER}', '{BUYER1}', 1, 2000, 30);")
check("reserve_ticket creates a pending hold", ok and "|pending|" in out, f"out={out} err={err}")
hold1_id = out.split("|")[0] if ok else None

ok, out, err = sql(f"select id from public.reserve_ticket('{TIER}', '{BUYER2}', 1, 2000, 30);")
check("a second buyer can take the last remaining seat", ok, err)
hold2_id = out.strip() if ok else None

ok, out, err = sql(f"select 1 from public.reserve_ticket('{TIER}', '{BUYER1}', 1, 2000, 30);")
check("a third hold is refused once sold+held reaches capacity", not ok and "Sold out" in err, f"ok={ok} out={out} err={err}")

# service_role-only: an authenticated user can't call these directly
ok, out, err = as_user(BUYER1, f"select public.reserve_ticket('{TIER}', '{BUYER1}', 1, 2000, 30);")
check("reserve_ticket is not callable by an authenticated user directly",
      not ok and "permission denied" in err.lower(), f"ok={ok} err={err}")

# ---- confirm_ticket_purchase: happy path + idempotent + wrong state -----
ok, out, err = sql(f"select quantity_sold from public.event_tickets where id = '{TIER}';")
check("quantity_sold is untouched while purchases are only pending holds",
      ok and last(out) == "0", f"out={out} err={err}")

ok, out, err = sql(f"select status, stripe_charge_id from public.confirm_ticket_purchase('{hold1_id}', 'pi_test_123');")
check("confirm_ticket_purchase confirms a pending hold", ok and out == "confirmed|pi_test_123", f"out={out} err={err}")

ok, out, err = sql(f"select quantity_sold from public.event_tickets where id = '{TIER}';")
check("quantity_sold increments only on confirm, not on reserve",
      ok and last(out) == "1", f"out={out} err={err}")

ok, out, err = sql(f"select status from public.confirm_ticket_purchase('{hold1_id}', 'pi_test_123_retry');")
check("confirming an already-confirmed purchase is a no-op, not an error (webhook retry safety)",
      ok and last(out) == "confirmed", f"out={out} err={err}")
ok, out, err = sql(f"select quantity_sold from public.event_tickets where id = '{TIER}';")
check("...and does not double-count quantity_sold on retry",
      ok and last(out) == "1", f"out={out} err={err}")

# ---- release_ticket_hold: cancels without touching quantity_sold --------
ok, out, err = sql(f"select public.release_ticket_hold('{hold2_id}');")
check("release_ticket_hold runs", ok, err)
ok, out, err = sql(f"select status from public.ticket_purchases where id = '{hold2_id}';")
check("...and the hold is cancelled", ok and last(out) == "cancelled", f"out={out} err={err}")
ok, out, err = sql(f"select quantity_sold from public.event_tickets where id = '{TIER}';")
check("...quantity_sold is unaffected (it was never incremented for a pending hold)",
      ok and last(out) == "1", f"out={out} err={err}")

# freed capacity is buyable again
ok, out, err = sql(f"select id from public.reserve_ticket('{TIER}', '{BUYER2}', 1, 2000, 30);")
check("releasing a hold frees the seat back up", ok, err)
hold3_id = out.strip() if ok else None
sql(f"select public.confirm_ticket_purchase('{hold3_id}', 'pi_test_456');")

# ---- mark_ticket_refunded: happy path + idempotent + wrong state --------
ok, out, err = sql(f"select status, refund_stripe_id from public.mark_ticket_refunded('{hold1_id}', 're_test_1');")
check("mark_ticket_refunded refunds a confirmed purchase", ok and out == "refunded|re_test_1", f"out={out} err={err}")
ok, out, err = sql(f"select quantity_sold from public.event_tickets where id = '{TIER}';")
check("...and decrements quantity_sold", ok and last(out) == "1", f"out={out} err={err}")

ok, out, err = sql(f"select status from public.mark_ticket_refunded('{hold1_id}', 're_test_1_retry');")
check("refunding an already-refunded purchase is a no-op (webhook retry safety)",
      ok and last(out) == "refunded", f"out={out} err={err}")
ok, out, err = sql(f"select quantity_sold from public.event_tickets where id = '{TIER}';")
check("...and does not double-decrement", ok and last(out) == "1", f"out={out} err={err}")

ok, out, err = sql(f"select public.mark_ticket_refunded('{hold2_id}', 're_test_bad');")
check("refunding a purchase that is not confirmed (this one is cancelled) raises",
      not ok and "cannot refund" in err.lower(), f"ok={ok} err={err}")

# ---- check_in_ticket: only a confirmed ticket scans ----------------------
# service_role-only, actor passed explicitly (checkInViaQr calls this
# through the service-role client, so auth.uid() is not available -- see
# 20260914044713_paid_ticketing_checkout.sql's note on this signature).
ok, out, err = sql(f"select qr_token from public.ticket_purchases where id = '{hold3_id}';")
qr3 = last(out)
ok, out, err = sql(f"select purchase_id, check_in_count from public.check_in_ticket('{qr3}', '{COORD}');")
check("a confirmed ticket checks in", ok and "|1" in out, f"out={out} err={err}")

ok, out, err = sql(f"select qr_token from public.ticket_purchases where id = '{hold2_id}';")
qr2 = last(out)
ok, out, err = sql(f"select public.check_in_ticket('{qr2}', '{COORD}');")
check("a cancelled hold's QR does not check in", not ok and "not valid for check-in" in err.lower(),
      f"ok={ok} err={err}")

ok, out, err = sql(f"select qr_token from public.ticket_purchases where id = '{hold1_id}';")
qr1 = last(out)
ok, out, err = sql(f"select public.check_in_ticket('{qr1}', '{COORD}');")
check("a refunded ticket's QR does not check in", not ok and "not valid for check-in" in err.lower(),
      f"ok={ok} err={err}")

ok, out, err = as_user(COORD, f"select public.check_in_ticket('{qr3}', '{COORD}');")
check("check_in_ticket is not callable by an authenticated user directly (service_role only)",
      not ok and "permission denied" in err.lower(), f"ok={ok} err={err}")

print("\n" + ("ALL CHECKS PASSED" if failures == 0 else f"{failures} FAILURES"))
import sys
sys.exit(1 if failures else 0)
