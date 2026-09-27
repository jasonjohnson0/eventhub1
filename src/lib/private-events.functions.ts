/**
 * Private events (gap-closure phase 3): invites, acceptance, access requests
 * and the coordinator's guest list.
 *
 * The boundary itself is RLS (migration 20260927110100): nothing here is what
 * stops an uninvited user reading a private event -- the database does. What
 * these functions add is the workflow around it, plus the few writes a guest
 * must never be able to make directly (accepting, requesting): those run with
 * the service role, only after this code has verified the token and the
 * caller's identity.
 *
 * Tokens: 32 random bytes, base64url, sent only in the invite email. Only
 * their SHA-256 is stored (event_invites.token_hash), so reading the table
 * doesn't yield a usable link. Hashing happens here rather than in SQL
 * because the sandbox Postgres used by the db tests has no pgcrypto.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  acceptDecision,
  coordinatorTransition,
  maskEmail,
  normalizeEmails,
  type InviteStatus,
} from "@/lib/private-invites";

const MAX_INVITES_PER_CALL = 50;

type EventForInvite = {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
  timezone: string | null;
  coordinator_id: string;
  visibility: string;
  status: string;
};

type InviteRow = {
  id: string;
  event_id: string;
  email: string | null;
  user_id: string | null;
  status: InviteStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
};

async function crypto() {
  return import("node:crypto");
}
async function newToken(): Promise<{ token: string; hash: string }> {
  const { randomBytes, createHash } = await crypto();
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
async function hashToken(token: string): Promise<string> {
  const { createHash } = await crypto();
  return createHash("sha256").update(token).digest("hex");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // biome-ignore lint/suspicious/noExplicitAny: event_invites/visibility not in generated types yet
  return supabaseAdmin as any;
}

async function origin(): Promise<string> {
  const { siteOrigin } = await import("@/lib/site-url");
  return siteOrigin() || "https://eventhub1-eight.vercel.app";
}

/** The event, if the caller may manage its guest list: a member of the
 *  owning workspace, or an admin. Deliberately NOT "can read the event" --
 *  an accepted guest can read a private event too, and must not get here. */
