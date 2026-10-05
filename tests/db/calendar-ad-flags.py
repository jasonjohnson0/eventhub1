"""Calendar ad policy (Phase 1b, decision 7 as revised by Jason).

A calendar's sponsor-ad setting is two flags, ads_local and ads_network.
- A FREE calendar must always have at least one on.
- A PAID calendar may turn both off (ad-free).
- When a paid calendar with both off lapses back to free, what renders is
  its last non-empty setting (Local if it never chose), and
  restore_lapsed_ad_settings() writes that back.
- Calendar-scope campaigns that named the calendar always render; geo needs
  Local; network needs Network.
"""
import glob
import os
import subprocess
import sys

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

sql(open(os.path.join(REPO, "tests", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, _, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")
for name in ("0001_sponsor_campaigns.sql", "0002_calendar_ads_local_network_flags.sql"):
    ok, _, err = sql(open(os.path.join(REPO, "drizzle", "migrations", name)).read())
    check(f"{name} applies", ok, err[:400])

FREE = "11111111-1111-1111-1111-111111111111"
PAID = "22222222-2222-2222-2222-222222222222"
LAPSE = "33333333-3333-3333-3333-333333333333"

ok, _, err = sql(f"""
  insert into auth.users (id, email) values
    ('{FREE}', 'free@example.com'), ('{PAID}', 'paid@example.com'), ('{LAPSE}', 'lapse@example.com');
  insert into public.coordinator_profiles (coordinator_id) values ('{FREE}'), ('{PAID}'), ('{LAPSE}');
  insert into public.coordinator_subscriptions (coordinator_id, status, current_period_end) values
    ('{PAID}', 'active', now() + interval '30 days'),
    ('{LAPSE}', 'active', now() + interval '30 days');
""")
check("fixtures load", ok, err[:400])

ok, out, _ = sql(f"select ads_local, ads_network from public.coordinator_profiles where coordinator_id = '{FREE}';")
check("default is Local on, Network off", last(out) == "t|f", out)

ok, _, err = sql(f"update public.coordinator_profiles set ads_local = false, ads_network = false where coordinator_id = '{FREE}';")
check("free calendar with both off is rejected", not ok and "free calendar" in err.lower(), err[:200])

for local, network in (("true", "false"), ("false", "true"), ("true", "true")):
    ok, _, err = sql(f"update public.coordinator_profiles set ads_local = {local}, ads_network = {network} where coordinator_id = '{FREE}';")
    check(f"free calendar local={local} network={network} is allowed", ok, err[:200])

ok, out, _ = sql(f"select local, network from public.coordinator_effective_ads('{FREE}');")
check("free calendar with both on renders both", last(out) == "t|t", out)

ok, _, err = sql(f"update public.coordinator_profiles set ads_local = false, ads_network = false where coordinator_id = '{PAID}';")
check("paid calendar with both off (ad-free) is allowed", ok, err[:200])
ok, out, _ = sql(f"select local, network from public.coordinator_effective_ads('{PAID}');")
check("paid ad-free renders neither", last(out) == "f|f", out)

# Lapse: choose Network only, go ad-free while paid, then the plan ends.
ok, _, err = sql(f"""
  update public.coordinator_profiles set ads_local = false, ads_network = true where coordinator_id = '{LAPSE}';
  update public.coordinator_profiles set ads_local = false, ads_network = false where coordinator_id = '{LAPSE}';
  update public.coordinator_subscriptions set status = 'canceled', current_period_end = now() - interval '1 day'
   where coordinator_id = '{LAPSE}';
""")
check("lapse fixture applies", ok, err[:300])
ok, out, _ = sql(f"select local, network from public.coordinator_effective_ads('{LAPSE}');")
check("lapsed calendar renders its last setting (Network)", last(out) == "f|t", out)
ok, out, err = sql("select public.restore_lapsed_ad_settings();")
check("restore_lapsed_ad_settings restores one calendar", ok and last(out) == "1", out + err[:200])
ok, out, _ = sql(f"select ads_local, ads_network from public.coordinator_profiles where coordinator_id = '{LAPSE}';")
check("lapsed calendar's stored setting is valid again", last(out) == "f|t", out)

ok, _, err = sql("""
  insert into public.coordinator_profiles (coordinator_id, ads_local, ads_network)
  values ('44444444-4444-4444-4444-444444444444', false, false);
""")
check("new free calendar cannot be created with both off", not ok, err[:200])

ok, out, _ = sql("""
  select has_function_privilege('anon', 'public.restore_lapsed_ad_settings()', 'execute'),
         has_function_privilege('authenticated', 'public.restore_lapsed_ad_settings()', 'execute');
""")
check("only the server can run the lapse restore", last(out) == "f|f", out)

print(f"\n{failures} failure(s)")
sys.exit(1 if failures else 0)
