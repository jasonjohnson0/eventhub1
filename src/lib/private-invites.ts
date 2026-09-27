/**
 * Pure rules for private-event invites (gap-closure phase 3). No I/O and no
 * alias imports, so tests/unit/private-invites.mjs imports this file directly.
 * The server functions in private-events.functions.ts do the reads/writes
 * and call these to decide what's allowed.
 *
 * The database is the real boundary (RLS on events + event_invites, see
 * migration 20260927110100); these rules decide the *workflow* on top of it:
 * which transitions a coordinator may make, and whether a given signed-in
 * account may accept a given invite.
 */

export type InviteStatus = "pending" | "requested" | "accepted" | "declined" | "revoked";
export type CoordinatorAction = "approve" | "decline" | "revoke" | "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased, trimmed, de-duplicated, valid addresses only. Returns the
 *  rejects too, so the UI can say which lines it couldn't use. */
export function normalizeEmails(input: string[]): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const raw of input) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (EMAIL_RE.test(e) && e.length <= 254) valid.add(e);
    else invalid.push(raw.trim());
  }
  return { valid: [...valid], invalid };
}

/** "pat@example.com" -> "p••@example.com": enough for someone to recognise
 *  which of their addresses an invite went to, without disclosing the
 *  address to whoever is holding the link. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

/** What a coordinator action does to an invite in a given state, or why it
 *  can't. `resend` issues a fresh token (the old link stops working). */
export function coordinatorTransition(
  current: InviteStatus,
  action: CoordinatorAction,
  hasEmail: boolean,
): { next: InviteStatus; newToken: boolean } | { error: string } {
  switch (action) {
    case "approve":
      // Only an access REQUEST can be approved -- an emailed invite is
      // accepted by the guest, never on their behalf.
      return current === "requested" ? { next: "accepted", newToken: false } : { error: "Only access requests can be approved" };
    case "decline":
      return current === "requested" || current === "pending"
        ? { next: "declined", newToken: false }
        : { error: `Can't decline an invite that is ${current}` };
    case "revoke":
      return current === "revoked" ? { error: "Already revoked" } : { next: "revoked", newToken: false };
    case "resend":
      if (!hasEmail) return { error: "This entry has no email address to send to" };
      return current === "accepted" ? { error: "Already accepted -- nothing to resend" } : { next: "pending", newToken: true };
  }
}

export type AcceptDecision =
  | { ok: true; alreadyAccepted: boolean }
  | { ok: false; reason: "revoked" | "claimed" | "wrong_account" | "no_email"; hint?: string };

/**
 * May this signed-in account accept this invite?
 *  - revoked: never (the coordinator withdrew it);
 *  - accepted by someone else: never (links are single-account);
 *  - an emailed invite binds to its address: the account's email must match,
 *    so a forwarded link is useless to anyone else;
 *  - a declined invite can still be accepted by its rightful recipient
 *    (people change their minds) until the coordinator revokes it.
 */
export function acceptDecision(
  invite: { status: InviteStatus; email: string | null; user_id: string | null },
  caller: { id: string; email: string | null | undefined },
): AcceptDecision {
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "accepted") {
    return invite.user_id === caller.id ? { ok: true, alreadyAccepted: true } : { ok: false, reason: "claimed" };
  }
  if (invite.user_id && invite.user_id !== caller.id) return { ok: false, reason: "claimed" };
  if (invite.email) {
    const mine = (caller.email ?? "").trim().toLowerCase();
    if (!mine) return { ok: false, reason: "no_email", hint: maskEmail(invite.email) };
    if (mine !== invite.email) return { ok: false, reason: "wrong_account", hint: maskEmail(invite.email) };
  }
  return { ok: true, alreadyAccepted: false };
}
