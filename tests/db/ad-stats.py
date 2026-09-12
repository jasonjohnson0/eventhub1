"""Verifies the sponsor ad-stats schema against a real Postgres.

Covers what a static read cannot: that the migration is genuinely re-runnable,
that a placement which is not live records nothing, that dedup counts hits
without multiplying rows, and that a coordinator cannot read another's numbers.
"""
import os
import tempfile
import glob
import shutil
import subprocess
import sys
import pgserver

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Outside the repo on purpose: an embedded Postgres data directory is ~40MB
# of files owned by another user, which git cannot read and eslint walks.
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

MINE = "20260912100000_sponsor_ad_stats.sql"

sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok and MINE in m:
        check(f"{os.path.basename(m)} applies", False, err[:400]); break
else:
    check("migration applies on a clean replay", True)

# Lovable re-runs migrations; one that is only idempotent in the comments is a
# migration that fails the second time in front of a customer.
ok, _, err = sql(open(f"{REPO}/supabase/migrations/{MINE}").read())
check("migration is re-runnable", ok, err[:400])

ok, out, _ = sql("""
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('record_ad_event','get_ad_destination','get_sponsor_ad_stats',
  'get_my_sponsorship_stats','prune_sponsor_ad_stats');""")
check("all five functions exist", last(out) == "5", last(out))

# ---- the Supabase default-privilege footgun ---------------------------------
ok, out, _ = sql("""
SELECT coalesce(string_agg(DISTINCT a.privilege_type, ','), 'none')
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN LATERAL aclexplode(c.relacl) a ON true
WHERE n.nspname='public' AND c.relname='sponsor_ad_stats'
  AND a.grantee::regrole::text IN ('anon','authenticated');""")
check("anon and authenticated hold no table privileges", last(out) == "none", last(out))

# Every function that writes, or resolves a redirect, must be closed to both
# public roles -- not just to PUBLIC. See the note in the migration.
for fn, roles in [
    ("public.record_ad_event(uuid,text,text,text)", ["anon", "authenticated"]),
    ("public.get_ad_destination(uuid)", ["anon", "authenticated"]),
    ("public.prune_sponsor_ad_stats(integer)", ["anon", "authenticated"]),
    ("public.get_sponsor_ad_stats(uuid,integer)", ["anon"]),
    ("public.get_my_sponsorship_stats(integer)", ["anon"]),
]:
    for role in roles:
        ok, out, _ = sql(f"SELECT has_function_privilege('{role}', '{fn}', 'EXECUTE');")
        check(f"{role} cannot execute {fn.split('(')[0].split('.')[-1]}",
              last(out) == "f", last(out))

# ...while the roles that need them keep them.
for fn, role in [
    ("public.record_ad_event(uuid,text,text,text)", "service_role"),
    ("public.get_sponsor_ad_stats(uuid,integer)", "authenticated"),
    ("public.get_my_sponsorship_stats(integer)", "authenticated"),
]:
    ok, out, _ = sql(f"SELECT has_function_privilege('{role}', '{fn}', 'EXECUTE');")
    check(f"{role} can still execute {fn.split('(')[0].split('.')[-1]}",
          last(out) == "t", last(out))

# ---- fixtures ---------------------------------------------------------------
ok, _, err = sql("""
INSERT INTO auth.users (id, email) VALUES
 ('11111111-1111-1111-1111-111111111111','coord@example.com'),
 ('22222222-2222-2222-2222-222222222222','rival@example.com'),
 ('33333333-3333-3333-3333-333333333333','buyer@example.com');

INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  'Harvest Festival', now()+interval '10 days', now()+interval '10 days 4 hours','approved'),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
  'Draft Thing', now()+interval '20 days', now()+interval '20 days 2 hours','draft');

-- live: paid, in window, approved event
INSERT INTO public.sponsored_slots (id, event_id, position, status, starts_at, ends_at) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',1,'paid',
   now()-interval '1 day', now()+interval '30 days'),
-- expired window
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',2,'paid',
   now()-interval '60 days', now()-interval '30 days'),
-- reserved, never paid
 ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001',3,'reserved',
   NULL, NULL),
-- paid, but the event is a draft
 ('bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000002',1,'paid',
   NULL, NULL);

INSERT INTO public.sponsors (id, slot_id, buyer_user_id, cost_cents) VALUES
 ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
  '33333333-3333-3333-3333-333333333333', 25000),
 ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002',NULL,25000),
 ('cccccccc-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000003',NULL,25000),
 ('cccccccc-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000004',NULL,25000);

INSERT INTO public.sponsor_creatives (sponsor_id, business_name, link_url) VALUES
 ('cccccccc-0000-0000-0000-000000000001','Riverside Auto','https://riverside.example/offer'),
 ('cccccccc-0000-0000-0000-000000000002','Expired Co','https://expired.example/'),
 ('cccccccc-0000-0000-0000-000000000003','Unpaid Co','https://unpaid.example/'),
 ('cccccccc-0000-0000-0000-000000000004','Draft Co','https://draft.example/');
""")
check("fixtures load", ok, err[:400])