async function assertCanManage(
  // biome-ignore lint/suspicious/noExplicitAny: supabase client from middleware context
  context: { supabase: any; userId: string },
  eventId: string,
): Promise<EventForInvite> {
  const sb = await admin();
  const { data: ev, error } = await sb
    .from("events")
    .select("id, title, start_time, location, timezone, coordinator_id, visibility, status")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ev) throw new Error("Event not found");
  const [{ data: member }, { data: isAdmin }] = await Promise.all([
    context.supabase.rpc("is_workspace_member", { _user_id: context.userId, _coord_id: ev.coordinator_id }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  // Same message as a missing event: don't confirm to a stranger that this
  // id is someone's private event.
  if (!member && !isAdmin) throw new Error("Event not found");
  return ev as EventForInvite;
}

async function sendInviteEmails(
  ev: EventForInvite,
  invites: { email: string; token: string }[],
  message: string | null,
  fromName: string | null,
) {
  if (invites.length === 0) return { sent: 0, simulated: 0, failed: 0 };
  const { privateInviteTemplate } = await import("@/lib/email-templates");
  const { sendAndLogEmails } = await import("@/lib/platform-mailer.server");
  const base = await origin();
  const res = await sendAndLogEmails(
    invites.map(({ email, token }) => {
      const tpl = privateInviteTemplate({
        event: ev,
        acceptUrl: `${base}/private-invite/${token}`,
        message,
        fromName,
      });
      return {
        message: { to: email, subject: tpl.subject, html: tpl.html, text: tpl.text },
        log: { coordinator_id: ev.coordinator_id, event_id: ev.id, type: "invitation" as const },
      };
    }),
  );
  return { sent: res.sent, simulated: res.simulated, failed: res.failed };
}

async function displayName(userId: string): Promise<string | null> {
  const sb = await admin();
  const { data } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return (data?.display_name as string | undefined) ?? null;
}

/** An account's own invite rows for an event: by user_id OR by its email.
 *  Two parameterized queries rather than one `.or()` string -- the email
 *  comes from the JWT and may legally contain characters (commas, parens in
 *  a quoted local part) that are syntax in PostgREST's or-filter grammar. */
async function myInviteRows(eventId: string, userId: string, email: string | null) {
  const sb = await admin();
  const cols = "id, status, email, user_id";
  const [byUser, byEmail] = await Promise.all([
    sb.from("event_invites").select(cols).eq("event_id", eventId).eq("user_id", userId),
    email ? sb.from("event_invites").select(cols).eq("event_id", eventId).eq("email", email) : Promise.resolve({ data: [] }),
  ]);
  const rows = new Map<string, { id: string; status: InviteStatus }>();
  for (const r of [...(byUser.data ?? []), ...(byEmail.data ?? [])]) rows.set(r.id, r);
  return [...rows.values()];
}

// ---------------------------------------------------------------------------
// Coordinator side
// ---------------------------------------------------------------------------

export const inviteGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        emails: z.array(z.string().max(320)).min(1).max(MAX_INVITES_PER_CALL),
        message: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ev = await assertCanManage(context, data.event_id);
    if (ev.visibility !== "private") {
      throw new Error("Make the event private before inviting guests -- public and unlisted events don't need invites");
    }
    const { valid, invalid } = normalizeEmails(data.emails);
    const sb = await admin();
    if (valid.length === 0) return { results: [], invalid, sent: 0, simulated: 0, failed: 0 };
    const { data: existingRows, error } = await sb
      .from("event_invites")
      .select("id, email, user_id, status")
      .eq("event_id", ev.id)
      .in("email", valid);
    if (error) throw new Error(error.message);
    const existing = new Map<string, { id: string; user_id: string | null; status: InviteStatus }>(
      (existingRows ?? []).map((r: { id: string; email: string; user_id: string | null; status: InviteStatus }) => [
        r.email,
        r,
      ]),
    );

    const results: { email: string; outcome: "invited" | "already_guest" | "approved_request" }[] = [];
    const toSend: { email: string; token: string }[] = [];
    for (const email of valid) {
      const row = existing.get(email);
      if (row?.status === "accepted") {
        results.push({ email, outcome: "already_guest" });
        continue;
      }
      if (row?.status === "requested" && row.user_id) {
        // They already asked; inviting them is the same as approving.
        const { error: upErr } = await sb
          .from("event_invites")
          .update({ status: "accepted", responded_at: new Date().toISOString(), invited_by: context.userId })
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        results.push({ email, outcome: "approved_request" });
        continue;
      }
      const { token, hash } = await newToken();
      const fields = {
        token_hash: hash,
        status: "pending",
        invited_by: context.userId,
        message: data.message ?? null,
        responded_at: null,
      };
      const { error: wErr } = row
        ? await sb.from("event_invites").update(fields).eq("id", row.id)
        : await sb.from("event_invites").insert({ event_id: ev.id, email, ...fields });
      if (wErr) throw new Error(wErr.message);
      toSend.push({ email, token });
      results.push({ email, outcome: "invited" });
    }
    const delivery = await sendInviteEmails(ev, toSend, data.message ?? null, await displayName(context.userId));
    return { results, invalid, ...delivery };
  });

export const listGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManage(context, data.event_id);
    // Read through the caller's own RLS ("Workspace manages invites for own
    // events" / admin), not the service role -- belt and braces.
    // biome-ignore lint/suspicious/noExplicitAny: event_invites not in generated types yet
    const { data: rows, error } = await (context.supabase as any)
      .from("event_invites")
      .select("id, event_id, email, user_id, status, message, created_at, responded_at")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as InviteRow[];
    const userIds = [...new Set(list.map((r) => r.user_id).filter((v): v is string => !!v))];
    const names = new Map<string, string>();
    if (userIds.length) {
      const sb = await admin();
      const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", userIds);
      for (const p of profs ?? []) if (p.display_name) names.set(p.id, p.display_name);
    }
    return list.map((r) => ({ ...r, name: r.user_id ? (names.get(r.user_id) ?? null) : null }));
  });

