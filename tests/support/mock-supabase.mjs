/**
 * A tiny stand-in for Supabase, speaking just enough PostgREST and GoTrue for
 * EventHub's public pages.
 *
 * Pointing VITE_SUPABASE_URL and SUPABASE_URL at this lets both the browser and
 * the server loader hit the same fixtures, which is the only way to exercise a
 * route whose data is fetched server-side.
 *
 *   node mock-supabase.mjs [port]
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || 54321);

const SLOT_LIVE = 'dddddddd-1111-4111-8111-111111111111';
const SLOT_HOSTILE = 'dddddddd-2222-4222-8222-222222222222';
const SLOT_EXPIRED = 'dddddddd-3333-4333-8333-333333333333';
// What record_ad_event wrote, so a test can assert on it.
export const AD_LOG = [];

const COORD = '11111111-1111-1111-1111-111111111111';
const OTHER = '99999999-9999-9999-9999-999999999999';

const COORDINATORS = [{
  coordinator_id: COORD,
  slug: 'riverside',
  company_name: 'Riverside Events Co.',
  description: 'Community festivals, markets and live music along the river.',
  logo_url: null,
  favicon_url: null,
  primary_color: '#0f766e',
  secondary_color: '#f97316',
  // A finished coordinator, for tests that sign in as COORD and expect the
  // full coordinator dashboard rather than the "not a coordinator yet" one.
  setup_completed_at: '2026-01-01T00:00:00.000Z',
}];

// A coordinator who reached the Review step without ever choosing a calendar
// address -- the exact shape of the bug where "Go live" completed onboarding
// with slug='' and told the coordinator their (nonexistent) calendar was live.
const UNSLUGGED = 'cccccccc-1111-4111-8111-111111111111';
const UNSLUGGED_PROFILE = {
  coordinator_id: UNSLUGGED,
  full_name: 'No Slug Yet',
  contact_email: 'noslug@example.com',
  company_name: 'No Slug Yet Events',
  description: null,
  logo_url: null,
  favicon_url: null,
  primary_color: '#f97316',
  secondary_color: '#06b6d4',
  slug: '',
  custom_domain: null,
  email_provider: 'lovable',
  dns_records_acknowledged: false,
  setup_step: 7,
  setup_completed_at: null,
  updated_at: new Date().toISOString(),
};

const day = (n, h = 18) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

const EVENTS = [
  { id: 'e1', coordinator_id: COORD, title: 'Harvest Festival', description: 'Music, food and a parade.', location: 'Main Street', start_time: day(2), end_time: day(2, 22), category: 'community', status: 'approved' },
  { id: 'e2', coordinator_id: COORD, title: 'Farmers Market', description: 'Local growers and makers.', location: 'Riverfront Park', start_time: day(5, 9), end_time: day(5, 13), category: 'community', status: 'approved' },
  { id: 'e3', coordinator_id: COORD, title: 'Jazz on the Water', description: 'Live quartet at sunset.', location: 'The Landing', start_time: day(9, 19), end_time: day(9, 22), category: 'music', status: 'approved' },
  { id: 'e4', coordinator_id: COORD, title: '<img src=x onerror="window.__XSS=1">', description: 'hostile "quoted" & <b>markup</b>', location: "O'Brien Hall", start_time: day(12, 10), end_time: day(12, 12), category: 'other', status: 'approved' },
  // Belongs to a different coordinator: must never appear on /c/riverside.
  { id: 'x1', coordinator_id: OTHER, title: 'Somebody Else’s Gala', description: 'Not Riverside.', location: 'Elsewhere', start_time: day(3), end_time: day(3, 22), category: 'other', status: 'approved' },
  // getEvent (and the attendee functions it shares /manage and /checkin with)
  // validate `id` as a real UUID, same as production event ids -- the short
  // 'e1'-style ids above fail that check. This one exists only so
  // manage-authorization.mjs can exercise those routes.
  { id: 'aaaaaaaa-1111-4111-8111-111111111111', coordinator_id: COORD, title: 'Harvest Festival', description: 'Music, food and a parade.', location: 'Main Street', start_time: day(2), end_time: day(2, 22), category: 'community', status: 'approved' },
];

function parseEq(search, field) {
  const v = new URLSearchParams(search).get(field);
  if (!v) return null;
  const m = /^eq\.(.*)$/.exec(v);
  return m ? decodeURIComponent(m[1]) : null;
}

const server = createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { req.__body = body; handle(req, res); });
    return;
  }
  handle(req, res);
});

function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object');

  const send = (body, extra = {}) => {
    const payload = JSON.stringify(body);
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-expose-headers': 'content-range',
      ...extra,
    });
    res.end(payload);
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
    return res.end();
  }

  // Decodes whatever bearer token the caller actually sent, rather than
  // returning one fixed identity regardless of it. That distinction matters:
  // _authenticated/route.tsx's beforeLoad calls supabase.auth.getUser(), which
  // hits this endpoint, and is the one place in the app that resolves "who is
  // signed in" for every authenticated page including /dashboard. A fixed
  // response here made it impossible for any test to exercise a second
  // identity through that path -- every forged session, no matter whose JWT it
  // held, was silently treated as the one hardcoded user. Real GoTrue verifies
  // and returns the user matching the token; this at least decodes it.
  function userFromAuthHeader() {
    const header = req.headers['authorization'] || '';
    const token = header.replace(/^Bearer\s+/i, '');
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.sub) {
          return {
            id: payload.sub, aud: payload.aud ?? 'authenticated',
            role: payload.role ?? 'authenticated', email: payload.email ?? null,
            app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
          };
        }
      } catch {
        // fall through to the default identity below
      }
    }
    return {
      id: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    };
  }
  // Enough GoTrue for an authenticated page to render: getUser() reads /user,
  // and the server functions' middleware verifies a token against the same.
  if (path === '/auth/v1/user') return send(userFromAuthHeader());
  if (path === '/auth/v1/.well-known/jwks.json') return send({ keys: [] });
  if (path.startsWith('/auth/v1')) return send({ data: { session: null }, session: null, user: null });
  if (path === '/rest/v1/user_roles') return send([{ role: 'admin' }]);

  // The coordinator lookup goes through an RPC now, not a table select,
  // because production does not grant anon SELECT on coordinator_profiles.
  if (path === '/rest/v1/rpc/get_public_coordinator_profile') {
    let slug = null;
    try { slug = JSON.parse(req.__body || '{}').p_slug ?? null; } catch {}
    const row = COORDINATORS.find((c) => c.slug === slug) ?? null;
    return send(row ? [row] : []);
  }

  if (path === '/rest/v1/coordinator_profiles') {
    const slug = parseEq(url.search, 'slug');
    const coordinatorId = parseEq(url.search, 'coordinator_id');
    const row = slug
      ? (COORDINATORS.find((c) => c.slug === slug) ?? null)
      : coordinatorId === UNSLUGGED
        ? UNSLUGGED_PROFILE
        : coordinatorId
          ? (COORDINATORS.find((c) => c.coordinator_id === coordinatorId) ?? null)
          : null;
    return send(wantsObject ? row : row ? [row] : []);
  }
  // No fixture is workspace staff anywhere in this mock; made explicit rather
  // than left to the generic fallback at the bottom of this file, so it reads
  // as a deliberate "nobody is staff" rather than an unhandled route.
  if (path === '/rest/v1/workspace_staff') return send(wantsObject ? null : []);

  if (path === '/rest/v1/events') {
    const coordinator = parseEq(url.search, 'coordinator_id');
    const id = parseEq(url.search, 'id');
    let rows = EVENTS.filter((e) => e.status === 'approved');
    if (coordinator) rows = rows.filter((e) => e.coordinator_id === coordinator);
    if (id) rows = rows.filter((e) => e.id === id);
    rows = rows.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
    return send(wantsObject ? (rows[0] ?? null) : rows);
  }

  if (path === '/rest/v1/event_rsvps') return send([], { 'content-range': '0-0/7' });
  // The public going/interested/declined aggregate. e1 gets a deliberately
  // nonzero, distinctive value so a test can tell "wired to the RPC" apart
  // from "silently fell back to 0" -- the exact failure mode of the bug this
  // RPC replaced, where a direct table count read as zero for almost everyone.
  if (path === '/rest/v1/rpc/get_event_rsvp_counts') {
    let b = {};
    try { b = JSON.parse(req.__body || '{}'); } catch {}
    if (b.p_event_id === 'e1') return send([{ going: 42, interested: 7, declined: 2 }]);
    return send([{ going: 0, interested: 0, declined: 0 }]);
  }
  if (path === '/rest/v1/rpc/get_event_rsvp_counts_bulk') {
    let b = {};
    try { b = JSON.parse(req.__body || '{}'); } catch {}
    const ids = Array.isArray(b.p_event_ids) ? b.p_event_ids : [];
    const known = { e1: [42, 7, 2], e2: [3, 1, 0], e3: [0, 0, 0] };
    return send(
      ids
        .filter((id) => id in known)
        .map((id) => ({
          event_id: id,
          going: known[id][0],
          interested: known[id][1],
          declined: known[id][2],
        })),
    );
  }
  if (path === '/rest/v1/rpc/get_public_coordinator_sponsors') {
    return send([
      { slot_id: SLOT_LIVE, event_id: 'e1', event_title: 'Harvest Festival',
        business_name: 'Riverside Auto', logo_url: 'https://cdn.example.com/logo.png',
        link_url: 'https://riverside.example/offer',
        headline: 'Free brake check', body: 'Mention the festival & save 20%.' },
      // Hostile: must be rendered inert, never as a live link.
      { slot_id: SLOT_HOSTILE, event_id: 'e2', event_title: 'Farmers Market',
        business_name: '<script>window.__XSS2=1</script>', logo_url: 'javascript:alert(1)',
        link_url: 'javascript:alert(1)', headline: null, body: null },
    ]);
  }
  // Stands in for the SECURITY DEFINER functions: only a live placement counts,
  // and only a live placement resolves a destination.
  // Every fixture user is admin by default, since most tests only need "an
  // admin" and not a specific non-admin identity. OTHER is the one deliberate
  // exception -- "a stranger, belongs to a different coordinator" -- so a test
  // can exercise the "not authorized" path without that path being accidentally
  // bypassed by the admin fallback.
  if (path === '/rest/v1/rpc/has_role') {
    let b = {};
    try { b = JSON.parse(req.__body || '{}'); } catch {}
    return send(b._user_id !== OTHER);
  }
  // getEvent's authorization gate: the caller must own the event's coordinator
  // account or be accepted staff there. is_workspace_member's real definition
  // treats "is the coordinator themself" as membership too, which this mirrors;
  // no fixture staff relationship exists here, so anyone else is refused.
  if (path === '/rest/v1/rpc/is_workspace_member') {
    let b = {};
    try { b = JSON.parse(req.__body || '{}'); } catch {}
    return send(b._user_id === b._coord_id);
  }
  if (path === '/rest/v1/rpc/get_all_coordinator_billing') {
    return send([
      { coordinator_id: COORD, company_name: 'North Florida Events', slug: 'north-florida',
        email: 'coord@example.com', state: 'fee_due', sponsored_enabled: true,
        active_sponsorships: 0, monthly_fee_cents: 4900, amount_due_cents: 4900,
        grace_ends_at: null, approved_events: 36, unpaid_cents: 4900, has_billing_row: true },
      { coordinator_id: OTHER, company_name: "O'Brien & Sons Events", slug: 'obrien',
        email: 'obrien@example.com', state: 'free_sponsored', sponsored_enabled: true,
        active_sponsorships: 2, monthly_fee_cents: 4900, amount_due_cents: 0,
        grace_ends_at: null, approved_events: 8, unpaid_cents: 0, has_billing_row: true },
      { coordinator_id: '77777777-7777-4777-8777-777777777777', company_name: 'Unpriced Co',
        slug: null, email: 'new@example.com', state: 'free_no_fee', sponsored_enabled: true,
        active_sponsorships: 0, monthly_fee_cents: 0, amount_due_cents: 0,
        grace_ends_at: null, approved_events: 3, unpaid_cents: 0, has_billing_row: false },
    ]);
  }
  if (path === '/rest/v1/billing') {
    return send([
      { id: 'b1', coordinator_id: COORD, amount_cents: 4900, status: 'pending',
        period_month: '2026-08-01', description: 'Calendar hosting for August 2026 (no sponsor running)',
        created_at: new Date().toISOString() },
    ]);
  }
  if (path === '/rest/v1/rpc/get_coordinator_billing_status') {
    return send([{
      coordinator_id: COORD, state: 'fee_due',
      reason: 'No sponsor is currently running, so the monthly fee applies.',
      sponsored_enabled: true, active_sponsorships: 0,
      monthly_fee_cents: 4900, amount_due_cents: 4900,
      grace_ends_at: null, grace_days_left: 0, next_assessment_on: '2026-10-01',
    }]);
  }
  if (path === '/rest/v1/rpc/get_sponsor_ad_stats') {
    return send([
      { slot_id: SLOT_LIVE, event_id: 'e1', event_title: 'Harvest Festival',
        business_name: "O'Brien & Sons Hardware", position: 1, slot_type: 'featured',
        starts_at: null, ends_at: null,
        views: 1840, unique_viewers: 1204, clicks: 96, unique_clickers: 88,
        views_on_embeds: 1502 },
      { slot_id: SLOT_EXPIRED, event_id: 'e2', event_title: 'Farmers Market',
        business_name: 'Riverside Auto', position: 1, slot_type: 'banner',
        starts_at: null, ends_at: null,
        views: 310, unique_viewers: 0, clicks: 0, unique_clickers: 0,
        views_on_embeds: 120 },
    ]);
  }
  if (path === '/rest/v1/rpc/record_ad_event') {
    let b = {};
    try { b = JSON.parse(req.__body || '{}'); } catch {}
    const live = b.p_slot_id === SLOT_LIVE || b.p_slot_id === SLOT_HOSTILE;
    const okShape = ['impression', 'click'].includes(b.p_kind)
      && ['embed', 'site'].includes(b.p_surface)
      && typeof b.p_visitor_hash === 'string'
      && b.p_visitor_hash.length >= 16 && b.p_visitor_hash.length <= 64;
    const counted = live && okShape;
    if (counted) AD_LOG.push(b);
    return send(counted);
  }
  if (path === '/rest/v1/rpc/get_ad_destination') {
    let b = {};
    try { b = JSON.parse(req.__body || '{}'); } catch {}
    if (b.p_slot_id === SLOT_LIVE) return send('https://riverside.example/offer');
    // The hostile row's javascript: URL must never come back as a destination.
    return send(null);
  }
  // A window for tests to read what was recorded.
  if (path === '/__adlog') return send(AD_LOG);
  if (path === '/__adlog/reset') { AD_LOG.length = 0; return send([]); }

  if (path.startsWith('/rest/v1/rpc/')) return send([]);

  // event_details, event_photos, event_organizers, organizers, event_locations,
  // venues, profiles: empty is a valid answer for all of them.
  return send(wantsObject ? null : []);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock supabase on http://127.0.0.1:${PORT}`);
  console.log(`  coordinator slug: riverside (${COORD})`);
  console.log(`  ${EVENTS.filter((e) => e.coordinator_id === COORD).length} events for riverside, 1 for another coordinator`);
});