LIVE = "'bbbbbbbb-0000-0000-0000-000000000001'"
H = "'" + "a"*32 + "'"
H2 = "'" + "b"*32 + "'"

# ---- recording ---------------------------------------------------------------
ok, out, _ = sql(f"SELECT public.record_ad_event({LIVE},'impression','embed',{H});")
check("a live placement records", last(out) == "t", last(out))

for slot, why in [("'bbbbbbbb-0000-0000-0000-000000000002'", "an expired window"),
                  ("'bbbbbbbb-0000-0000-0000-000000000003'", "an unpaid slot"),
                  ("'bbbbbbbb-0000-0000-0000-000000000004'", "a draft event")]:
    ok, out, _ = sql(f"SELECT public.record_ad_event({slot},'impression','embed',{H});")
    check(f"{why} records nothing", last(out) == "f", last(out))

for bad, why in [("'sponsored'", "an unknown kind"), (None, None)]:
    if bad:
        ok, out, _ = sql(f"SELECT public.record_ad_event({LIVE},{bad},'embed',{H});")
        check(f"{why} is refused", last(out) == "f", last(out))
ok, out, _ = sql(f"SELECT public.record_ad_event({LIVE},'impression','billboard',{H});")
check("an unknown surface is refused", last(out) == "f", last(out))
ok, out, _ = sql(f"SELECT public.record_ad_event({LIVE},'impression','embed','short');")
check("a too-short visitor hash is refused", last(out) == "f", last(out))

# ---- dedup: repeats raise hits, not row count -------------------------------
sql(f"SELECT public.record_ad_event({LIVE},'impression','embed',{H});" * 4)
ok, out, _ = sql(f"""SELECT count(*)||'/'||sum(hits) FROM public.sponsor_ad_stats
 WHERE slot_id={LIVE} AND kind='impression' AND surface='embed';""")
check("a returning visitor adds a hit, not a row", last(out) == "1/5", last(out))

sql(f"SELECT public.record_ad_event({LIVE},'impression','embed',{H2});")
ok, out, _ = sql(f"""SELECT count(*)||'/'||sum(hits) FROM public.sponsor_ad_stats
 WHERE slot_id={LIVE} AND kind='impression' AND surface='embed';""")
check("a second visitor adds a row", last(out) == "2/6", last(out))

# surface is part of the key, so the same person on both surfaces is two rows
sql(f"SELECT public.record_ad_event({LIVE},'impression','site',{H});")
sql(f"SELECT public.record_ad_event({LIVE},'click','embed',{H});")
ok, out, _ = sql(f"SELECT last_seen > first_seen FROM public.sponsor_ad_stats "
                 f"WHERE slot_id={LIVE} AND kind='impression' AND surface='embed' "
                 f"AND visitor_hash={H};")
check("last_seen advances on a repeat", last(out) == "t", last(out))

# ---- click destination -------------------------------------------------------
ok, out, _ = sql(f"SELECT coalesce(public.get_ad_destination({LIVE}),'(null)');")
check("a live slot resolves its destination",
      last(out) == "https://riverside.example/offer", last(out))
ok, out, _ = sql("SELECT coalesce(public.get_ad_destination("
                 "'bbbbbbbb-0000-0000-0000-000000000002'),'(null)');")
