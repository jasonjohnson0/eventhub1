import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerEnum = z.enum(["zoom", "google_meet", "youtube", "none"]);
const formatEnum = z.enum(["in_person", "virtual", "hybrid"]);

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ */
export function toIcalDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** Escape a text value for iCalendar per RFC 5545 §3.3.11 */
export function icalEscape(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long lines to 75 octets per RFC 5545 §3.1 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  parts.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join("\r\n");
}

type IcalEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  event_format?: string | null;
  virtual_link?: string | null;
};

export function buildIcs(calendarName: string, events: IcalEvent[]): string {
  const now = toIcalDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EventHub//Distribution//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${icalEscape(calendarName)}`),
  ];
  for (const ev of events) {
    const start = toIcalDate(new Date(ev.start_time));
    const end = toIcalDate(new Date(ev.end_time));
    const descParts: string[] = [];
    if (ev.description) descParts.push(ev.description);
    if (ev.virtual_link) descParts.push(`Join: ${ev.virtual_link}`);
    const description = descParts.join("\n\n");
    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:${ev.id}@eventhub`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(fold(`SUMMARY:${icalEscape(ev.title)}`));
    if (description) lines.push(fold(`DESCRIPTION:${icalEscape(description)}`));
    if (ev.location) lines.push(fold(`LOCATION:${icalEscape(ev.location)}`));
    if (ev.virtual_link) lines.push(fold(`URL:${icalEscape(ev.virtual_link)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

const VIRTUAL_HOSTS = [
  "zoom.us",
  "zoom.com",
  "meet.google.com",
  "youtube.com",
  "youtu.be",
  "teams.microsoft.com",
  "webex.com",
];

export function validateVirtualLink(url: string): { ok: boolean; provider: string; reason?: string } {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return { ok: false, provider: "none", reason: "Must be https://" };
    const host = u.hostname.toLowerCase();
    const matched = VIRTUAL_HOSTS.find((h) => host === h || host.endsWith(`.${h}`));
    if (!matched) return { ok: false, provider: "none", reason: "Unrecognized provider" };
    let provider: "zoom" | "google_meet" | "youtube" | "none" = "none";
    if (matched.includes("zoom")) provider = "zoom";
    else if (matched.includes("google")) provider = "google_meet";
    else if (matched.includes("youtu")) provider = "youtube";
    return { ok: true, provider };
  } catch {
    return { ok: false, provider: "none", reason: "Invalid URL" };
  }
}

/** Coordinator: create (or fetch) the private iCal feed token. */
export const createOrGetIcalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing } = await context.supabase
      .from("coordinator_ical_feeds")
      .select("feed_token")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (existing) return { token: existing.feed_token };
    const { data, error } = await context.supabase
      .from("coordinator_ical_feeds")
      .insert({ coordinator_id: context.userId })
      .select("feed_token")
      .single();
    if (error) throw new Error(error.message);
    return { token: data.feed_token };
  });

/** Coordinator: rotate the token (invalidates existing subscriptions). */
export const rotateIcalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // delete + re-insert so the default expression regenerates a random token
    await context.supabase
      .from("coordinator_ical_feeds")
      .delete()
      .eq("coordinator_id", context.userId);
    const { data, error } = await context.supabase
      .from("coordinator_ical_feeds")
      .insert({ coordinator_id: context.userId })
      .select("feed_token")
      .single();
    if (error) throw new Error(error.message);
    return { token: data.feed_token };
  });

/** Single-event .ics — used by the "Add to Calendar" download button. */
export const generateEventIcal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ev, error } = await context.supabase
      .from("events")
      // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
      .select("id, title, description, location, start_time, end_time, event_format, virtual_link" as any)
      .eq("id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ev) throw new Error("Event not found");
    const ics = buildIcs(ev.title, [ev as unknown as IcalEvent]);
    return { filename: `event-${data.event_id}.ics`, ics };
  });

/** Coordinator's format update. */
export const updateEventFormat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        event_format: formatEnum,
        virtual_link: z.string().url().nullable().optional(),
        livestream_provider: providerEnum.default("none"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.event_format !== "in_person") {
      if (!data.virtual_link) throw new Error("Virtual link required for virtual/hybrid events");
      const check = validateVirtualLink(data.virtual_link);
      if (!check.ok) throw new Error(check.reason ?? "Invalid virtual link");
    }
    const { error } = await context.supabase
      .from("events")
      .update({
        event_format: data.event_format,
        virtual_link: data.event_format === "in_person" ? null : data.virtual_link,
        livestream_provider: data.event_format === "in_person" ? "none" : data.livestream_provider,
        // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
      } as any)
      .eq("id", data.event_id)
      .eq("coordinator_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });