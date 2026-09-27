"""Gap-closure phase 3: private events are an RLS security boundary.

Replays every migration into a real Postgres, seeds one PRIVATE event (plus
its child rows) and asks the database -- as each kind of requester, through
RLS, the way PostgREST would -- what it can see and do:

  anonymous                      -> nothing
  authenticated, wrong org       -> nothing
  authenticated, invite PENDING  -> nothing (not until accepted)
  authenticated, invite REVOKED  -> nothing
  accepted for a DIFFERENT event -> nothing
  authenticated, invite ACCEPTED -> the event and its children, can RSVP
  coordinator (owner) / workspace staff / admin -> everything, manage invites

plus privilege-escalation attempts (self-invite, self-accept), the RSVP
leak fix, and that public/unlisted behave exactly as before.
"""
import glob
import os
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO, "tests", "support"))
from pg_temp import temp_pg_uri  # noqa: E402

uri = temp_pg_uri()
failures = 0


def check(name, cond, extra=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f"  <-- {str(extra)[:300]}"))
    if not cond:
        failures += 1


def sql(text):
    p = subprocess.run(["psql", uri, "-v", "ON_ERROR_STOP=1", "-X", "-t", "-A", "-f", "-"],
                       input=text, text=True, capture_output=True)
    return p.returncode == 0, p.stdout.strip(), p.stderr.strip()


def last(o):
    return o.splitlines()[-1] if o.splitlines() else ""


def as_user(uid, text):
    """Run `text` the way PostgREST runs a request for this user (or anon)."""
    if uid is None:
        return sql(f"SET ROLE anon;\n{text}")
    return sql(f"SET ROLE authenticated;\nSET request.jwt.claim.sub = '{uid}';\n{text}")


sql(open(os.path.join(REPO, "tests", "support", "pg-bootstrap.sql")).read())
for m in sorted(glob.glob(f"{REPO}/supabase/migrations/*.sql")):
    ok, out, err = sql(open(m).read())
    if not ok:
        print(f"(tolerated, pre-existing) {os.path.basename(m)}: {err[:160]}")

for m in ["20260927110000_private_visibility_value.sql", "20260927110100_private_events_access.sql"]:
    ok, _, err = sql(open(f"{REPO}/supabase/migrations/{m}").read())
    check(f"{m} is safe to re-run", ok, err)

ok, out, _ = sql("SELECT string_agg(e::text, ',' ORDER BY e::text) FROM unnest(enum_range(NULL::public.event_visibility)) e;")
check("event_visibility is exactly public, unlisted, private", last(out) == "private,public,unlisted", out)

COORD = "c0000000-0000-4000-8000-000000000001"
STAFF = "c0000000-0000-4000-8000-000000000002"
ADMIN = "c0000000-0000-4000-8000-000000000003"
OTHER_ORG = "d0000000-0000-4000-8000-000000000001"
PENDING = "e0000000-0000-4000-8000-000000000001"
ACCEPTED = "e0000000-0000-4000-8000-000000000002"
REVOKED = "e0000000-0000-4000-8000-000000000003"
ELSEWHERE = "e0000000-0000-4000-8000-000000000004"   # accepted for P2, not P
P = "f0000000-0000-4000-8000-000000000001"           # private, approved
P2 = "f0000000-0000-4000-8000-000000000002"          # another private event
PD = "f0000000-0000-4000-8000-000000000003"          # private but NOT approved (draft)
PUB = "f0000000-0000-4000-8000-000000000004"
UNL = "f0000000-0000-4000-8000-000000000005"
OTHER_EV = "f0000000-0000-4000-8000-000000000006"    # other org's own private event

users = {COORD: "coord@x.com", STAFF: "staff@x.com", ADMIN: "admin@x.com", OTHER_ORG: "other@y.com",
         PENDING: "pending@z.com", ACCEPTED: "accepted@z.com", REVOKED: "revoked@z.com", ELSEWHERE: "elsewhere@z.com"}
ok, _, err = sql("INSERT INTO auth.users (id,email) VALUES " + ",".join(f"('{u}','{e}')" for u, e in users.items())
                 + " ON CONFLICT DO NOTHING;")