check("an expired slot resolves to nothing", last(out) == "(null)", last(out))
ok, out, _ = sql("SELECT coalesce(public.get_ad_destination("
                 "'00000000-0000-0000-0000-000000000000'),'(null)');")
check("an unknown slot resolves to nothing", last(out) == "(null)", last(out))

# ---- reporting ---------------------------------------------------------------
def as_user(uid, q):
    """Runs q as that user. The transaction wrapper is required -- SET LOCAL and
    set_config(..., true) are both transaction-scoped -- so psql's command tags
    and the set_config echo have to be stripped back off the output."""
    ok, out, err = sql(f"BEGIN; SET LOCAL ROLE authenticated; "
                       f"SELECT set_config('request.jwt.claim.sub','{uid}',true); {q} COMMIT;")
    noise = {"BEGIN", "COMMIT", "SET", "ROLLBACK", uid}
    return ok, "\n".join(l for l in out.splitlines() if l.strip() not in noise), err

ok, out, err = as_user("11111111-1111-1111-1111-111111111111",
  "SELECT views||'/'||unique_viewers||'/'||clicks||'/'||views_on_embeds "
  "FROM public.get_sponsor_ad_stats('11111111-1111-1111-1111-111111111111',30) "
  f"WHERE slot_id={LIVE};")
check("the coordinator sees total and unique separately", last(out) == "7/3/1/6",
      last(out) or err[:200])

ok, out, _ = as_user("11111111-1111-1111-1111-111111111111",
  "SELECT count(*) FROM public.get_sponsor_ad_stats("
  "'11111111-1111-1111-1111-111111111111',30);")
check("only paid slots are reported", last(out) == "3", last(out))

ok, out, err = as_user("22222222-2222-2222-2222-222222222222",
  "SELECT count(*) FROM public.get_sponsor_ad_stats("
  "'11111111-1111-1111-1111-111111111111',30);")
check("another coordinator is refused", (not ok) and "not authorised" in err.lower(),
      (err or out)[:200])

ok, out, err = as_user("33333333-3333-3333-3333-333333333333",
  "SELECT event_title||' '||views||'/'||clicks FROM public.get_my_sponsorship_stats(30);")
check("the advertiser sees their own placement",
      last(out) == "Harvest Festival 7/1", last(out) or err[:200])

ok, out, _ = as_user("22222222-2222-2222-2222-222222222222",
  "SELECT count(*) FROM public.get_my_sponsorship_stats(30);")
check("someone who bought nothing sees nothing", last(out) == "0", last(out))

# ---- retention ---------------------------------------------------------------
sql(f"""INSERT INTO public.sponsor_ad_stats (slot_id,kind,surface,stat_date,visitor_hash)
 VALUES ({LIVE},'impression','site',current_date - 500,{H2});""")
ok, out, _ = sql("SELECT public.prune_sponsor_ad_stats(400);")
check("prune removes only what is past the window", last(out) == "1", last(out))
ok, out, _ = sql(f"SELECT count(*) FROM public.sponsor_ad_stats WHERE slot_id={LIVE};")
check("prune leaves current rows alone", last(out) == "4", last(out))

# ---- inflation ceiling -------------------------------------------------------
CAP = "'" + "c"*32 + "'"
sql(f"SELECT public.record_ad_event({LIVE},'impression','site',{CAP});" * 250)
ok, out, _ = sql(f"""SELECT hits FROM public.sponsor_ad_stats
 WHERE slot_id={LIVE} AND kind='impression' AND surface='site' AND visitor_hash={CAP};""")
check("one visitor cannot inflate the total without bound", last(out) == "200", last(out))
ok, out, _ = sql(f"""SELECT count(*) FROM public.sponsor_ad_stats
 WHERE slot_id={LIVE} AND kind='impression' AND surface='site' AND visitor_hash={CAP};""")
check("and still counts as a single unique viewer", last(out) == "1", last(out))

print("\n" + ("ALL CHECKS PASSED" if failures == 0 else f"{failures} CHECK(S) FAILED"))
sys.exit(0 if failures == 0 else 1)
