import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "@/lib/timezone";
import { IMPORT_CATEGORIES, MAX_IMPORT_ROWS, duplicateKey } from "@/lib/event-import";

// biome-ignore lint/suspicious/noExplicitAny: several columns are newer than the generated types
type Sb = any;

type Workspace = { coordinator_id: string; name: string; timezone: string };

/** The calendar an import writes into: the caller's own coordinator profile,
 *  or else the first workspace they've accepted a staff invite to. RLS on
 *  events (is_workspace_member) is still what actually authorizes writes. */
async function resolveWorkspace(sb: Sb, userId: string): Promise<Workspace | null> {
  const { data: own } = await sb
    .from("coordinator_profiles")
    .select("coordinator_id, company_name, full_name, timezone")
    .eq("coordinator_id", userId)
    .maybeSingle();
  let row = own;
  if (!row) {
    const { data: staff } = await sb
      .from("workspace_staff")
      .select("coordinator_id")
      .eq("staff_user_id", userId)
      .not("accepted_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (staff) {
      const { data: ws } = await sb
        .from("coordinator_profiles")
        .select("coordinator_id, company_name, full_name, timezone")
        .eq("coordinator_id", staff.coordinator_id)
        .maybeSingle();
      row = ws ?? { coordinator_id: staff.coordinator_id, company_name: null, full_name: null, timezone: null };
    }
  }
  if (!row) return null;
  return {
    coordinator_id: row.coordinator_id,
    name: row.company_name || row.full_name || "Your calendar",
    timezone: isValidTimeZone(row.timezone) ? row.timezone : DEFAULT_TIMEZONE,
  };
}

export const getImportContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveWorkspace(context.supabase as Sb, context.userId));

// ---------------------------------------------------------------------------
// Fetch a public .ics URL (server side: no CORS, SSRF-guarded)
// ---------------------------------------------------------------------------

const MAX_ICS_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIpv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
}

function isIpLiteral(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
}

/** Resolves a hostname over DNS-over-HTTPS (the worker runtime has no
 *  resolver API) and rejects it if ANY address is private/loopback/link-local. */
async function assertPublicHost(host: string): Promise<void> {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
    h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home") || !h.includes(".")
  ) {
    throw new Error("That address points to a private network and can't be used.");
  }
  if (isIpLiteral(h)) {
    if (isPrivateIpv4(h) || isPrivateIpv6(h)) throw new Error("That address points to a private network and can't be used.");
    return;
  }
  const addrs: string[] = [];
  for (const type of ["A", "AAAA"]) {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(h)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      });
      const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) addrs.push(a.data);
    } catch {
      // fall through: no answer means we can't vouch for it
    }
  }
  if (addrs.length === 0) throw new Error("Couldn't find that web address. Check the link and try again.");
  if (addrs.some((a) => isPrivateIpv4(a) || isPrivateIpv6(a))) {
    throw new Error("That address points to a private network and can't be used.");
  }
}

export const fetchIcsFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    // webcal:// is just a calendar-app hint for https.
    let raw = data.url.replace(/^webcals?:\/\//i, "https://");
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("That doesn't look like a web address.");
    }
    for (let hop = 0; ; hop++) {
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("Only http(s) and webcal links can be imported.");
      }
      if (url.username || url.password) throw new Error("Links with a username or password aren't supported.");
      if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
        throw new Error("That link uses an unusual port and can't be fetched.");
      }
      await assertPublicHost(url.hostname);
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          redirect: "manual",
          headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.5", "user-agent": "EventHub-Import/1.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (e) {
        throw new Error(
          e instanceof Error && e.name === "TimeoutError"
            ? "The calendar took too long to respond."
            : "Couldn't reach that calendar link.",
        );
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("The calendar link redirected without a destination.");
        if (hop >= MAX_REDIRECTS) throw new Error("The calendar link redirected too many times.");
        url = new URL(loc, url);
        continue;
      }
      if (!res.ok) throw new Error(`The calendar link answered with an error (${res.status}).`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_ICS_BYTES) throw new Error("That calendar is larger than 5 MB.");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("The calendar link returned nothing.");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ICS_BYTES) {
          await reader.cancel();
          throw new Error("That calendar is larger than 5 MB.");
        }
        chunks.push(value);
      }
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
      }
      const text = new TextDecoder("utf-8").decode(buf);
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        throw new Error("That link didn't return an iCal calendar. Make sure it's the .ics / webcal link.");
      }
      return { text };
    }
  });

// ---------------------------------------------------------------------------
// Duplicate check + import
// ---------------------------------------------------------------------------

const rowSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable(),
  location: z.string().max(300).nullable(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  category: z.enum(IMPORT_CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  status: z.enum(["draft", "approved"]),
  visibility: z.enum(["public", "unlisted", "private"]),
});
type Row = z.infer<typeof rowSchema>;

/** Existing events in the workspace keyed by duplicateKey -> event id. */
async function existingKeys(sb: Sb, coordinatorId: string, starts: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (starts.length === 0) return map;
  const times = starts.map((s) => new Date(s).getTime());
  const min = new Date(Math.min(...times)).toISOString();
  const max = new Date(Math.max(...times)).toISOString();
  const wanted = new Set(times);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("events")
      .select("id, title, start_time")
      .eq("coordinator_id", coordinatorId)
      .gte("start_time", min)
      .lte("start_time", max)
      .order("start_time")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const e of data ?? []) {
      if (wanted.has(new Date(e.start_time).getTime())) map.set(duplicateKey(e.title, e.start_time), e.id);
    }
    if (!data || data.length < 1000) break;
  }
  return map;
}

export const findImportDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rows: z
          .array(z.object({ title: z.string().max(200), start_time: z.string().datetime({ offset: true }) }))
          .max(MAX_IMPORT_ROWS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ws = await resolveWorkspace(context.supabase as Sb, context.userId);
    if (!ws) throw new Error("Finish setting up your calendar before importing events.");
    const map = await existingKeys(context.supabase as Sb, ws.coordinator_id, data.rows.map((r) => r.start_time));
    return { duplicates: data.rows.map((r) => map.has(duplicateKey(r.title, r.start_time))) };
  });

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  failed: { title: string; start_time: string; reason: string }[];
};

const BATCH = 100;

export const importEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS),
        onDuplicate: z.enum(["skip", "update"]).default("skip"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ImportResult> => {
    const sb = context.supabase as Sb;
    const ws = await resolveWorkspace(sb, context.userId);
    if (!ws) throw new Error("Finish setting up your calendar before importing events.");

    const nowIso = new Date().toISOString();
    const { data: bans } = await sb
      .from("bans")
      .select("reason")
      .eq("scope", "user")
      .eq("target_user_id", context.userId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1);
    if (bans?.length) throw new Error(`You are banned from creating events: ${bans[0].reason ?? "no reason provided"}`);

    const result: ImportResult = { imported: 0, updated: 0, skipped: 0, failed: [] };
    const existing = await existingKeys(sb, ws.coordinator_id, data.rows.map((r) => r.start_time));

    // Duplicates inside the file itself count as duplicates too.
    const seen = new Set<string>();
    const toInsert: Row[] = [];
    const toUpdate: { id: string; row: Row }[] = [];
    for (const r of data.rows) {
      const key = duplicateKey(r.title, r.start_time);
      if (seen.has(key)) {
        result.skipped++;
        continue;
      }
      seen.add(key);
      const id = existing.get(key);
      if (!id) toInsert.push(r);
      else if (data.onDuplicate === "update") toUpdate.push({ id, row: r });
      else result.skipped++;
    }

    const payload = (r: Row) => ({
      coordinator_id: ws.coordinator_id,
      title: r.title,
      description: r.description,
      location: r.location,
      start_time: r.start_time,
      end_time: r.end_time,
      category: r.category,
      tags: r.tags,
      status: r.status,
      visibility: r.visibility,
      timezone: ws.timezone,
      venue_id: null,
    });

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await sb.from("events").insert(batch.map(payload));
      if (!error) {
        result.imported += batch.length;
        continue;
      }
      // Retry one by one so a single bad row doesn't sink the batch.
      for (const r of batch) {
        const { error: e1 } = await sb.from("events").insert(payload(r));
        if (e1) result.failed.push({ title: r.title, start_time: r.start_time, reason: friendly(e1.message) });
        else result.imported++;
      }
    }

    for (const { id, row } of toUpdate) {
      const { coordinator_id: _c, venue_id: _v, ...fields } = payload(row);
      const { error } = await sb.from("events").update(fields).eq("id", id).eq("coordinator_id", ws.coordinator_id);
      if (error) result.failed.push({ title: row.title, start_time: row.start_time, reason: friendly(error.message) });
      else result.updated++;
    }
    return result;
  });

function friendly(msg: string): string {
  if (/row-level security/i.test(msg)) return "You don't have permission to add events to this calendar.";
  if (/timezone/i.test(msg)) return "The calendar's time zone wasn't accepted.";
  return msg.slice(0, 200);
}