check("seeded users", ok, err)
ok, _, err = sql(f"""
INSERT INTO public.workspace_staff (coordinator_id, staff_user_id, invited_email, accepted_at)
  VALUES ('{COORD}','{STAFF}','staff@x.com', now());
INSERT INTO public.user_roles (user_id, role) VALUES ('{ADMIN}','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.events (id, coordinator_id, title, start_time, end_time, status, visibility) VALUES
  ('{P}','{COORD}','Board Retreat', now()+interval '2 day', now()+interval '2 day 3 hour','approved','private'),
  ('{P2}','{COORD}','Donor Dinner', now()+interval '3 day', now()+interval '3 day 3 hour','approved','private'),
  ('{PD}','{COORD}','Draft Private', now()+interval '4 day', now()+interval '4 day 3 hour','draft','private'),
  ('{PUB}','{COORD}','Public Picnic', now()+interval '5 day', now()+interval '5 day 3 hour','approved','public'),
  ('{UNL}','{COORD}','Unlisted Club', now()+interval '6 day', now()+interval '6 day 3 hour','approved','unlisted'),
  ('{OTHER_EV}','{OTHER_ORG}','Other Org Private', now()+interval '7 day', now()+interval '7 day 3 hour','approved','private');
INSERT INTO public.event_invites (event_id, email, user_id, token_hash, status, invited_by) VALUES
  ('{P}','pending@z.com', NULL, 'hash-pending', 'pending', '{COORD}'),
  ('{P}','accepted@z.com', '{ACCEPTED}', 'hash-accepted', 'accepted', '{COORD}'),
  ('{P}','revoked@z.com', '{REVOKED}', 'hash-revoked', 'revoked', '{COORD}'),
  ('{P2}','elsewhere@z.com', '{ELSEWHERE}', 'hash-elsewhere', 'accepted', '{COORD}'),
  ('{PD}','accepted@z.com', '{ACCEPTED}', 'hash-draft', 'accepted', '{COORD}');
""")
check("seeded events, staff, admin and invites", ok, err)

# Child rows for P. Each is optional in this sandbox (some tables need
# PostGIS or enums a clean replay can't create); a table that can't be seeded
# is reported, not silently counted as "hidden".
children = {
    "event_details": f"INSERT INTO public.event_details (event_id) VALUES ('{P}');",
    "event_tickets": f"INSERT INTO public.event_tickets (event_id, name) VALUES ('{P}','General');",
    "event_photos": f"INSERT INTO public.event_photos (event_id, uploaded_by, photo_url) VALUES ('{P}','{COORD}','https://x/p.jpg');",
    "event_organizers": f"""INSERT INTO public.organizers (id, coordinator_id, name) VALUES ('a1000000-0000-4000-8000-000000000001','{COORD}','Chair');
                            INSERT INTO public.event_organizers (event_id, organizer_id) VALUES ('{P}','a1000000-0000-4000-8000-000000000001');""",
    "sponsored_slots": f"INSERT INTO public.sponsored_slots (event_id, position) VALUES ('{P}', 1);",
    "event_field_values": f"""INSERT INTO public.event_field_schemas (id, coordinator_id, field_name) VALUES ('a2000000-0000-4000-8000-000000000001','{COORD}','Dress code');
                              INSERT INTO public.event_field_values (event_id, field_id) VALUES ('{P}','a2000000-0000-4000-8000-000000000001');""",
    "event_locations": f"INSERT INTO public.event_locations (event_id, location_name, latitude, longitude) VALUES ('{P}','HQ', 30.1, -85.2);",
}
seeded = []
for table, stmt in children.items():
    ok, _, err = sql(stmt)
    if ok:
        seeded.append(table)
    else:
        print(f"(tolerated, sandbox) could not seed {table}: {err[:140]}")
check("at least the core child tables could be seeded", {"event_details", "event_tickets", "event_photos"} <= set(seeded), seeded)


def rows(out):
    """Result rows only -- psql also echoes SET/UPDATE command tags."""
    return [l for l in out.splitlines() if l and not l.startswith(("SET", "UPDATE", "INSERT", "DELETE"))]


def visible(uid, table="events", col="id", eid=P):
    ok, out, err = as_user(uid, f"SELECT count(*) FROM public.{table} WHERE {col}='{eid}';")
    return int(last(out)) if ok and last(out).isdigit() else f"ERR {err[:120]}"


def rsvp(uid, eid=P):
    return as_user(uid, f"INSERT INTO public.event_rsvps (event_id, user_id, status) VALUES ('{eid}','{uid}','going');")


# ---- the five requester classes the spec names, for the event row -----------------
cases = [
    ("anonymous", None, 0), ("authenticated, wrong org", OTHER_ORG, 0),
    ("authenticated, invited but PENDING", PENDING, 0), ("authenticated, invite REVOKED", REVOKED, 0),
    ("accepted for a different private event", ELSEWHERE, 0), ("authenticated, invite ACCEPTED", ACCEPTED, 1),
    ("coordinator (owner)", COORD, 1), ("workspace staff", STAFF, 1), ("admin", ADMIN, 1),
]
for label, uid, want in cases:
    got = visible(uid)
    check(f"private event row: {label} -> {'sees it' if want else 'no row'}", got == want, got)

# ---- child tables follow the event ---------------------------------------------------
for table in seeded:
    for label, uid, want in cases:
        got = visible(uid, table, "event_id")
        check(f"{table}: {label} -> {want}", got == want, got)

# ---- RSVP: the leak fix -----------------------------------------------------------------
for label, uid, want_ok in [("wrong org", OTHER_ORG, False), ("pending invite", PENDING, False),
                            ("revoked invite", REVOKED, False), ("accepted invite", ACCEPTED, True)]:
    ok, _, err = rsvp(uid)
    check(f"RSVP to the private event: {label} -> {'allowed' if want_ok else 'rejected'}", ok == want_ok, err)