export const updateGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        invite_id: z.string().uuid(),
        action: z.enum(["approve", "decline", "revoke", "resend"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: inv, error } = await sb
      .from("event_invites")
      .select("id, event_id, email, user_id, status, message")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invite not found");
    const ev = await assertCanManage(context, inv.event_id);
    const t = coordinatorTransition(inv.status as InviteStatus, data.action, !!inv.email);
    if ("error" in t) throw new Error(t.error);

    const patch: Record<string, unknown> = { status: t.next, responded_at: new Date().toISOString() };
    let token: string | null = null;
    if (t.newToken) {
      const nt = await newToken();
      token = nt.token;
      patch.token_hash = nt.hash;
      patch.responded_at = null;
      patch.invited_by = context.userId;
    }
    // Optimistic: only if the row is still in the state we decided on.
    const { data: updated, error: upErr } = await sb
      .from("event_invites")
      .update(patch)
      .eq("id", inv.id)
      .eq("status", inv.status)
      .select("id");
    if (upErr) throw new Error(upErr.message);
    if (!updated?.length) throw new Error("This entry changed while you were looking at it -- refresh and try again");

    if (token && inv.email) {
      await sendInviteEmails(ev, [{ email: inv.email, token }], inv.message ?? null, await displayName(context.userId));
    }
    if (data.action === "approve" && inv.email) {
      const { accessApprovedTemplate } = await import("@/lib/email-templates");
      const { sendAndLogEmails } = await import("@/lib/platform-mailer.server");
      const tpl = accessApprovedTemplate({ event: ev, eventUrl: `${await origin()}/events/${ev.id}` });
      await sendAndLogEmails([
        {
          message: { to: inv.email, subject: tpl.subject, html: tpl.html, text: tpl.text },
          log: { coordinator_id: ev.coordinator_id, event_id: ev.id, type: "invitation", recipient_user_id: inv.user_id },
        },
      ]);
    }
    return { status: t.next };
  });

// ---------------------------------------------------------------------------
// Guest side
// ---------------------------------------------------------------------------

async function inviteByToken(token: string) {
  const sb = await admin();
  const { data, error } = await sb
    .from("event_invites")
    .select("id, event_id, email, user_id, status")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; event_id: string; email: string | null; user_id: string | null; status: InviteStatus } | null;
}

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const acceptPrivateInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const inv = await inviteByToken(data.token);
    if (!inv) return { ok: false as const, reason: "invalid" as const };
    const callerEmail = (context.claims as { email?: string }).email ?? null;
    const decision = acceptDecision(inv, { id: context.userId, email: callerEmail });
    if (!decision.ok) return { ok: false as const, reason: decision.reason, hint: decision.hint ?? null };
    if (decision.alreadyAccepted) return { ok: true as const, event_id: inv.event_id };

    const sb = await admin();
    // One row per (event, user): drop any access REQUEST this account made
    // for the same event -- the invite supersedes it.
    await sb
      .from("event_invites")
      .delete()
      .eq("event_id", inv.event_id)
      .eq("user_id", context.userId)
      .neq("id", inv.id)
      .neq("status", "accepted");
    const { data: updated, error } = await sb
      .from("event_invites")
      .update({ status: "accepted", user_id: context.userId, responded_at: new Date().toISOString() })
      .eq("id", inv.id)
      .eq("status", inv.status)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) return { ok: false as const, reason: "invalid" as const };
    return { ok: true as const, event_id: inv.event_id };
  });

