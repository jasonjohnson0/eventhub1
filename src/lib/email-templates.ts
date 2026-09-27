// Email templates. invitationTemplate is wired to a real sender via
// communications.functions.ts; the rest return plain HTML/text strings
// still awaiting their own call site.

import { safeTimeZone } from "./timezone.ts";

export type EventLite = {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
  /** IANA zone the event is scheduled in. Optional only so an old caller
   *  can't crash a send; every current caller passes it. */
  timezone?: string | null;
};

/** "Saturday, September 19, 6:00 PM CDT" -- in the EVENT's zone, labelled.
 *  This used to format with no zone at all, which on the server means the
 *  server's zone: on Vercel (UTC) every reminder read 11:00 PM for a 6 PM
 *  Chicago event. Neither the sender's nor the recipient's zone is right for
 *  an in-person event; the event's own is, and the label removes doubt.
 *  en-US is pinned so the server's default locale can't change the wording. */
export const fmtDate = (iso: string, timeZone?: string | null) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeTimeZone(timeZone ?? "UTC"),
    timeZoneName: "short",
  });

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;background:#fff;color:#111;padding:24px;max-width:600px;margin:auto">
  <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
  ${body}
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
  <p style="font-size:12px;color:#888">Sent by EventHub</p>
  </body></html>`;
}

export function invitationTemplate(opts: {
  event: EventLite;
  invitationUrl: string;
  customMessage?: string | null;
  fromName?: string | null;
}) {
  const { event, invitationUrl, customMessage, fromName } = opts;
  const subject = `You're invited: ${event.title}`;
  const html = shell(
    `You're invited to ${event.title}`,
    `
    ${fromName ? `<p>${fromName} invited you.</p>` : ""}
    ${customMessage ? `<p style="white-space:pre-line">${escape(customMessage)}</p>` : ""}
    <p><strong>When:</strong> ${fmtDate(event.start_time, event.timezone)}</p>
    ${event.location ? `<p><strong>Where:</strong> ${escape(event.location)}</p>` : ""}
    <p><a href="${invitationUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View event & RSVP</a></p>`,
  );
  const text = `You're invited to ${event.title}\nWhen: ${fmtDate(event.start_time, event.timezone)}\n${event.location ? "Where: " + event.location + "\n" : ""}${customMessage ? "\n" + customMessage + "\n" : ""}\nRSVP: ${invitationUrl}`;
  return { subject, html, text };
}

/** Invite to a PRIVATE event (gap-closure phase 3). The link carries a
 *  one-time bearer token; accepting also requires signing in with this same
 *  address, so a forwarded email can't be used by someone else. */
export function privateInviteTemplate(opts: {
  event: EventLite;
  acceptUrl: string;
  message?: string | null;
  fromName?: string | null;
}) {
  const { event, acceptUrl, message, fromName } = opts;
  const subject = `Private invitation: ${event.title}`;
  const html = shell(
    `You're invited to a private event`,
    `
    <h2 style="font-size:16px">${escape(event.title)}</h2>
    ${fromName ? `<p>${escape(fromName)} invited you. This event is invite-only.</p>` : "<p>This event is invite-only.</p>"}
    ${message ? `<p style="white-space:pre-line">${escape(message)}</p>` : ""}
    <p><strong>When:</strong> ${fmtDate(event.start_time, event.timezone)}</p>
    ${event.location ? `<p><strong>Where:</strong> ${escape(event.location)}</p>` : ""}
    <p><a href="${acceptUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Accept invitation</a></p>
    <p style="font-size:12px;color:#666">Sign in (or create an account) with this email address to accept. The link is personal -- please don't forward it.</p>`,
  );
  const text = `You're invited to a private event: ${event.title}\nWhen: ${fmtDate(event.start_time, event.timezone)}\n${event.location ? "Where: " + event.location + "\n" : ""}${message ? "\n" + message + "\n" : ""}\nAccept (sign in with this email address): ${acceptUrl}`;
  return { subject, html, text };
}

/** Sent to a guest when the coordinator approves their access request. */
export function accessApprovedTemplate(opts: { event: EventLite; eventUrl: string }) {
  const subject = `You're in: ${opts.event.title}`;
  const html = shell(
    `Your access request was approved`,
    `<h2 style="font-size:16px">${escape(opts.event.title)}</h2>
     <p><strong>When:</strong> ${fmtDate(opts.event.start_time, opts.event.timezone)}</p>
     <p><a href="${opts.eventUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View event</a></p>`,
  );
  return { subject, html, text: `${subject}\n${fmtDate(opts.event.start_time, opts.event.timezone)}\n${opts.eventUrl}` };
}

