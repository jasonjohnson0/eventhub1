"""Verifies the spec 06 speaker-workflows migration against a real Postgres:
the person_kind enum, organizers.kind / event_organizers.role columns and
their defaults, that no separate `speakers` table exists (F1), and the
get_coordinator_slug() reverse lookup the person page needs (anon-callable,
still can't read coordinator_profiles directly).

See supabase/migrations/20260914074833_speaker_workflows.sql.
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


sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

# --- F1: no separate speakers table -----------------------------------------
ok, out, err = sql("""
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name='speakers';""")
check("no public.speakers table exists (F1)", last(out) == "0", err[:200])

# --- enum + columns ----------------------------------------------------------
ok, out, err = sql("""
SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder)
FROM pg_enum WHERE enumtypid = 'public.person_kind'::regtype;""")
check("person_kind enum has organizer,speaker,both", last(out) == "organizer,speaker,both", last(out))

ok, out, err = sql("""
SELECT data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='organizers' AND column_name='kind';""")
check("organizers.kind exists, NOT NULL, defaults to organizer",
      last(out) == "USER-DEFINED|NO|'organizer'::person_kind", out)

ok, out, err = sql("""
SELECT data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='event_organizers' AND column_name='role';""")
check("event_organizers.role exists, NOT NULL, defaults to organizer",
      last(out) == "USER-DEFINED|NO|'organizer'::person_kind", out)

ok, _, err = sql(open(f"{REPO}/supabase/migrations/20260914074833_speaker_workflows.sql").read())
check("migration is safe to re-run", ok, err[:200])

# --- kind on the profile is a default; role on the assignment can differ ----
COORD = "66666666-6666-6666-6666-666666666666"
EVENT = "77777777-7777-7777-7777-777777777777"
SPEAKER = "88888888-8888-8888-8888-888888888888"

sql(f"""
INSERT INTO auth.users (id, email) VALUES ('{COORD}', 'coord@ex.com') ON CONFLICT DO NOTHING;

INSERT INTO public.coordinator_profiles (coordinator_id, slug, setup_completed_at)
VALUES ('{COORD}', 'speaker-test-coord', now())
ON CONFLICT (coordinator_id) DO UPDATE SET slug = EXCLUDED.slug, setup_completed_at = EXCLUDED.setup_completed_at;

INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status)
VALUES ('{EVENT}', '{COORD}', 'Conference', now(), now() + interval '2 hours', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizers (id, coordinator_id, name, kind)
VALUES ('{SPEAKER}', '{COORD}', 'Jamie Speaker', 'speaker')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_organizers (event_id, organizer_id, role, display_order)
VALUES ('{EVENT}', '{SPEAKER}', 'both', 0)
ON CONFLICT (event_id, organizer_id) DO UPDATE SET role = EXCLUDED.role;
""")

ok, out, _ = sql(f"SELECT kind FROM public.organizers WHERE id='{SPEAKER}';")
check("profile keeps its own kind (speaker)", last(out) == "speaker", last(out))

ok, out, _ = sql(
    f"SELECT role FROM public.event_organizers WHERE event_id='{EVENT}' AND organizer_id='{SPEAKER}';"
)
check("per-event role can differ from the profile's own kind (both != speaker)", last(out) == "both", last(out))

# A profile with no kind specified still defaults to organizer, same as
# before this migration -- existing rows aren't quietly reclassified.
DEFAULT_KIND = "99999999-9999-9999-9999-999999999999"
sql(f"""
INSERT INTO public.organizers (id, coordinator_id, name)
VALUES ('{DEFAULT_KIND}', '{COORD}', 'Legacy Organizer')
ON CONFLICT (id) DO NOTHING;
""")
ok, out, _ = sql(f"SELECT kind FROM public.organizers WHERE id='{DEFAULT_KIND}';")
check("a profile created without a kind still defaults to organizer", last(out) == "organizer", last(out))

# --- get_coordinator_slug(): anon-callable, still no direct table read -----
ok, out, err = sql(f"SET ROLE anon;\nSELECT public.get_coordinator_slug('{COORD}');")
check("anon can call get_coordinator_slug() and gets the right slug",
      ok and last(out) == "speaker-test-coord", (out + " " + err)[:200])

ok, out, err = sql(f"SET ROLE anon;\nSELECT slug FROM public.coordinator_profiles WHERE coordinator_id='{COORD}';")
check("anon still cannot SELECT coordinator_profiles directly", not ok, out)

NO_SLUG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ok, out, err = sql(f"SET ROLE anon;\nSELECT public.get_coordinator_slug('{NO_SLUG}');")
rows_after_set = "\n".join(l for l in out.splitlines() if l != "SET").strip()
check("get_coordinator_slug() for an unknown coordinator returns no rows (empty, not an error)",
      ok and rows_after_set == "", (out + " " + err)[:200])

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