ok, _, err = rsvp(OTHER_ORG, PUB)
check("RSVP to a public event still works for anyone signed in", ok, err)
ok, _, err = rsvp(OTHER_ORG, UNL)
check("RSVP to an unlisted event (by link) still works", ok, err)

# ---- status still matters: accepted invite to a NON-approved private event -----------
check("an accepted invite does not reveal a non-approved private event", visible(ACCEPTED, eid=PD) == 0, visible(ACCEPTED, eid=PD))
check("...which its coordinator still sees", visible(COORD, eid=PD) == 1)

# ---- public/unlisted unchanged (no regression) ------------------------------------------
for label, uid in [("anonymous", None), ("wrong org", OTHER_ORG), ("pending guest", PENDING)]:
    check(f"public event: {label} still sees it", visible(uid, eid=PUB) == 1, visible(uid, eid=PUB))
    check(f"unlisted event: {label} still opens it by id (listing filter, not ACL)", visible(uid, eid=UNL) == 1, visible(uid, eid=UNL))

# ---- the other org's private event is theirs alone ----------------------------------------
check("another org's private event: our coordinator can't see it", visible(COORD, eid=OTHER_EV) == 0)
check("another org's private event: its own coordinator can", visible(OTHER_ORG, eid=OTHER_EV) == 1)
check("another org's private event: admin can", visible(ADMIN, eid=OTHER_EV) == 1)

# ---- invites table itself ----------------------------------------------------------------
ok, out, err = as_user(None, f"SELECT count(*) FROM public.event_invites;")
check("anon cannot read event_invites at all", not ok and "permission denied" in err, out + err)
check("wrong org reads no invites", visible(OTHER_ORG, "event_invites", "event_id") == 0)
check("coordinator reads all of P's invites (guest list)", visible(COORD, "event_invites", "event_id") == 3, visible(COORD, "event_invites", "event_id"))
check("staff reads the guest list too", visible(STAFF, "event_invites", "event_id") == 3)
check("an accepted guest reads only their own invite row", visible(ACCEPTED, "event_invites", "event_id") == 1)
ok, out, _ = as_user(ACCEPTED, f"SELECT count(*) FROM public.event_invites WHERE token_hash IS NOT NULL AND user_id <> '{ACCEPTED}';")
check("...and no other guest's token hash", last(out) == "0", out)

# ---- privilege escalation attempts ---------------------------------------------------------
ok, _, err = as_user(OTHER_ORG, f"""INSERT INTO public.event_invites (event_id, user_id, email, status)
                                    VALUES ('{P}','{OTHER_ORG}','other@y.com','accepted');""")
check("a stranger cannot insert an accepted invite for themselves", not ok, err)
check("...and so still can't see the event", visible(OTHER_ORG) == 0)
ok, out, err = as_user(PENDING, f"UPDATE public.event_invites SET status='accepted', user_id='{PENDING}' WHERE token_hash='hash-pending' RETURNING id;")
check("a pending guest cannot accept by writing the table directly", not ok or rows(out) == [], out + err)
ok, out, err = as_user(REVOKED, f"UPDATE public.event_invites SET status='accepted' WHERE user_id='{REVOKED}' RETURNING id;")
check("a revoked guest cannot re-accept by writing the table directly", not ok or rows(out) == [], out + err)
check("...and still can't see the event", visible(REVOKED) == 0)
ok, out, err = as_user(None, f"SELECT public.has_accepted_event_invite('{P}');")
check("anon cannot call the access helper", not ok, out)
ok, out, err = as_user(OTHER_ORG, f"SELECT public.has_accepted_event_invite('{P}');")
check("the helper only answers for the CALLER (stranger gets false)", ok and last(out) == "f", out + err)
ok, _, err = sql(f"UPDATE public.event_invites SET status='accepted' WHERE token_hash='hash-pending';")
check("an accepted invite must name the account (CHECK constraint)", not ok and "event_invites_accepted_has_user" in err, err)

# ---- coordinator manages the guest list through RLS -----------------------------------------
ok, out, err = as_user(COORD, f"UPDATE public.event_invites SET status='revoked' WHERE user_id='{ACCEPTED}' AND event_id='{P}' RETURNING id;")
check("coordinator can revoke an invite", ok and len(rows(out)) == 1, out + err)
check("...and the revoked guest immediately loses access", visible(ACCEPTED) == 0, visible(ACCEPTED))
ok, out, err = as_user(OTHER_ORG, f"UPDATE public.event_invites SET status='accepted' WHERE user_id='{ACCEPTED}' AND event_id='{P}' RETURNING id;")
check("another org's coordinator cannot restore it", not ok or rows(out) == [], out + err)

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{failures} CHECK(S) FAILED"))
sys.exit(1 if failures else 0)