/** Sent to the coordinator when someone asks for access to a private event. */
export function accessRequestedTemplate(opts: { event: EventLite; requester: string; message?: string | null; manageUrl: string }) {
  const subject = `Access request: ${opts.event.title}`;
  const html = shell(
    subject,
    `<p><strong>${escape(opts.requester)}</strong> asked to join your private event <strong>${escape(opts.event.title)}</strong>.</p>
     ${opts.message ? `<p style="white-space:pre-line">${escape(opts.message)}</p>` : ""}
     <p><a href="${opts.manageUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Review guest list</a></p>`,
  );
  return { subject, html, text: `${opts.requester} asked to join ${opts.event.title}.\n${opts.message ?? ""}\nReview: ${opts.manageUrl}` };
}

export function rsvpConfirmationTemplate(opts: { event: EventLite; status: string }) {
  const subject = `RSVP confirmed: ${opts.event.title}`;
  const html = shell(
    `You're ${opts.status} — ${opts.event.title}`,
    `<p><strong>When:</strong> ${fmtDate(opts.event.start_time, opts.event.timezone)}</p>
     ${opts.event.location ? `<p><strong>Where:</strong> ${escape(opts.event.location)}</p>` : ""}
     <p>We'll remind you before it starts.</p>`,
  );
  return { subject, html, text: `${subject}\n${fmtDate(opts.event.start_time, opts.event.timezone)}` };
}

export function reminderTemplate(opts: { event: EventLite; when: "7d" | "1d" | "1h" }) {
  const label = opts.when === "7d" ? "next week" : opts.when === "1d" ? "tomorrow" : "in 1 hour";
  const subject = `Reminder: ${opts.event.title} — ${label}`;
  const html = shell(
    `Coming up ${label}`,
    `<h2 style="font-size:16px">${escape(opts.event.title)}</h2>
     <p><strong>When:</strong> ${fmtDate(opts.event.start_time, opts.event.timezone)}</p>
     ${opts.event.location ? `<p><strong>Where:</strong> ${escape(opts.event.location)}</p>` : ""}`,
  );
  return { subject, html, text: `${subject}\n${fmtDate(opts.event.start_time, opts.event.timezone)}` };
}

export function updateTemplate(opts: { event: EventLite; message: string; cancelled?: boolean }) {
  const subject = opts.cancelled
    ? `Cancelled: ${opts.event.title}`
    : `Update: ${opts.event.title}`;
  const html = shell(
    subject,
    `<p style="white-space:pre-line">${escape(opts.message)}</p>
     <p><strong>Event:</strong> ${escape(opts.event.title)} — ${fmtDate(opts.event.start_time, opts.event.timezone)}</p>`,
  );
  return { subject, html, text: `${subject}\n${opts.message}` };
}

export function thankYouTemplate(opts: { event: EventLite }) {
  const subject = `Thanks for attending ${opts.event.title}`;
  const html = shell(
    "Thanks for coming!",
    `<p>We appreciate you joining <strong>${escape(opts.event.title)}</strong>.</p>
     <p>Watch for future events on EventHub.</p>`,
  );
  return { subject, html, text: subject };
}

export function ticketRefundTemplate(opts: { event: EventLite; amountCents: number; reason: "event_cancelled" | "coordinator_refund" }) {
  const amount = `$${(opts.amountCents / 100).toFixed(2)}`;
  const subject =
    opts.reason === "event_cancelled"
      ? `${opts.event.title} was cancelled — you've been refunded`
      : `Your ticket for ${opts.event.title} was refunded`;
  const body =
    opts.reason === "event_cancelled"
      ? `<p>The event <strong>${escape(opts.event.title)}</strong> (${fmtDate(opts.event.start_time, opts.event.timezone)}) has been cancelled by its organizer.</p>
         <p>You've been refunded <strong>${amount}</strong>. It should appear on your original payment method within 5–10 business days.</p>`
      : `<p>Your ticket for <strong>${escape(opts.event.title)}</strong> has been refunded.</p>
         <p>Amount refunded: <strong>${amount}</strong>. It should appear on your original payment method within 5–10 business days.</p>`;
  const html = shell(subject, body);
  return { subject, html, text: `${subject}\n${amount} refunded.` };
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}