export const declinePrivateInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const inv = await inviteByToken(data.token);
    if (!inv) return { ok: false as const, reason: "invalid" as const };
    const callerEmail = (context.claims as { email?: string }).email ?? null;
    const decision = acceptDecision(inv, { id: context.userId, email: callerEmail });
    if (!decision.ok) return { ok: false as const, reason: decision.reason, hint: decision.hint ?? null };
    const sb = await admin();
    // Same one-row-per-(event, user) rule as accepting.
    await sb
      .from("event_invites")
      .delete()
      .eq("event_id", inv.event_id)
      .eq("user_id", context.userId)
      .neq("id", inv.id)
      .eq("status", "requested");
    const { error } = await sb
      .from("event_invites")
      .update({ status: "declined", user_id: context.userId, responded_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * What a SIGNED-IN caller who can't read an event is allowed to know about
 * it, for the gated event page. Signed-out visitors never reach this: they
 * get one "not found, or private -- sign in" page for both cases, so a UUID
 * can't be used as an existence oracle without an account.
 */
export const getMyEventAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Can the caller read it under RLS? Then there is nothing to gate.
    const { data: readable } = await context.supabase.from("events").select("id").eq("id", data.event_id).maybeSingle();
    if (readable) return { state: "granted" as const };
    const sb = await admin();
    const { data: ev } = await sb
      .from("events")
      .select("id, status, visibility")
      .eq("id", data.event_id)
      .maybeSingle();
    if (!ev || ev.status !== "approved" || ev.visibility !== "private") return { state: "not_found" as const };
    const callerEmail = ((context.claims as { email?: string }).email ?? "").toLowerCase() || null;
    const mine = await myInviteRows(data.event_id, context.userId, callerEmail);
    const has = (s: InviteStatus) => mine.some((r) => r.status === s);
    if (has("pending")) return { state: "invited_pending" as const };
    if (has("requested")) return { state: "requested" as const };
    if (has("revoked") || has("declined")) return { state: "closed" as const };
    return { state: "can_request" as const };
  });

export const requestEventAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ event_id: z.string().uuid(), message: z.string().max(2000).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: ev } = await sb
      .from("events")
      .select("id, title, start_time, location, timezone, coordinator_id, visibility, status")
      .eq("id", data.event_id)
      .maybeSingle();
    if (!ev || ev.status !== "approved" || ev.visibility !== "private") throw new Error("Event not found");
    const email = ((context.claims as { email?: string }).email ?? "").toLowerCase() || null;
    const existing = await myInviteRows(ev.id, context.userId, email);
    if (existing.length > 0) {
      // Already invited, requested, accepted, declined or revoked: a new
      // request can't reopen a closed door or duplicate a pending one.
      return { state: existing[0].status };
    }
    const { error } = await sb.from("event_invites").insert({
      event_id: ev.id,
      user_id: context.userId,
      email,
      status: "requested",
      message: data.message ?? null,
    });
    if (error) throw new Error(error.message);

    // Tell the coordinator. Best-effort: a mail failure must not lose the
    // request, which is already saved and visible in the guest list.
    try {
      const { data: owner } = await sb.auth.admin.getUserById(ev.coordinator_id);
      const to = owner?.user?.email as string | undefined;
      if (to) {
        const { accessRequestedTemplate } = await import("@/lib/email-templates");
        const { sendAndLogEmails } = await import("@/lib/platform-mailer.server");
        const who = (await displayName(context.userId)) ?? (email ? maskEmail(email) : "Someone");
        const tpl = accessRequestedTemplate({
          event: ev,
          requester: who,
          message: data.message ?? null,
          manageUrl: `${await origin()}/events/${ev.id}/manage`,
        });
        await sendAndLogEmails([
          {
            message: { to, subject: tpl.subject, html: tpl.html, text: tpl.text },
            log: { coordinator_id: ev.coordinator_id, event_id: ev.id, type: "invitation" },
          },
        ]);
      }
    } catch (e) {
      console.error("[private-events] access request notification failed", e);
    }
    return { state: "requested" as const };
  });
