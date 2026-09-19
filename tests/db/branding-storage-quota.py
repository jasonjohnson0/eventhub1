"""Per-coordinator branding storage quota against a real Postgres.

The upload path (supabase.storage.from('branding').upload(...)) runs
straight from the browser to Supabase Storage -- there is no server
function in between to pre-check anything. That means the quota (2 MB per
file, 12 MB total per coordinator folder) has to be enforced where a
client cannot route around it: a trigger on storage.objects itself. This
also checks the read-policy tightening that closed a real cross-tenant
read gap (every coordinator could previously list/read every other
coordinator's branding files).

storage.objects isn't part of a vanilla Postgres, so this builds a minimal
stand-in first (schema, table, foldername() helper, RLS enabled) -- just
enough of Supabase Storage's real shape for the actual migration file
(unmodified) to run against it and for its trigger/policy logic to be
exercised for real, not a rewritten copy of it.

See supabase/migrations/20260919153218_header_image_and_branding_quota.sql.
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
    ok, out, err = sql(
        f"BEGIN; SET LOCAL ROLE authenticated; "
        f"SELECT set_config('request.jwt.claim.sub','{uid}',true); {q} COMMIT;"
    )
    noise = {"BEGIN", "COMMIT", "SET", "ROLLBACK", uid}
    return ok, "\n".join(l for l in out.splitlines() if l.strip() not in noise), err


MINE = "20260919153218_header_image_and_branding_quota.sql"

sql(open(os.path.join(os.path.dirname(__file__), "..", "support", "pg-bootstrap.sql")).read())

# ---- minimal stand-in for Supabase Storage's schema, just enough of the
# real shape for the repo's own storage.objects migrations (and this one)
# to run against unmodified. ----
ok, out, err = sql("""
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END;
$$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
""")
check("minimal storage.objects stand-in created", ok, err[:400])

for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    if MINE in m:
        continue
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

mine_path = os.path.join(REPO, "supabase/migrations", MINE)
ok, out, err = sql(open(mine_path).read())
check(f"{MINE} applies", ok, err[:600])
ok, out, err = sql(open(mine_path).read())
check("migration is re-runnable", ok, err[:600])

ok, out, err = sql("""
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='coordinator_profiles' AND column_name='header_image_url';""")
check("coordinator_profiles.header_image_url exists", last(out) == "header_image_url", err[:200])

COORD_A = "a1111111-1111-1111-1111-111111111111"
COORD_B = "b2222222-2222-2222-2222-222222222222"
sql(f"""
INSERT INTO auth.users (id, email) VALUES
 ('{COORD_A}', 'a@example.com'), ('{COORD_B}', 'b@example.com')
ON CONFLICT DO NOTHING;
SET ROLE service_role;
INSERT INTO public.coordinator_profiles (coordinator_id, slug, setup_completed_at)
VALUES ('{COORD_A}', 'coord-a', now())
ON CONFLICT (coordinator_id) DO UPDATE SET slug = EXCLUDED.slug, setup_completed_at = now();
""")

MB = 1024 * 1024


def upload_as(uid, path, size_bytes):
    return as_user(uid, f"""
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('branding', '{path}', '{uid}', '{{"size": {size_bytes}}}'::jsonb);
""")


# ---- per-file cap ----------------------------------------------------------
ok, out, err = upload_as(COORD_A, f"{COORD_A}/header-oversize.jpg", int(2.5 * MB))
check("a single file over 2 MB is rejected", not ok and "2 mb limit" in err.lower(), (out + err)[:300])

ok, out, err = upload_as(COORD_A, f"{COORD_A}/header-1.jpg", int(1.9 * MB))
check("a file within the 2 MB per-file cap uploads fine", ok, (out + err)[:300])

# ---- cumulative 12 MB total cap --------------------------------------------
ok, out, err = upload_as(COORD_A, f"{COORD_A}/header-2.jpg", int(1.9 * MB))
check("a second file uploads while still under the 12 MB total", ok, (out + err)[:300])

# Running total so far: 1.9 + 1.9 = 3.8 MB. Add enough 1.9 MB files to approach
# the cap, then confirm the one that would cross it is refused.
for i in range(3, 7):  # +4 more at 1.9 MB => running total 3.8 + 7.6 = 11.4 MB
    ok, out, err = upload_as(COORD_A, f"{COORD_A}/header-{i}.jpg", int(1.9 * MB))
    check(f"file {i} uploads (running total still under 12 MB)", ok, (out + err)[:300])

ok, out, err = upload_as(COORD_A, f"{COORD_A}/header-7.jpg", int(1.9 * MB))
check("the file that would push the folder over 12 MB total is rejected",
      not ok and "12 mb" in err.lower(), (out + err)[:300])

# ---- deleting frees quota back up ------------------------------------------
ok, out, err = as_user(COORD_A, f"DELETE FROM storage.objects WHERE name = '{COORD_A}/header-1.jpg';")
check("deleting an old file succeeds", ok, err[:300])
ok, out, err = upload_as(COORD_A, f"{COORD_A}/header-7.jpg", int(1.9 * MB))
check("...and the freed quota lets a new file through", ok, (out + err)[:300])

# ---- cross-tenant read is now blocked (the gap this migration closed) -----
ok, out, err = as_user(COORD_B, f"SELECT count(*) FROM storage.objects WHERE bucket_id='branding' AND owner = '{COORD_A}'::uuid;")
check("a different coordinator cannot see coord A's branding files",
      ok and last(out) == "0", (out + err)[:300])
ok, out, err = as_user(COORD_A, "SELECT count(*) FROM storage.objects WHERE bucket_id='branding';")
check("...but coord A can see their own", ok and int(last(out) or 0) > 0, (out + err)[:300])

# ---- header_image_url is exposed through the public profile RPC -----------
sql(f"""
SET ROLE service_role;
UPDATE public.coordinator_profiles SET header_image_url = 'https://cdn.example/{COORD_A}/header-7.jpg'
WHERE coordinator_id = '{COORD_A}';
""")
ok, out, err = as_user(COORD_A, "SELECT header_image_url FROM public.get_public_coordinator_profile('coord-a');")
check("get_public_coordinator_profile returns the header image URL",
      ok and out.strip() == f"https://cdn.example/{COORD_A}/header-7.jpg", (out + err)[:300])

print(f"\n{failures} FAILURE(S)" if failures else "\nALL CHECKS PASSED")
exit(1 if failures else 0)
